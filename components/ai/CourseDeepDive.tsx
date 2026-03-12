"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, BookOpen, Lightbulb, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type NextStep = { action: string; deadline?: string; priority: "high" | "medium" | "low" };
type Assignment = { name: string; effort: "low" | "medium" | "high"; concepts: string[]; dueDate?: string };
type ModuleInsight = { currentFocus: string; keyTopics: string[]; studyTip: string };
type Resource = { title: string; query: string; type: "youtube" | "article" };
type CourseData = {
  summary: string;
  nextSteps: NextStep[];
  assignments: Assignment[];
  moduleInsight: ModuleInsight;
  resources?: Resource[];
};
type Course = {
  id: number;
  name: string;
  code: string;
  term_name: string | null;
  syllabus_html: string | null;
  current_score?: number | null;
  current_grade?: string | null;
};
type CourseAssignment = {
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
  id: number;
  title: string;
  posted_at: string | null;
};

const priorityDot: Record<NextStep["priority"], string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-emerald-500",
};

const effortConfig: Record<Assignment["effort"], { label: string; className: string }> = {
  high: { label: "Heavy lift", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  medium: { label: "Moderate", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  low: { label: "Light", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

export function CourseDeepDive({
  course,
  assignments,
  modules,
  moduleItems,
  announcements = [],
  refreshKey = 0,
}: {
  course: Course;
  assignments: CourseAssignment[];
  modules: Module[];
  moduleItems: ModuleItem[];
  announcements?: Announcement[];
  refreshKey?: number;
}) {
  const [data, setData] = useState<CourseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    fetch("/api/course-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course, assignments, modules, moduleItems, announcements }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load course analysis.");
        return (await res.json()) as CourseData;
      })
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load course analysis.");
      })
      .finally(() => setIsLoading(false));
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center border rounded-3xl bg-card/50 backdrop-blur-sm">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-6" />
        <h3 className="text-lg font-semibold mb-1">Analyzing course...</h3>
        <p className="text-sm text-muted-foreground max-w-sm">Reading syllabus, cross-referencing deadlines.</p>
      </div>
    );
  }

  if (error || !data) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center gap-2 text-primary font-medium">
        <Sparkles className="w-5 h-5" />
        <span>Course Deep Dive</span>
      </div>

      {data.summary && (
        <div className="bg-card border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summary</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">{data.summary}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.nextSteps?.length > 0 && (
          <div className="bg-card border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next 48 Hours</h3>
            </div>
            <div className="space-y-2">
              {data.nextSteps.map((step, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${priorityDot[step.priority]}`} />
                  <span className="flex-1 leading-snug">{step.action}</span>
                  {step.deadline && (
                    <span className="text-xs text-muted-foreground shrink-0">{step.deadline}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.moduleInsight && (
          <div className="bg-card border rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Focus</h3>
            </div>
            <p className="text-sm font-medium mb-3">{data.moduleInsight.currentFocus}</p>
            {data.moduleInsight.keyTopics?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {data.moduleInsight.keyTopics.map((topic, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{topic}</Badge>
                ))}
              </div>
            )}
            {data.moduleInsight.studyTip && (
              <p className="text-xs text-muted-foreground leading-relaxed border-t pt-3 mt-1">{data.moduleInsight.studyTip}</p>
            )}
          </div>
        )}
      </div>

      {data.assignments?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BookOpen className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assignment Breakdown</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {data.assignments.map((a, i) => (
              <div key={i} className="bg-card border rounded-2xl p-4 shadow-sm flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <h4 className="text-sm font-medium truncate">{a.name}</h4>
                    {a.dueDate && <span className="text-xs text-muted-foreground">· {a.dueDate}</span>}
                  </div>
                  {a.concepts?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.concepts.map((c, j) => <Badge key={j} variant="outline" className="text-xs">{c}</Badge>)}
                    </div>
                  )}
                </div>
                {a.effort && (
                  <Badge className={`text-xs shrink-0 border-0 ${effortConfig[a.effort]?.className}`}>
                    {effortConfig[a.effort]?.label}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.resources && data.resources.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Study Resources</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.resources.map((r, i) => {
              const searchUrl = r.type === "youtube"
                ? `https://www.youtube.com/results?search_query=${encodeURIComponent(r.query)}`
                : `https://www.google.com/search?q=${encodeURIComponent(r.query)}`;
              return (
                <a
                  key={i}
                  href={searchUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-card border rounded-2xl p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors group"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold ${r.type === "youtube" ? "bg-red-500/10 text-red-600" : "bg-primary/10 text-primary"}`}>
                    {r.type === "youtube" ? "YT" : "W"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.query}</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
                </a>
              );
            })}
          </div>
        </div>
      )}
    </motion.section>
  );
}
