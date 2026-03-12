import { appendFile, mkdir } from "fs/promises";
import path from "path";
import type { UIMessage } from "ai";
import { query } from "@/lib/db";
import { embedText } from "@/lib/ai/embeddings";

const transcriptDirectory =
  process.env.CHAT_TRANSCRIPT_MIRROR_DIR ?? path.join(process.cwd(), ".chats");

let chatTablesInitPromise: Promise<void> | undefined;
const tableExistsCache = new Map<string, boolean>();
const chatLockMap = new Map<string, Promise<void>>();

export type ChatSessionRecord = {
  id: string;
  contextData: string | null;
  messages: UIMessage[];
  summary: string | null;
  summaryCount: number;
};

type TranscriptEntry =
  | {
      type: "message";
      role: "user" | "assistant";
      message: unknown;
    }
  | {
      type: "event";
      event: string;
      details?: Record<string, unknown>;
    };

type PlannerSnapshot = {
  dueToday: unknown[];
  overdue: unknown[];
  recentAnnouncements: unknown[];
  todayEvents: unknown[];
};

function sanitizeChatId(chatId: string): string {
  return chatId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function transcriptFilePath(chatId: string): string {
  return path.join(transcriptDirectory, `${sanitizeChatId(chatId)}.jsonl`);
}

async function tableExists(tableName: string): Promise<boolean> {
  if (tableExistsCache.has(tableName)) {
    return tableExistsCache.get(tableName)!;
  }

  const result = await query(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [tableName]
  );

  const exists = Boolean(result.rows[0]?.exists);
  tableExistsCache.set(tableName, exists);
  return exists;
}

async function ensureChatTables(): Promise<void> {
  if (!chatTablesInitPromise) {
    chatTablesInitPromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          context_data TEXT,
          summary TEXT,
          messages JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(
        "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary TEXT"
      );

      await query(
        "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS summary_count INTEGER NOT NULL DEFAULT 0"
      );

      await query(`
        CREATE TABLE IF NOT EXISTS chat_memories (
          id BIGSERIAL PRIMARY KEY,
          chat_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          memory_key TEXT NOT NULL,
          memory_value TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'user',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (chat_id, memory_key)
        )
      `);

      await query(
        `CREATE INDEX IF NOT EXISTS idx_chat_memories_chat_id ON chat_memories(chat_id)`
      );

      await query(`
        CREATE TABLE IF NOT EXISTS chat_planner_state (
          chat_id TEXT PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
          signature TEXT NOT NULL,
          snapshot JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS chat_planner_events (
          id BIGSERIAL PRIMARY KEY,
          chat_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL,
          details JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(
        `CREATE INDEX IF NOT EXISTS idx_chat_planner_events_chat_id ON chat_planner_events(chat_id, created_at DESC)`
      );

      // Embedding support — add memory embedding column (no index: pgvector ivfflat caps at 2000 dims, model outputs 2048)
      await query(`ALTER TABLE chat_memories ADD COLUMN IF NOT EXISTS embedding vector(2048)`);
    })();
  }

  await chatTablesInitPromise;
}

export async function withChatLock<T>(
  chatId: string,
  fn: () => Promise<T>
): Promise<T> {
  const previous = chatLockMap.get(chatId) ?? Promise.resolve();
  let release: (() => void) | undefined;

  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  const queued = previous.then(() => current);
  chatLockMap.set(chatId, queued);

  await previous;
  try {
    return await fn();
  } finally {
    release?.();

    if (chatLockMap.get(chatId) === queued) {
      chatLockMap.delete(chatId);
    }
  }
}

export async function loadChatSession(chatId: string): Promise<ChatSessionRecord> {
  await ensureChatTables();

  const existing = await query(
    "SELECT id, context_data, summary, summary_count, messages FROM chat_sessions WHERE id = $1",
    [chatId]
  );

  if (existing.rowCount === 0) {
    await query(
      `INSERT INTO chat_sessions (id, context_data, summary, summary_count, messages)
       VALUES ($1, NULL, NULL, 0, '[]'::jsonb)`,
      [chatId]
    );

    return {
      id: chatId,
      contextData: null,
      summary: null,
      summaryCount: 0,
      messages: [],
    };
  }

  const row = existing.rows[0] as {
    id: string;
    context_data: string | null;
    summary: string | null;
    summary_count: number;
    messages: unknown;
  };

  return {
    id: row.id,
    contextData: row.context_data,
    summary: row.summary,
    summaryCount: row.summary_count ?? 0,
    messages: Array.isArray(row.messages) ? (row.messages as UIMessage[]) : [],
  };
}

export async function saveChatSession({
  chatId,
  messages,
  contextData,
  summary,
  summaryCount,
}: {
  chatId: string;
  messages: UIMessage[];
  contextData?: string | null;
  summary?: string | null;
  summaryCount?: number;
}): Promise<void> {
  await ensureChatTables();

  await query(
    `INSERT INTO chat_sessions (id, context_data, summary, summary_count, messages, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       context_data = COALESCE(EXCLUDED.context_data, chat_sessions.context_data),
       summary = COALESCE(EXCLUDED.summary, chat_sessions.summary),
       summary_count = GREATEST(EXCLUDED.summary_count, chat_sessions.summary_count),
       messages = EXCLUDED.messages,
       updated_at = NOW()`,
    [chatId, contextData ?? null, summary ?? null, summaryCount ?? 0, JSON.stringify(messages)]
  );
}

export async function appendChatTranscript(
  chatId: string,
  entries: TranscriptEntry[]
): Promise<void> {
  if (entries.length === 0) return;

  await mkdir(transcriptDirectory, { recursive: true });

  const content = entries
    .map((entry) =>
      JSON.stringify({
        ...entry,
        chatId,
        recordedAt: new Date().toISOString(),
      })
    )
    .join("\n");

  await appendFile(transcriptFilePath(chatId), `${content}\n`, "utf8");
}

export async function upsertChatMemory({
  chatId,
  memoryKey,
  memoryValue,
  source = "user",
}: {
  chatId: string;
  memoryKey: string;
  memoryValue: string;
  source?: string;
}): Promise<void> {
  await ensureChatTables();

  // Generate embedding best-effort — don't fail the upsert if embedding fails
  let embeddingLiteral: string | null = null;
  try {
    const vec = await embedText(`${memoryKey}: ${memoryValue}`);
    embeddingLiteral = `[${vec.join(",")}]`;
  } catch {
    // Memory is still saved; vector search will fall back to ILIKE for this row
  }

  await query(
    `INSERT INTO chat_memories (chat_id, memory_key, memory_value, source, embedding, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (chat_id, memory_key) DO UPDATE SET
       memory_value = EXCLUDED.memory_value,
       source = EXCLUDED.source,
       embedding = COALESCE(EXCLUDED.embedding, chat_memories.embedding),
       updated_at = NOW()`,
    [chatId, memoryKey, memoryValue, source, embeddingLiteral]
  );
}

export async function searchChatMemories({
  chatId,
  queryText,
  limit = 8,
}: {
  chatId: string;
  queryText: string;
  limit?: number;
}) {
  await ensureChatTables();

  // Try semantic vector search; fall back to ILIKE if embedding generation fails
  try {
    const vec = await embedText(queryText);
    const vectorLiteral = `[${vec.join(",")}]`;

    // Hybrid: vector similarity for embedded rows, ILIKE keyword for unembedded rows
    const result = await query(
      `SELECT memory_key, memory_value, source, updated_at
       FROM chat_memories
       WHERE chat_id = $1
         AND (
           embedding IS NOT NULL
           OR (memory_key ILIKE $3 OR memory_value ILIKE $3)
         )
       ORDER BY
         CASE WHEN embedding IS NOT NULL THEN embedding <=> $2::vector ELSE 2.0 END ASC,
         updated_at DESC
       LIMIT $4`,
      [chatId, vectorLiteral, `%${queryText}%`, limit]
    );

    return result.rows;
  } catch {
    // Fallback: plain ILIKE
    const result = await query(
      `SELECT memory_key, memory_value, source, updated_at
       FROM chat_memories
       WHERE chat_id = $1
         AND (memory_key ILIKE $2 OR memory_value ILIKE $2)
       ORDER BY updated_at DESC
       LIMIT $3`,
      [chatId, `%${queryText}%`, limit]
    );

    return result.rows;
  }
}

export async function extractMemoriesFromUserText({
  chatId,
  text,
}: {
  chatId: string;
  text: string;
}): Promise<number> {
  const captures: Array<{ key: string; value: string }> = [];

  const nameMatch = text.match(/\bmy name is\s+([a-zA-Z][a-zA-Z\s'-]{1,60})/i);
  if (nameMatch?.[1]) {
    captures.push({ key: "user.name", value: nameMatch[1].trim() });
  }

  const preferMatch = text.match(/\bi prefer\s+(.{3,180})/i);
  if (preferMatch?.[1]) {
    captures.push({
      key: `preference.${Date.now()}`,
      value: preferMatch[1].trim(),
    });
  }

  const rememberMatch = text.match(/\bremember(?: that)?\s+(.{3,220})/i);
  if (rememberMatch?.[1]) {
    captures.push({
      key: `fact.${Date.now()}`,
      value: rememberMatch[1].trim(),
    });
  }

  for (const capture of captures) {
    await upsertChatMemory({
      chatId,
      memoryKey: capture.key,
      memoryValue: capture.value,
      source: "auto-extract",
    });
  }

  return captures.length;
}

async function buildPlannerSnapshot(limit: number): Promise<PlannerSnapshot> {
  const assignmentsTableExists = await tableExists("assignments");
  const announcementsTableExists = await tableExists("announcements");
  const calendarEventsTableExists = await tableExists("calendar_events");

  const dueToday = assignmentsTableExists
    ? (
        await query(
          `SELECT a.id, a.name, a.due_at, c.code AS course_code
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.due_at >= date_trunc('day', NOW())
             AND a.due_at < date_trunc('day', NOW()) + interval '1 day'
           ORDER BY a.due_at ASC
           LIMIT $1`,
          [limit]
        )
      ).rows
    : [];

  const overdue = assignmentsTableExists
    ? (
        await query(
          `SELECT a.id, a.name, a.due_at, c.code AS course_code
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.due_at IS NOT NULL
             AND a.due_at < NOW()
           ORDER BY a.due_at DESC
           LIMIT $1`,
          [limit]
        )
      ).rows
    : [];

  const recentAnnouncements = announcementsTableExists
    ? (
        await query(
          `SELECT a.id, a.title, a.posted_at, c.code AS course_code
           FROM announcements a
           JOIN courses c ON c.id = a.course_id
           ORDER BY a.posted_at DESC NULLS LAST
           LIMIT $1`,
          [limit]
        )
      ).rows
    : [];

  const todayEvents = calendarEventsTableExists
    ? (
        await query(
          `SELECT e.id, e.title, e.start_at, e.end_at, e.workflow_state
           FROM calendar_events e
           WHERE e.start_at >= date_trunc('day', NOW())
             AND e.start_at < date_trunc('day', NOW()) + interval '1 day'
           ORDER BY e.start_at ASC NULLS LAST
           LIMIT $1`,
          [limit]
        )
      ).rows
    : [];

  return {
    dueToday,
    overdue,
    recentAnnouncements,
    todayEvents,
  };
}

export async function recomputePlannerState(chatId: string): Promise<{
  changed: boolean;
  eventType: string | null;
  snapshot: PlannerSnapshot;
}> {
  await ensureChatTables();

  const snapshot = await buildPlannerSnapshot(12);
  const signature = JSON.stringify(snapshot);

  const previous = await query(
    "SELECT signature FROM chat_planner_state WHERE chat_id = $1",
    [chatId]
  );

  const previousSignature = previous.rows[0]?.signature as string | undefined;
  const changed = previousSignature !== signature;
  let eventType: string | null = null;

  if (changed) {
    await query(
      `INSERT INTO chat_planner_state (chat_id, signature, snapshot, updated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (chat_id) DO UPDATE SET
         signature = EXCLUDED.signature,
         snapshot = EXCLUDED.snapshot,
         updated_at = NOW()`,
      [chatId, signature, JSON.stringify(snapshot)]
    );

    eventType = previousSignature ? "planner-updated" : "planner-initialized";
    await query(
      `INSERT INTO chat_planner_events (chat_id, event_type, details)
       VALUES ($1, $2, $3::jsonb)`,
      [
        chatId,
        eventType,
        JSON.stringify({
          dueTodayCount: snapshot.dueToday.length,
          overdueCount: snapshot.overdue.length,
          announcementsCount: snapshot.recentAnnouncements.length,
          todayEventsCount: snapshot.todayEvents.length,
        }),
      ]
    );
  }

  return { changed, eventType, snapshot };
}

export async function listPlannerEvents({
  chatId,
  limit = 10,
}: {
  chatId: string;
  limit?: number;
}) {
  await ensureChatTables();

  const result = await query(
    `SELECT id, event_type, details, created_at
     FROM chat_planner_events
     WHERE chat_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [chatId, limit]
  );

  return result.rows;
}
