import { query } from "@/lib/db";
import { embedText, EMBEDDING_DIMS } from "@/lib/ai/embeddings";

// Resize vector columns from 1536 → 2048 if needed (safe: columns are always NULL until this runs)
async function migrateVectorColumns(): Promise<void> {
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'assignments' AND column_name = 'embedding'
          AND udt_name = 'vector'
      ) THEN
        ALTER TABLE assignments ALTER COLUMN embedding TYPE vector(${EMBEDDING_DIMS});
      END IF;
    END $$
  `);

  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'courses' AND column_name = 'embedding'
          AND udt_name = 'vector'
      ) THEN
        ALTER TABLE courses ALTER COLUMN embedding TYPE vector(${EMBEDDING_DIMS});
      END IF;
    END $$
  `);

  // Note: pgvector ivfflat/hnsw indexes cap at 2000 dims; model outputs 2048 — exact scan is fine at demo scale
}

export async function POST(): Promise<Response> {
  let assignmentsProcessed = 0;
  let coursesProcessed = 0;
  const errors: string[] = [];

  try {
    await migrateVectorColumns();

    // Embed assignments with missing embeddings
    const assignments = await query<{ id: number; name: string; description: string | null }>(
      "SELECT id, name, description FROM assignments WHERE embedding IS NULL ORDER BY id"
    );

    for (const row of assignments.rows) {
      try {
        const text = [row.name, row.description].filter(Boolean).join(" — ");
        const vec = await embedText(text);
        await query(
          "UPDATE assignments SET embedding = $1 WHERE id = $2",
          [`[${vec.join(",")}]`, row.id]
        );
        assignmentsProcessed++;
      } catch (err) {
        errors.push(`assignment ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Embed course syllabi (strip HTML tags, ~100 words)
    const courses = await query<{ id: number; name: string; syllabus_html: string | null }>(
      "SELECT id, name, syllabus_html FROM courses WHERE embedding IS NULL ORDER BY id"
    );

    for (const row of courses.rows) {
      try {
        const syllabusText = row.syllabus_html
          ? row.syllabus_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000)
          : "";
        const text = [row.name, syllabusText].filter(Boolean).join(" — ");
        const vec = await embedText(text);
        await query(
          "UPDATE courses SET embedding = $1 WHERE id = $2",
          [`[${vec.join(",")}]`, row.id]
        );
        coursesProcessed++;
      } catch (err) {
        errors.push(`course ${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return Response.json({
      ok: true,
      assignmentsProcessed,
      coursesProcessed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
