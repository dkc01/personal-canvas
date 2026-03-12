import { tool } from "ai";
import { z } from "zod";
import { query } from "@/lib/db";
import {
  listPlannerEvents,
  loadChatSession,
  searchChatMemories,
  upsertChatMemory,
} from "@/lib/ai/chat-store";
import { embedText } from "@/lib/ai/embeddings";

type ToolPayload<T> = {
  uiTarget: string;
  summary: string;
  payload: T;
};

const tableExistsCache = new Map<string, boolean>();

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

async function fetchAnnouncements(limit: number, courseId?: number) {
  if (!(await tableExists("announcements"))) return [];

  if (courseId !== undefined) {
    const result = await query(
      `SELECT id, title, posted_at, html_url
       FROM announcements
       WHERE course_id = $1
       ORDER BY posted_at DESC NULLS LAST
       LIMIT $2`,
      [courseId, limit]
    );
    return result.rows;
  }

  const result = await query(
    `SELECT a.id, a.title, a.posted_at, a.html_url, c.code AS course_code
     FROM announcements a
     JOIN courses c ON c.id = a.course_id
     ORDER BY a.posted_at DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

async function fetchGradeSignal(courseId: number) {
  if (!(await tableExists("course_enrollments"))) return null;

  const result = await query(
    `SELECT current_score, current_grade, final_score, final_grade, last_activity_at
     FROM course_enrollments
     WHERE course_id = $1
     ORDER BY last_activity_at DESC NULLS LAST
     LIMIT 1`,
    [courseId]
  );

  return result.rows[0] ?? null;
}

export function createChatTools({ chatId }: { chatId: string }) {
  return {
    getDashboardSnapshot: tool({
      description:
        "Get dashboard-ready course, deadline, and announcement snapshot data for UI cards.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).default(6),
      }),
      execute: async ({ limit }): Promise<
        ToolPayload<{
          courses: unknown[];
          upcomingAssignments: unknown[];
          announcements: unknown[];
        }>
      > => {
        const courses = await query(
          "SELECT id, name, code, term_name FROM courses ORDER BY id LIMIT $1",
          [limit]
        );

        const assignments = await query(
          `SELECT a.id, a.name, a.due_at, a.points_possible, c.id AS course_id, c.code AS course_code
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.due_at IS NULL OR a.due_at >= NOW()
           ORDER BY a.due_at ASC NULLS LAST
           LIMIT $1`,
          [limit]
        );

        const announcements = await fetchAnnouncements(limit);

        return {
          uiTarget: "dashboard.snapshot",
          summary: `Loaded ${courses.rowCount ?? 0} courses, ${assignments.rowCount ?? 0} upcoming assignments, and ${announcements.length} announcements.`,
          payload: {
            courses: courses.rows,
            upcomingAssignments: assignments.rows,
            announcements,
          },
        };
      },
    }),

    getCourseOverview: tool({
      description:
        "Get a complete course overview for UI, including assignments, modules, announcements, and grade signals.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        assignmentLimit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ courseId, assignmentLimit }): Promise<
        ToolPayload<{
          course: unknown;
          assignments: unknown[];
          modules: unknown[];
          announcements: unknown[];
          gradeSignal: unknown;
        }>
      > => {
        const courseResult = await query(
          `SELECT id, name, code, term_name, syllabus_html, start_date, end_date
           FROM courses
           WHERE id = $1`,
          [courseId]
        );

        const course = courseResult.rows[0];
        if (!course) {
          throw new Error(`Course ${courseId} not found.`);
        }

        const assignments = await query(
          `SELECT id, name, due_at, points_possible, workflow_state
           FROM assignments
           WHERE course_id = $1
           ORDER BY due_at ASC NULLS LAST
           LIMIT $2`,
          [courseId, assignmentLimit]
        );

        const modules = await query(
          `SELECT m.id, m.name, m.position, COUNT(mi.id)::int AS items_count
           FROM modules m
           LEFT JOIN module_items mi ON mi.module_id = m.id
           WHERE m.course_id = $1
           GROUP BY m.id, m.name, m.position
           ORDER BY m.position`,
          [courseId]
        );

        const announcements = await fetchAnnouncements(5, courseId);
        const gradeSignal = await fetchGradeSignal(courseId);

        return {
          uiTarget: "course.overview",
          summary: `Loaded course overview for ${course.code} with ${assignments.rowCount ?? 0} assignments and ${modules.rowCount ?? 0} modules.`,
          payload: {
            course,
            assignments: assignments.rows,
            modules: modules.rows,
            announcements,
            gradeSignal,
          },
        };
      },
    }),

    getCourseTimeline: tool({
      description:
        "Fetch timeline context for a course from calendar events, quizzes, and discussions.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ courseId, limit }): Promise<
        ToolPayload<{
          events: unknown[];
          quizzes: unknown[];
          discussions: unknown[];
        }>
      > => {
        const events =
          (await tableExists("calendar_events")) &&
          (
            await query(
              `SELECT id, title, start_at, end_at, html_url
               FROM calendar_events
               WHERE course_id = $1
               ORDER BY start_at ASC NULLS LAST
               LIMIT $2`,
              [courseId, limit]
            )
          ).rows;

        const quizzes =
          (await tableExists("quizzes")) &&
          (
            await query(
              `SELECT id, title, due_at, unlock_at, lock_at, html_url
               FROM quizzes
               WHERE course_id = $1
               ORDER BY due_at ASC NULLS LAST
               LIMIT $2`,
              [courseId, limit]
            )
          ).rows;

        const discussions =
          (await tableExists("discussions")) &&
          (
            await query(
              `SELECT id, title, posted_at, todo_date, lock_at, html_url
               FROM discussions
               WHERE course_id = $1
               ORDER BY posted_at DESC NULLS LAST
               LIMIT $2`,
              [courseId, limit]
            )
          ).rows;

        return {
          uiTarget: "course.timeline",
          summary: "Loaded course timeline from events, quizzes, and discussions.",
          payload: {
            events: events || [],
            quizzes: quizzes || [],
            discussions: discussions || [],
          },
        };
      },
    }),

    getCourseResources: tool({
      description:
        "Fetch pages and files for a course to support study resource lookups.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        pageLimit: z.number().int().min(1).max(25).default(10),
        fileLimit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ courseId, pageLimit, fileLimit }): Promise<
        ToolPayload<{ pages: unknown[]; files: unknown[] }>
      > => {
        const pages =
          (await tableExists("pages")) &&
          (
            await query(
              `SELECT url, title, front_page, published, updated_at_canvas
               FROM pages
               WHERE course_id = $1
               ORDER BY updated_at_canvas DESC NULLS LAST
               LIMIT $2`,
              [courseId, pageLimit]
            )
          ).rows;

        const files =
          (await tableExists("files")) &&
          (
            await query(
              `SELECT id, display_name, filename, content_type, size_bytes, url, updated_at_canvas
               FROM files
               WHERE course_id = $1
               ORDER BY updated_at_canvas DESC NULLS LAST
               LIMIT $2`,
              [courseId, fileLimit]
            )
          ).rows;

        return {
          uiTarget: "course.resources",
          summary: "Loaded course pages and files.",
          payload: { pages: pages || [], files: files || [] },
        };
      },
    }),

    getSubmissionInsights: tool({
      description:
        "Fetch submissions and grade trends for a course for progress analysis.",
      inputSchema: z.object({
        courseId: z.number().int().positive(),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ courseId, limit }): Promise<
        ToolPayload<{ submissions: unknown[]; gradeSnapshots: unknown[] }>
      > => {
        const submissions =
          (await tableExists("submissions")) &&
          (
            await query(
              `SELECT s.assignment_id, a.name AS assignment_name, s.submitted_at, s.graded_at, s.score, s.grade, s.late, s.missing
               FROM submissions s
               JOIN assignments a ON a.id = s.assignment_id
               WHERE s.course_id = $1
               ORDER BY s.graded_at DESC NULLS LAST, s.submitted_at DESC NULLS LAST
               LIMIT $2`,
              [courseId, limit]
            )
          ).rows;

        const gradeSnapshots =
          (await tableExists("course_grade_snapshots")) &&
          (
            await query(
              `SELECT captured_at, current_score, current_grade, final_score, final_grade
               FROM course_grade_snapshots
               WHERE course_id = $1
               ORDER BY captured_at DESC
               LIMIT $2`,
              [courseId, limit]
            )
          ).rows;

        return {
          uiTarget: "course.submissions",
          summary: "Loaded submission and grade trend insights.",
          payload: {
            submissions: submissions || [],
            gradeSnapshots: gradeSnapshots || [],
          },
        };
      },
    }),

    searchAssignments: tool({
      description:
        "Search assignments by keyword and optional course id. Returns structured rows for chat or UI.",
      inputSchema: z.object({
        queryText: z.string().min(2),
        courseId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(25).default(10),
      }),
      execute: async ({ queryText, courseId, limit }): Promise<
        ToolPayload<{ matches: unknown[] }>
      > => {
        const courseCondition = courseId !== undefined ? "AND a.course_id = $3" : "";
        const courseParams = courseId !== undefined ? [courseId] : [];

        let rows: unknown[] = [];

        // Try semantic vector search first
        try {
          const vec = await embedText(queryText);
          const vectorLiteral = `[${vec.join(",")}]`;

          const result = await query(
            `SELECT a.id, a.name, a.due_at, a.points_possible, c.code AS course_code, c.id AS course_id
             FROM assignments a
             JOIN courses c ON c.id = a.course_id
             WHERE a.embedding IS NOT NULL ${courseCondition}
             ORDER BY a.embedding <=> $1::vector ASC
             LIMIT $2`,
            [vectorLiteral, limit, ...courseParams]
          );
          rows = result.rows;
        } catch {
          // Fall back to ILIKE if embedding fails
        }

        // If vector search returned no results (no embeddings yet), fall back to ILIKE
        if (rows.length === 0) {
          const params: unknown[] = [`%${queryText}%`];
          let paramIndex = 2;
          const conditions = [
            `(a.name ILIKE $1 OR COALESCE(a.description, '') ILIKE $1)`,
          ];

          if (courseId !== undefined) {
            params.push(courseId);
            conditions.push(`a.course_id = $${paramIndex++}`);
          }

          params.push(limit);
          const result = await query(
            `SELECT a.id, a.name, a.due_at, a.points_possible, c.code AS course_code, c.id AS course_id
             FROM assignments a
             JOIN courses c ON c.id = a.course_id
             WHERE ${conditions.join(" AND ")}
             ORDER BY a.due_at ASC NULLS LAST
             LIMIT $${paramIndex}`,
            params
          );
          rows = result.rows;
        }

        return {
          uiTarget: "assignments.search-results",
          summary: `Found ${rows.length} assignments matching "${queryText}".`,
          payload: { matches: rows },
        };
      },
    }),

    getTodayPlanSnapshot: tool({
      description:
        "Get today's plan signals, including due-today, overdue work, and latest course announcements.",
      inputSchema: z.object({
        assignmentLimit: z.number().int().min(1).max(20).default(10),
      }),
      execute: async ({ assignmentLimit }): Promise<
        ToolPayload<{
          dueToday: unknown[];
          overdue: unknown[];
          recentAnnouncements: unknown[];
        }>
      > => {
        const dueToday = await query(
          `SELECT a.id, a.name, a.due_at, c.code AS course_code, c.id AS course_id
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.due_at >= date_trunc('day', NOW())
             AND a.due_at < date_trunc('day', NOW()) + interval '1 day'
           ORDER BY a.due_at ASC
           LIMIT $1`,
          [assignmentLimit]
        );

        const overdue = await query(
          `SELECT a.id, a.name, a.due_at, c.code AS course_code, c.id AS course_id
           FROM assignments a
           JOIN courses c ON c.id = a.course_id
           WHERE a.due_at IS NOT NULL
             AND a.due_at < NOW()
           ORDER BY a.due_at DESC
           LIMIT $1`,
          [assignmentLimit]
        );

        const recentAnnouncements = await fetchAnnouncements(6);

        return {
          uiTarget: "planner.today",
          summary: `Detected ${dueToday.rowCount ?? 0} due-today and ${overdue.rowCount ?? 0} overdue assignments.`,
          payload: {
            dueToday: dueToday.rows,
            overdue: overdue.rows,
            recentAnnouncements,
          },
        };
      },
    }),

    saveMemory: tool({
      description:
        "Store a durable memory entry for future context retention in this chat session.",
      inputSchema: z.object({
        memoryKey: z.string().min(2).max(120),
        memoryValue: z.string().min(2).max(500),
      }),
      execute: async ({ memoryKey, memoryValue }): Promise<
        ToolPayload<{ memoryKey: string }>
      > => {
        await loadChatSession(chatId);
        await upsertChatMemory({
          chatId,
          memoryKey,
          memoryValue,
          source: "assistant-tool",
        });

        return {
          uiTarget: "memory.store",
          summary: `Stored memory "${memoryKey}".`,
          payload: { memoryKey },
        };
      },
    }),

    searchMemories: tool({
      description:
        "Search previously stored chat memories to recover user preferences and prior facts.",
      inputSchema: z.object({
        queryText: z.string().min(2).max(180),
        limit: z.number().int().min(1).max(20).default(8),
      }),
      execute: async ({ queryText, limit }): Promise<
        ToolPayload<{ matches: unknown[] }>
      > => {
        await loadChatSession(chatId);
        const matches = await searchChatMemories({ chatId, queryText, limit });
        return {
          uiTarget: "memory.search-results",
          summary: `Found ${matches.length} matching memories.`,
          payload: { matches },
        };
      },
    }),

    getPlannerEvents: tool({
      description:
        "Get recent planner update events for reactive schedule/context shifts.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).default(8),
      }),
      execute: async ({ limit }): Promise<ToolPayload<{ events: unknown[] }>> => {
        await loadChatSession(chatId);
        const events = await listPlannerEvents({ chatId, limit });
        return {
          uiTarget: "planner.events",
          summary: `Loaded ${events.length} recent planner events.`,
          payload: { events },
        };
      },
    }),
  };
}

export type ChatToolSet = ReturnType<typeof createChatTools>;
