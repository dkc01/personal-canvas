export interface CanvasTerm {
  id: number;
  name: string;
  start_at: string | null;
  end_at: string | null;
}

export interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  workflow_state: "unpublished" | "available" | "completed" | "deleted";
  account_id: number;
  enrollment_term_id: number;
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  default_view: string;
  syllabus_body: string | null;
  term: CanvasTerm | null;
  time_zone: string | null;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description: string | null;
  course_id: number;
  due_at: string | null;
  lock_at: string | null;
  unlock_at: string | null;
  points_possible: number | null;
  grading_type: string;
  submission_types: string[];
  assignment_group_id: number;
  position: number;
  published: boolean;
  html_url: string;
  created_at: string;
  updated_at: string;
  workflow_state: "published" | "unpublished";
  omit_from_final_grade: boolean;
}

export interface CanvasModuleItem {
  id: number;
  module_id: number;
  position: number;
  title: string;
  indent: number;
  type:
    | "File"
    | "Page"
    | "Discussion"
    | "Assignment"
    | "Quiz"
    | "SubHeader"
    | "ExternalUrl"
    | "ExternalTool";
  content_id: number | null;
  html_url: string;
  url: string | null;
  published: boolean;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  workflow_state: string;
  unlock_at: string | null;
  require_sequential_progress: boolean;
  prerequisite_module_ids: number[];
  items_count: number;
  items_url: string;
  items: CanvasModuleItem[] | null;
  state: "locked" | "unlocked" | "started" | "completed" | null;
  completed_at: string | null;
  published: boolean;
}
