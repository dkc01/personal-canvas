import pg from "pg";
import pgvector from "pgvector/pg";
import type { CanvasCourse, CanvasAssignment, CanvasModule } from "./types/canvas.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export class Database {
  private client: pg.Client;

  constructor() {
    this.client = new pg.Client({
      connectionString: requiredEnv("DATABASE_URL"),
    });
  }

  async init(): Promise<void> {
    await this.client.connect();
    await pgvector.registerTypes(this.client);
  }

  async upsertCourse(course: CanvasCourse): Promise<void> {
    await this.client.query(
      `INSERT INTO courses (id, name, code, start_date, end_date, syllabus_html, term_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         code = EXCLUDED.code,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         syllabus_html = EXCLUDED.syllabus_html,
         term_name = EXCLUDED.term_name`,
      [
        course.id,
        course.name,
        course.course_code,
        course.start_at,
        course.end_at,
        course.syllabus_body,
        course.term?.name ?? null,
      ]
    );
  }

  async upsertAssignment(assignment: CanvasAssignment): Promise<void> {
    await this.client.query(
      `INSERT INTO assignments (id, course_id, name, description, due_at, points_possible, grading_type, submission_types, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         due_at = EXCLUDED.due_at,
         points_possible = EXCLUDED.points_possible,
         grading_type = EXCLUDED.grading_type,
         submission_types = EXCLUDED.submission_types,
         position = EXCLUDED.position`,
      [
        assignment.id,
        assignment.course_id,
        assignment.name,
        assignment.description,
        assignment.due_at,
        assignment.points_possible,
        assignment.grading_type,
        assignment.submission_types,
        assignment.position,
      ]
    );
  }

  async upsertModule(module: CanvasModule, courseId: number): Promise<void> {
    await this.client.query(
      `INSERT INTO modules (id, course_id, name, position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET
         course_id = EXCLUDED.course_id,
         name = EXCLUDED.name,
         position = EXCLUDED.position`,
      [module.id, courseId, module.name, module.position]
    );
  }

  async upsertModuleItem(
    item: { id: number; module_id: number; position: number; title: string; type: string; content_id: number | null },
    courseId: number
  ): Promise<void> {
    await this.client.query(
      `INSERT INTO module_items (id, module_id, course_id, title, type, content_id, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         module_id = EXCLUDED.module_id,
         course_id = EXCLUDED.course_id,
         title = EXCLUDED.title,
         type = EXCLUDED.type,
         content_id = EXCLUDED.content_id,
         position = EXCLUDED.position`,
      [
        item.id,
        item.module_id,
        courseId,
        item.title,
        item.type,
        item.content_id,
        item.position,
      ]
    );
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}
