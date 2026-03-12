"use client";

import { useRef, useState } from "react";
import { CourseDeepDive } from "./CourseDeepDive";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

type Course = {
  id: number;
  name: string;
  code: string;
  term_name: string | null;
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
  id: number;
  module_id: number;
  title: string;
  type: string;
  position: number;
};

type Announcement = {
  id: number;
  title: string;
  posted_at: string | null;
};

const TABS = ["Course", "AI Insights"] as const;
type Tab = (typeof TABS)[number];

export function CourseView({
  course,
  assignments,
  modules,
  moduleItems,
  announcements = [],
  standardView,
}: {
  course: Course;
  assignments: Assignment[];
  modules: Module[];
  moduleItems: ModuleItem[];
  announcements?: Announcement[];
  standardView: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Course");
  const [refreshKey, setRefreshKey] = useState(0);
  const prevIndex = useRef(0);

  function handleTabChange(tab: Tab) {
    prevIndex.current = TABS.indexOf(activeTab);
    setActiveTab(tab);
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="relative flex items-center bg-muted rounded-xl p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className="relative px-4 py-1.5 text-sm font-medium rounded-lg transition-colors z-10 focus-visible:outline-none"
              style={{ color: activeTab === tab ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}
            >
              {activeTab === tab && (
                <motion.span
                  layoutId="course-tab-bg"
                  className="absolute inset-0 bg-background shadow-sm rounded-lg"
                  transition={{ type: "spring", damping: 30, stiffness: 350 }}
                />
              )}
              <span className="relative z-10">{tab}</span>
            </button>
          ))}
        </div>

        {activeTab === "AI Insights" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2"
          >
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Refresh
            </Button>
          </motion.div>
        )}
      </div>

      {/* Both panels always mounted — only opacity/translate changes, state persists across tab switches */}
      <div className="relative">
        <motion.div
          animate={{
            opacity: activeTab === "Course" ? 1 : 0,
            x: activeTab === "Course" ? 0 : -24,
            pointerEvents: activeTab === "Course" ? "auto" : "none",
          }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={activeTab !== "Course" ? "absolute inset-0" : ""}
        >
          {standardView}
        </motion.div>

        <motion.div
          animate={{
            opacity: activeTab === "AI Insights" ? 1 : 0,
            x: activeTab === "AI Insights" ? 0 : 24,
            pointerEvents: activeTab === "AI Insights" ? "auto" : "none",
          }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={activeTab !== "AI Insights" ? "absolute inset-0" : ""}
        >
          <CourseDeepDive
            course={course}
            assignments={assignments}
            modules={modules}
            moduleItems={moduleItems}
            announcements={announcements}
            refreshKey={refreshKey}
          />
        </motion.div>
      </div>
    </div>
  );
}
