import { query } from "@/lib/db";
import { CourseView } from "@/components/ai/CourseView";
import Link from "next/link";
import {
  LayoutList,
  CheckCircle2,
  Megaphone,
  Clock,
  CheckCircle,
  BookMarked,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type CourseRow = {
  id: number;
  name: string;
  code: string;
  term_name: string | null;
  start_date: string | null;
  end_date: string | null;
  syllabus_html: string | null;
  current_score: number | null;
  current_grade: string | null;
  final_score: number | null;
  final_grade: string | null;
};

type AssignmentGroupRow = {
  id: number;
  name: string;
  group_weight: number | null;
  position: number;
};

type AssignmentRow = {
  id: number;
  assignment_group_id: number | null;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  score: number | null;
  grade: string | null;
  late: boolean | null;
  missing: boolean | null;
  sub_workflow_state: string | null;
};

type ModuleRow = {
  id: number;
  name: string;
  position: number;
};

type ModuleItemRow = {
  id: number;
  module_id: number;
  title: string;
  type: string;
  position: number;
};

type AnnouncementRow = {
  id: number;
  title: string;
  posted_at: string | null;
};

type QuizRow = {
  id: number;
  title: string;
  quiz_type: string | null;
  due_at: string | null;
  time_limit: number | null;
  points_possible: number | null;
};

function isExamQuiz(quiz: QuizRow) {
  return /\b(midterm|final|exam)\b/i.test(`${quiz.title} ${quiz.quiz_type ?? ""}`);
}

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, opts ?? { month: "short", day: "numeric" });
}

function fmtScore(score: number | null, possible: number | null) {
  if (score === null) return null;
  if (possible) return `${score}/${possible}`;
  return `${score}`;
}

function submissionBadge(row: AssignmentRow) {
  if (row.missing)
    return <span className="text-xs font-medium text-red-600 dark:text-red-400">Missing</span>;
  if (row.late)
    return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Late</span>;
  if (row.sub_workflow_state === "graded" && row.score !== null)
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{fmtScore(row.score, row.points_possible)}</span>;
  if (row.sub_workflow_state === "submitted")
    return <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Submitted</span>;
  return null;
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { rows: courses } = await query<CourseRow>(`
    SELECT c.id, c.name, c.code, c.term_name, c.start_date, c.end_date, c.syllabus_html,
           COALESCE(ce.current_score, gs.current_score) AS current_score,
           COALESCE(
             ce.current_grade,
             CASE
               WHEN gs.current_score IS NULL THEN NULL
               WHEN gs.current_score >= 93 THEN 'A'
               WHEN gs.current_score >= 90 THEN 'A-'
               WHEN gs.current_score >= 87 THEN 'B+'
               WHEN gs.current_score >= 83 THEN 'B'
               WHEN gs.current_score >= 80 THEN 'B-'
               WHEN gs.current_score >= 77 THEN 'C+'
               WHEN gs.current_score >= 73 THEN 'C'
               WHEN gs.current_score >= 70 THEN 'C-'
               WHEN gs.current_score >= 67 THEN 'D+'
               WHEN gs.current_score >= 63 THEN 'D'
               WHEN gs.current_score >= 60 THEN 'D-'
               ELSE 'F'
             END
           ) AS current_grade,
           ce.final_score, ce.final_grade
    FROM courses c
    LEFT JOIN LATERAL (
      SELECT user_id, current_score, current_grade, final_score, final_grade
      FROM course_enrollments ce
      WHERE ce.course_id = c.id
        AND (ce.type = 'StudentEnrollment' OR ce.role ILIKE 'student%')
      ORDER BY (ce.type = 'StudentEnrollment') DESC, ce.updated_at DESC NULLS LAST, ce.id DESC
      LIMIT 1
    ) ce ON TRUE
    LEFT JOIN LATERAL (
      SELECT ROUND((SUM(s.score)::numeric / NULLIF(SUM(a.points_possible)::numeric, 0)) * 100, 1) AS current_score
      FROM submissions s
      JOIN assignments a ON a.id = s.assignment_id
      WHERE s.course_id = c.id
        AND s.score IS NOT NULL
        AND a.points_possible IS NOT NULL
        AND a.points_possible > 0
        AND s.user_id = COALESCE(
          ce.user_id,
          (SELECT MIN(s2.user_id) FROM submissions s2 WHERE s2.course_id = c.id)
        )
    ) gs ON TRUE
    WHERE c.id = $1
  `, [id]);

  if (courses.length === 0) {
    return <div className="p-8">Course not found</div>;
  }

  const course = courses[0];

  const [
    { rows: assignmentGroups },
    { rows: assignments },
    { rows: modules },
    { rows: moduleItems },
    { rows: announcements },
    { rows: quizzes },
  ] = await Promise.all([
    query<AssignmentGroupRow>(
      "SELECT id, name, group_weight, position FROM assignment_groups WHERE course_id = $1 ORDER BY position",
      [id]
    ),
    query<AssignmentRow>(`
      SELECT a.id, a.assignment_group_id, a.name, a.due_at, a.points_possible,
             s.score, s.grade, s.late, s.missing, s.workflow_state AS sub_workflow_state
      FROM assignments a
      LEFT JOIN submissions s ON s.assignment_id = a.id AND s.course_id = a.course_id
      WHERE a.course_id = $1
      ORDER BY a.due_at ASC NULLS LAST
    `, [id]),
    query<ModuleRow>(
      "SELECT id, name, position FROM modules WHERE course_id = $1 ORDER BY position",
      [id]
    ),
    query<ModuleItemRow>(
      "SELECT id, module_id, title, type, position FROM module_items WHERE course_id = $1 ORDER BY module_id, position",
      [id]
    ),
    query<AnnouncementRow>(
      "SELECT id, title, posted_at FROM announcements WHERE course_id = $1 ORDER BY posted_at DESC NULLS LAST LIMIT 5",
      [id]
    ),
    query<QuizRow>(
      "SELECT id, title, quiz_type, due_at, time_limit, points_possible FROM quizzes WHERE course_id = $1 ORDER BY due_at ASC NULLS LAST",
      [id]
    ),
  ]);

  const now = new Date();
  const groupMap = new Map(assignmentGroups.map((g) => [g.id, g]));
  const missingCount = assignments.filter((a) => a.missing).length;
  const pendingCount = assignments.filter((a) => !a.missing && a.sub_workflow_state === null && a.due_at && new Date(a.due_at) > now).length;
  const examQuizzes = quizzes.filter(isExamQuiz);
  const quizCount = quizzes.length - examQuizzes.length;
  const nextExam =
    examQuizzes
      .filter((q) => q.due_at && new Date(q.due_at) > now)
      .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0] ?? null;
  const displayedQuizzes = quizzes.slice(0, 10);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] p-8 max-w-7xl mx-auto">
      <Link
        href="/"
        className="text-sm text-muted-foreground hover:text-primary mb-8 inline-block transition-colors"
      >
        Back
      </Link>

      <header className="mb-10 bg-card border rounded-3xl p-8 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative z-10">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
                {course.code}
              </span>
              <span className="text-sm font-medium text-muted-foreground">{course.term_name}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-foreground">{course.current_grade ?? "N/A"}</div>
                {course.current_score !== null ? (
                  <div className="text-xs text-muted-foreground">{course.current_score.toFixed(1)}%</div>
                ) : (
                  <div className="text-xs text-muted-foreground">No scored submissions yet</div>
                )}
              </div>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{course.name}</h1>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {assignments.length} assignments
            </div>
            <div className="flex items-center gap-1.5">
              <BookMarked className="w-4 h-4" />
              {quizCount} quizzes
            </div>
            <div className="flex items-center gap-1.5">
              <LayoutList className="w-4 h-4" />
              {examQuizzes.length} exams
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {nextExam ? `Next exam: ${fmtDate(nextExam.due_at)}` : "No upcoming exam"}
            </div>
          </div>
        </div>
      </header>

      <CourseView
        course={course}
        assignments={assignments.map((a) => ({
          name: a.name,
          due_at: a.due_at,
          points_possible: a.points_possible,
        }))}
        modules={modules}
        moduleItems={moduleItems}
        announcements={announcements}
        standardView={
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left: assignments + modules */}
              <div className="lg:col-span-2 space-y-8">
                {/* Assignments with submission state */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Assignments
                    </h3>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {pendingCount} upcoming{missingCount > 0 ? ` · ${missingCount} missing` : ""}
                    </span>
                  </div>
                  <div className="border rounded-2xl bg-card divide-y overflow-hidden">
                    {assignments.map((a) => {
                      const group = a.assignment_group_id ? groupMap.get(a.assignment_group_id) : null;
                      const isGraded = a.sub_workflow_state === "graded" && a.score !== null;
                      const isPast = a.due_at ? new Date(a.due_at) < new Date() : false;
                      return (
                        <div key={a.id} className="p-4 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`mt-0.5 shrink-0 ${isGraded ? "text-emerald-500" : a.missing ? "text-red-400" : isPast ? "text-amber-400" : "text-muted-foreground/40"}`}>
                                {isGraded ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium leading-snug truncate">{a.name}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {a.due_at && (
                                    <span className="text-xs text-muted-foreground">
                                      {fmtDate(a.due_at, { month: "short", day: "numeric" })}
                                    </span>
                                  )}
                                  {group && (
                                    <span className="text-xs text-muted-foreground/70">{group.name}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              {submissionBadge(a)}
                              {a.points_possible !== null && (
                                <span className="text-xs text-muted-foreground">{a.points_possible} pts</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {assignments.length === 0 && (
                      <div className="p-8 text-center text-muted-foreground text-sm">No assignments.</div>
                    )}
                  </div>
                </div>

                {/* Modules */}
                {modules.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <LayoutList className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Modules
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {modules.map((m) => {
                        const items = moduleItems.filter((it) => it.module_id === m.id);
                        return (
                          <div key={m.id} className="border rounded-2xl bg-card overflow-hidden">
                            <div className="px-4 py-3 bg-muted/30 border-b font-medium text-sm flex items-center justify-between">
                              <span>{m.name}</span>
                              <span className="text-xs text-muted-foreground">{items.length} items</span>
                            </div>
                            <div className="divide-y">
                              {items.map((item) => (
                                <div key={item.id} className="px-4 py-3 text-sm hover:bg-muted/30 transition-colors flex items-center gap-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary/40 shrink-0" />
                                  <span className="truncate">{item.title}</span>
                                  <Badge variant="outline" className="ml-auto text-xs shrink-0 font-normal text-muted-foreground border-muted">
                                    {item.type}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Right sidebar: quizzes + announcements */}
              <div className="space-y-8">
                {/* Quizzes */}
                {quizzes.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <BookMarked className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Quizzes & Exams
                      </h3>
                    </div>
                    <div className="border rounded-2xl bg-card divide-y overflow-hidden">
                      {displayedQuizzes.map((q) => (
                        <div key={q.id} className="p-4 hover:bg-muted/30 transition-colors">
                          <p className="text-sm font-medium leading-snug mb-1">{q.title}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                            {q.due_at && <span>{fmtDate(q.due_at)}</span>}
                            {q.time_limit && <span>{q.time_limit} min</span>}
                            {q.points_possible !== null && <span>{q.points_possible} pts</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                    {quizzes.length > displayedQuizzes.length && (
                      <p className="text-xs text-muted-foreground mt-2 px-1">
                        Showing {displayedQuizzes.length} of {quizzes.length} quizzes.
                      </p>
                    )}
                  </div>
                )}

                {/* Announcements */}
                {announcements.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <Megaphone className="w-4 h-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Announcements
                      </h3>
                    </div>
                    <div className="border rounded-2xl bg-card divide-y overflow-hidden">
                      {announcements.map((a) => (
                        <div key={a.id} className="p-4 hover:bg-muted/30 transition-colors">
                          <p className="text-sm font-medium leading-snug">{a.title}</p>
                          {a.posted_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {fmtDate(a.posted_at, { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {assignmentGroups.length > 0 && (
                  <div className="rounded-2xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Badge variant="outline" className="text-[11px] uppercase tracking-wide">Group Weights</Badge>
                    </div>
                    <div className="space-y-2">
                      {assignmentGroups.map((g) => (
                        <div key={g.id} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate pr-4">{g.name}</span>
                          <span className="font-medium text-foreground">{g.group_weight !== null ? `${g.group_weight}%` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        }
      />
    </main>
  );
}
