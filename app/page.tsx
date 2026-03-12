import { query } from "@/lib/db";
import Link from "next/link";
import { Calendar, BookOpen, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DashboardView } from "@/components/ai/DashboardView";

type CourseRow = {
  id: number;
  name: string;
  code: string;
  term_name: string | null;
  current_score: number | null;
  current_grade: string | null;
};

type UpcomingAssignmentRow = {
  id: number;
  name: string;
  due_at: string | null;
  course_name: string;
  course_code: string;
  course_id: number;
};

const CARD_GRADIENTS = [
  "from-blue-500/10 to-cyan-500/10",
  "from-purple-500/10 to-indigo-500/10",
  "from-emerald-500/10 to-teal-500/10",
  "from-orange-500/10 to-amber-500/10",
];

export default async function Home() {
  const { rows: courses } = await query<CourseRow>(`
    SELECT c.id, c.name, c.code, c.term_name,
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
           ) AS current_grade
    FROM courses c
    LEFT JOIN LATERAL (
      SELECT user_id, current_score, current_grade
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
    ORDER BY c.id
  `);

  const { rows: upcomingAssignments } = await query<UpcomingAssignmentRow>(`
    SELECT a.id, a.name, a.due_at, c.name as course_name, c.code as course_code, c.id as course_id
    FROM assignments a
    JOIN courses c ON a.course_id = c.id
    WHERE a.due_at > NOW() OR a.due_at IS NULL
    ORDER BY a.due_at ASC NULLS LAST
    LIMIT 6
  `);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">Here's what's happening in your courses.</p>
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center border rounded-2xl bg-card/50 backdrop-blur-sm">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-primary">
            <BookOpen className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold">No course data available</h2>
          <p className="text-muted-foreground mt-2 max-w-md">
            Course information is currently unavailable.
          </p>
        </div>
      ) : (
        <DashboardView 
          courses={courses} 
          upcomingAssignments={upcomingAssignments} 
          standardView={
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  Your Courses
                </h2>
                <Badge variant="secondary" className="rounded-full px-3">
                  {courses.length} Active
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {courses.map((course, i) => {
                  const gradient = CARD_GRADIENTS[i % CARD_GRADIENTS.length];

                  return (
                    <Link key={course.id} href={`/courses/${course.id}`}>
                      <div className={`group relative overflow-hidden rounded-2xl border bg-card p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col h-full`}>
                        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-50`} />
                        
                        <div className="relative z-10 flex flex-col h-full justify-between gap-6">
                          <div>
                            <div className="flex justify-between items-start mb-3">
                              <Badge variant="outline" className="bg-background/50 backdrop-blur-sm">
                                {course.code}
                              </Badge>
                              <span className="text-xs font-medium text-muted-foreground">
                                {course.term_name}
                              </span>
                            </div>
                            <h3 className="text-xl font-semibold leading-tight group-hover:text-primary transition-colors line-clamp-2">
                              {course.name}
                            </h3>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-foreground">{course.current_grade ?? "N/A"}</span>
                              {course.current_score !== null ? (
                                <span className="text-xs text-muted-foreground">{course.current_score.toFixed(1)}%</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">No grade yet</span>
                              )}
                            </div>
                            {course.current_score !== null && (
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full bg-primary/70 rounded-full transition-all"
                                  style={{ width: `${Math.min(course.current_score, 100)}%` }}
                                />
                              </div>
                            )}
                            
                            <div className="pt-2 flex items-center text-sm font-medium text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                              Open Workspace <ChevronRight className="w-4 h-4 ml-1" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="space-y-8">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <h2 className="text-2xl font-semibold">Up Next</h2>
              </div>

              <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
                {upcomingAssignments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">
                    No upcoming assignments. You're all caught up!
                  </div>
                ) : (
                  <div className="divide-y">
                    {upcomingAssignments.map((assignment) => (
                      <Link 
                        key={assignment.id} 
                        href={`/courses/${assignment.course_id}`}
                        className="block p-4 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="flex gap-4">
                          <div className="mt-1">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                              <Clock className="w-4 h-4" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                              {assignment.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="truncate max-w-[120px]">{assignment.course_code}</span>
                              <span>|</span>
                              <span className={assignment.due_at ? "text-orange-600 dark:text-orange-400 font-medium" : ""}>
                                {assignment.due_at ? new Date(assignment.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : "No due date"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          }
        />
      )}
    </main>
  );
}
