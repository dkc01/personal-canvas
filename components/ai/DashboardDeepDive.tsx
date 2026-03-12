"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, Target, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { readLocalJson, removeLocalKey, writeLocalJson } from "@/lib/client-storage";

const CACHE_KEY = "dashboard-insights";

type Priority = { title: string; description: string; urgency: "high" | "medium" | "low"; course: string };
type DashboardData = {
  briefing: string;
  priorities: Priority[];
  insight: string;
  workloadWarning?: string;
};
type Course = {
  name: string;
  code: string;
};
type UpcomingAssignment = {
  name: string;
  due_at: string | null;
  course_code: string;
};

const urgencyConfig: Record<Priority["urgency"], { label: string; className: string }> = {
  high: { label: "High Priority", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  low: { label: "Low", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
};

export function DashboardDeepDive({
  courses,
  upcomingAssignments,
  refreshKey = 0,
}: {
  courses: Course[];
  upcomingAssignments: UpcomingAssignment[];
  refreshKey?: number;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (refreshKey === 0) {
      const cached = readLocalJson<DashboardData>(CACHE_KEY);
      if (cached) {
        setData(cached);
        setIsLoading(false);
        return;
      }
    } else {
      removeLocalKey(CACHE_KEY);
    }

    setIsLoading(true);
    setError(null);
    fetch("/api/dashboard-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courses, upcomingAssignments }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load dashboard briefing.");
        }
        return (await response.json()) as DashboardData;
      })
      .then((payload) => {
        writeLocalJson(CACHE_KEY, payload);
        setData(payload);
      })
      .catch((fetchError: unknown) => {
        const message =
          fetchError instanceof Error ? fetchError.message : "Failed to load dashboard briefing.";
        setError(message);
      })
      .finally(() => setIsLoading(false));
  }, [courses, refreshKey, upcomingAssignments]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border rounded-3xl bg-card/50 backdrop-blur-sm mb-8">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
        <h3 className="text-lg font-semibold mb-2">AI is preparing your daily briefing...</h3>
        <p className="text-sm text-muted-foreground max-w-md">Analyzing your courses and upcoming deadlines to prioritize your day.</p>
      </div>
    );
  }

  if (error || !data) return null;

  return (
    <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 space-y-6">
      {data.briefing && (
        <div className="bg-card border rounded-2xl p-5 shadow-sm flex gap-3">
          <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold mb-1">Daily Briefing</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{data.briefing}</p>
          </div>
        </div>
      )}

      {data.priorities?.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Today's Priorities</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.priorities.map((p, i) => (
              <div key={i} className="bg-card border rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-semibold text-sm leading-tight">{p.title}</h4>
                  <Badge variant="outline" className={`text-xs shrink-0 ${urgencyConfig[p.urgency]?.className}`}>
                    {urgencyConfig[p.urgency]?.label}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">{p.description}</p>
                {p.course && <Badge variant="secondary" className="w-fit text-xs">{p.course}</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-4 ${data.workloadWarning ? "md:grid-cols-2" : ""}`}>
        {data.insight && (
          <div className="bg-card border rounded-2xl p-5 shadow-sm flex gap-3">
            <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold mb-1">Strategic Insight</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{data.insight}</p>
            </div>
          </div>
        )}
        {data.workloadWarning && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold mb-1 text-amber-700 dark:text-amber-300">Heads Up</h4>
              <p className="text-sm text-amber-700/80 dark:text-amber-400/80 leading-relaxed">{data.workloadWarning}</p>
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}
