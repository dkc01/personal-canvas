import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

export const maxDuration = 60;

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

type Course = {
  name: string;
  code: string;
  term_name: string;
  syllabus_html: string | null;
  current_score?: number | null;
  current_grade?: string | null;
};

type Assignment = {
  name: string;
  due_at: string | null;
  points_possible: number | null;
};

type Module = {
  id: number;
  name: string;
};

type ModuleItem = {
  module_id: number;
};

type Announcement = {
  title: string;
  posted_at: string | null;
};

type RequestBody = {
  course: Course;
  assignments: Assignment[];
  modules: Module[];
  moduleItems: ModuleItem[];
  announcements?: Announcement[];
};

const courseSchema = z.object({
  summary: z.string().describe("1-2 sentences on the most important thing happening in this course right now. Use the actual course name. No preamble."),
  nextSteps: z.array(z.object({
    action: z.string().describe("Concrete action in 10 words or fewer. Use actual assignment/module names."),
    deadline: z.string().optional().describe("Short date string like 'Jan 25' or 'tomorrow'. Omit if no specific deadline."),
    priority: z.enum(["high", "medium", "low"]).describe("high=due within 48h or exam; medium=due within 7 days; low=due >7 days or prep task"),
  })).max(5).describe("Next actions for the next 48 hours, sorted by urgency"),
  assignments: z.array(z.object({
    name: z.string(),
    effort: z.enum(["low", "medium", "high"]).describe("high=>4h; medium=2-4h; low=<2h"),
    concepts: z.array(z.string()).max(3),
    dueDate: z.string().optional(),
  })).max(5).describe("Upcoming assignments only (not already graded). Most urgent first."),
  moduleInsight: z.object({
    currentFocus: z.string().describe("One sentence on what the current module is about."),
    keyTopics: z.array(z.string()).max(4),
    studyTip: z.string().describe("One concrete study technique for this specific module. Max 15 words."),
  }),
  resources: z.array(z.object({
    title: z.string().describe("Short label, e.g. '3Blue1Brown – Linear Algebra' or 'Khan Academy – Hypothesis Testing'"),
    query: z.string().describe("Exact YouTube search query or topic search string"),
    type: z.enum(["youtube", "article"]),
  })).min(3).max(5).describe("Specific learning resources matching the current module topics. Prefer known channels: 3Blue1Brown, Khan Academy, StatQuest, MIT OCW, Crash Course."),
});

export async function POST(req: Request) {
  const { course, assignments, modules, moduleItems, announcements = [] } =
    (await req.json()) as RequestBody;

  const gradeContext = course.current_grade
    ? `Current grade: ${course.current_grade} (${course.current_score?.toFixed(1)}%)`
    : "No grade recorded yet.";

  const announcementsContext = announcements.length > 0
    ? `\nRecent announcements: ${announcements.map((a) => `"${a.title}" (${a.posted_at ? new Date(a.posted_at).toLocaleDateString() : "n/d"})`).join("; ")}`
    : "";

  const { object } = await generateObject({
    model: openrouter("arcee-ai/trinity-large-preview:free"),
    schema: courseSchema,
    prompt: `You are an expert academic AI assistant analyzing a student's course.

Rules:
- No preamble, no markdown headers, no bullet symbols, no asterisks
- Plain text only in string fields
- Use actual course/assignment names, never placeholders
- Priority: high=due within 48h or exam; medium=due within 7 days; low=due >7 days or prep
- Effort: high=>4h; medium=2-4h; low=<2h
- Resources: suggest well-known channels (3Blue1Brown, Khan Academy, StatQuest, MIT OCW, Crash Course) matching the current module

Course: ${course.name} (${course.code}), Term: ${course.term_name}
${gradeContext}

Syllabus: ${course.syllabus_html ? course.syllabus_html.replace(/<[^>]*>?/gm, '').substring(0, 2000) : 'Not provided.'}

Assignments: ${assignments.map((a) => `${a.name} (Due: ${a.due_at ? new Date(a.due_at).toLocaleDateString() : 'No due date'}, ${a.points_possible} pts)`).join("; ")}

Modules: ${modules.map((m) => `${m.name} (${moduleItems.filter((i) => i.module_id === m.id).length} items)`).join("; ")}
${announcementsContext}`,
  });

  return Response.json(object);
}
