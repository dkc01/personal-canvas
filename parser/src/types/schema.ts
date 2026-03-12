export interface Course {
  id: number;
  name: string;
  code: string;
  start_date: string | null;
  end_date: string | null;
  syllabus_html: string | null;
  term_name: string | null;
  created_at: string;
}

export interface Assignment {
  id: number;
  course_id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  grading_type: string;
  submission_types: string[];
  position: number;
  created_at: string;
}

export interface Module {
  id: number;
  course_id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface ModuleItem {
  id: number;
  module_id: number;
  course_id: number;
  title: string;
  type: string;
  content_id: number | null;
  position: number;
  created_at: string;
}
