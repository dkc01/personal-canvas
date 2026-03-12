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
};

type UpcomingAssignment = {
  name: string;
  due_at: string | null;
  course_code: string;
};

type RequestBody = {
  courses: Course[];
  upcomingAssignments: UpcomingAssignment[];
};

const dashboardSchema = z.object({
  briefing: z.string().describe("2 sentences max. State the student's most urgent situation and one concrete next action. No markdown."),
  priorities: z.array(z.object({
    title: z.string().describe("5 words max"),
    description: z.string().describe("20 words max. One specific action, not general advice."),
    urgency: z.enum(["high", "medium", "low"]),
    course: z.string().describe("Course code only, e.g. CS430"),
  })).describe("Exactly 3 priorities ordered by urgency. High = due within 3 days. Medium = due within 7 days. Low = everything else."),
  insight: z.string().describe("1-2 sentences. A specific tactical observation about workload patterns or scheduling. Not generic advice."),
  workloadWarning: z.string().optional().describe("Only include when 2+ high-urgency items cluster within 5 days. 1 sentence. Omit otherwise."),
});

export async function POST(req: Request) {
  const { courses, upcomingAssignments } = (await req.json()) as RequestBody;

  const { object } = await generateObject({
    model: openrouter("arcee-ai/trinity-large-preview:free"),
    schema: dashboardSchema,
    prompt: `You are an expert academic AI assistant. Analyze this student's academic landscape and provide a structured daily briefing.

Courses: ${courses.map((course) => `${course.name} (${course.code})`).join(", ")}

Upcoming Assignments:
${upcomingAssignments.map((assignment) => `- ${assignment.name} in ${assignment.course_code} (Due: ${assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : "No due date"})`).join("\n")}

Provide a helpful, personalized analysis. Be specific, not generic. Return plain text only — no markdown formatting, no asterisks, no bullet symbols, no headers.`,
  });

  return Response.json(object);
}
