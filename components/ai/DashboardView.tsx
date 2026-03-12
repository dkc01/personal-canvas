"use client";

import { useRef, useState } from "react";
import { DashboardDeepDive } from "./DashboardDeepDive";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Course = {
  name: string;
  code: string;
};

type UpcomingAssignment = {
  name: string;
  due_at: string | null;
  course_code: string;
};

const TABS = ["Overview", "Study Plan"] as const;
type Tab = (typeof TABS)[number];

const SLIDE = {
  enter: (dir: number) => ({ x: dir * 40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: -dir * 40, opacity: 0 }),
};

export function DashboardView({
  courses,
  upcomingAssignments,
  standardView,
}: {
  courses: Course[];
  upcomingAssignments: UpcomingAssignment[];
  standardView: React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [refreshKey, setRefreshKey] = useState(0);
  const prevIndex = useRef(0);

  function handleTabChange(tab: Tab) {
    prevIndex.current = TABS.indexOf(activeTab);
    setActiveTab(tab);
  }

  const currentIndex = TABS.indexOf(activeTab);
  const direction = currentIndex - prevIndex.current;

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
                  layoutId="tab-bg"
                  className="absolute inset-0 bg-background shadow-sm rounded-lg"
                  transition={{ type: "spring", damping: 30, stiffness: 350 }}
                />
              )}
              <span className="relative z-10">{tab}</span>
            </button>
          ))}
        </div>

        {activeTab === "Study Plan" && (
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

      <div className="overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeTab}
            custom={direction}
            variants={SLIDE}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeTab === "Overview" ? (
              standardView
            ) : (
              <DashboardDeepDive
                courses={courses}
                upcomingAssignments={upcomingAssignments}
                refreshKey={refreshKey}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
