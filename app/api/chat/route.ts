import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createIdGenerator,
  generateText,
  stepCountIs,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { createChatTools } from "@/lib/ai/chat-tools";
import {
  appendChatTranscript,
  extractMemoriesFromUserText,
  loadChatSession,
  recomputePlannerState,
  saveChatSession,
  withChatLock,
} from "@/lib/ai/chat-store";

export const maxDuration = 60;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const messageIdGenerator = createIdGenerator({
  prefix: "msg",
  size: 16,
});

const MAX_MESSAGES_BEFORE_COMPACTION = 30;
const MESSAGES_TO_KEEP_AFTER_COMPACTION = 18;

function normalizeChatId(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return `chat-${Date.now()}`;
}

function normalizeContext(value: unknown): string | null {
  if (typeof value === "string") return value;
  return null;
}

function normalizeIncomingMessages(value: unknown): UIMessage[] {
  if (Array.isArray(value)) return value as UIMessage[];
  return [];
}

function normalizeIncomingMessage(value: unknown): UIMessage | null {
  if (value && typeof value === "object") return value as UIMessage;
  return null;
}

function extractTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n");
}

async function compactMessages({
  messages,
  existingSummary,
  summaryCount,
}: {
  messages: UIMessage[];
  existingSummary: string | null;
  summaryCount: number;
}): Promise<{ messages: UIMessage[]; summary: string | null; summaryCount: number; compacted: boolean }> {
  if (messages.length <= MAX_MESSAGES_BEFORE_COMPACTION) {
    return { messages, summary: existingSummary, summaryCount, compacted: false };
  }

  const olderMessages = messages.slice(0, -MESSAGES_TO_KEEP_AFTER_COMPACTION);
  const recentMessages = messages.slice(-MESSAGES_TO_KEEP_AFTER_COMPACTION);

  const conversationText = olderMessages
    .map((m) => {
      const role = m.role === "assistant" ? "Assistant" : "User";
      const text = extractTextFromMessage(m);
      return text ? `${role}: ${text}` : null;
    })
    .filter(Boolean)
    .join("\n\n");

  let newSummary: string;
  try {
    const { text } = await generateText({
      model: openrouter("z-ai/glm-4.5-air:free"),
      messages: [
        {
          role: "user" as const,
          content: `Summarize this conversation between a student and their academic AI assistant. Preserve: courses mentioned, assignments discussed, deadlines named, study strategies, and any personal context. Be concise but complete — this summary will replace the original messages as context.\n\n${existingSummary ? `Prior summary:\n${existingSummary}\n\n` : ""}Messages to summarize:\n${conversationText}`,
        },
      ],
    });
    newSummary = text.trim();
  } catch {
    // Fallback: text-trim if LLM fails
    const lines = olderMessages
      .map((m) => {
        const role = m.role === "assistant" ? "Assistant" : "User";
        const text = extractTextFromMessage(m);
        return text ? `- ${role}: ${text.replace(/\s+/g, " ").slice(0, 220)}` : null;
      })
      .filter(Boolean) as string[];
    newSummary = [existingSummary, lines.slice(-20).join("\n")]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 3200);
  }

  const summaryMessage: UIMessage = {
    id: `summary-${Date.now()}`,
    role: "system",
    parts: [{ type: "text", text: `Conversation summary (${summaryCount + 1} compaction${summaryCount + 1 > 1 ? "s" : ""}):\n${newSummary}` }],
  };

  return {
    messages: [summaryMessage, ...recentMessages],
    summary: newSummary,
    summaryCount: summaryCount + 1,
    compacted: true,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chatId = url.searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId is required." }, { status: 400 });
  }

  const storedSession = await loadChatSession(chatId);
  const cleanMessages = storedSession.messages.filter(
    (m) => Array.isArray(m.parts) && m.parts.length > 0
  );
  const validatedMessages: UIMessage[] =
    cleanMessages.length === 0
      ? []
      : await validateUIMessages<UIMessage>({
          messages: cleanMessages,
        });

  return Response.json({
    chatId,
    context: storedSession.contextData,
    summary: storedSession.summary,
    summaryCount: storedSession.summaryCount,
    messageCount: validatedMessages.length,
    compactionThreshold: MAX_MESSAGES_BEFORE_COMPACTION,
    messages: validatedMessages,
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const chatId = normalizeChatId(body.id);
  const context = normalizeContext(body.context);
  const incomingMessages = normalizeIncomingMessages(body.messages);
  const incomingMessage = normalizeIncomingMessage(body.message);

  return withChatLock(chatId, async () => {
    const startedAt = Date.now();
    const tools = createChatTools({ chatId });
    const storedSession = await loadChatSession(chatId);

    let mergedMessages: UIMessage[] = storedSession.messages;
    if (incomingMessages.length > 0) {
      mergedMessages = incomingMessages;
    } else if (incomingMessage) {
      mergedMessages = [...storedSession.messages, incomingMessage];
    }

    if (incomingMessage?.role === "user") {
      const extracted = await extractMemoriesFromUserText({
        chatId,
        text: extractTextFromMessage(incomingMessage),
      });
      if (extracted > 0) {
        await appendChatTranscript(chatId, [
          {
            type: "event",
            event: "memory-auto-extracted",
            details: { count: extracted },
          },
        ]);
      }

      await appendChatTranscript(chatId, [
        {
          type: "message",
          role: "user",
          message: incomingMessage,
        },
      ]);
    }

    const planner = await recomputePlannerState(chatId);
    if (planner.changed && planner.eventType) {
      await appendChatTranscript(chatId, [
        {
          type: "event",
          event: planner.eventType,
          details: {
            dueTodayCount: planner.snapshot.dueToday.length,
            overdueCount: planner.snapshot.overdue.length,
            announcementsCount: planner.snapshot.recentAnnouncements.length,
            todayEventsCount: planner.snapshot.todayEvents.length,
          },
        },
      ]);
    }

    const validatedMessages = await validateUIMessages<UIMessage>({
      messages: mergedMessages.filter(
        (m) => Array.isArray(m.parts) && m.parts.length > 0
      ),
    });

    const compacted = await compactMessages({
      messages: validatedMessages,
      existingSummary: storedSession.summary,
      summaryCount: storedSession.summaryCount,
    });

    if (compacted.compacted) {
      await appendChatTranscript(chatId, [
        {
          type: "event",
          event: "context-compacted",
          details: {
            originalMessageCount: validatedMessages.length,
            compactedMessageCount: compacted.messages.length,
            summaryCount: compacted.summaryCount,
          },
        },
      ]);
    }

    const modelMessages = await convertToModelMessages(compacted.messages, {
      tools,
    });

    const result = streamText({
      model: openrouter("z-ai/glm-4.5-air:free"),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(8),
      system: `You are Personal Canvas, an academic planning AI orchestrator.
Use tools whenever the user asks for concrete, up-to-date course data.
Prefer tool-grounded answers over assumptions.
When tool output includes "uiTarget", summarize it clearly so the UI can render and the user can understand.
If context is missing for the request, ask targeted follow-up questions.

Current context:
${context ?? "No context provided."}

Reactive planner snapshot:
- due today: ${planner.snapshot.dueToday.length}
- overdue: ${planner.snapshot.overdue.length}
- recent announcements: ${planner.snapshot.recentAnnouncements.length}
- today's events: ${planner.snapshot.todayEvents.length}`,
    });

    result.consumeStream();

    return result.toUIMessageStreamResponse({
      originalMessages: compacted.messages,
      generateMessageId: messageIdGenerator,
      onFinish: async ({ messages: finalMessages, responseMessage }) => {
        await saveChatSession({
          chatId,
          contextData: context,
          summary: compacted.summary,
          summaryCount: compacted.summaryCount,
          messages: finalMessages,
        });

        await appendChatTranscript(chatId, [
          {
            type: "message",
            role: "assistant",
            message: responseMessage,
          },
          {
            type: "event",
            event: "turn-finished",
            details: {
              messageCount: finalMessages.length,
              durationMs: Date.now() - startedAt,
            },
          },
        ]);
      },
    });
  });
}
