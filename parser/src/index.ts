import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { CanvasClient } from "./canvas-client.js";
import { Database } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

async function main(): Promise<void> {
  const client = new CanvasClient();
  const db = new Database();
  await db.init();

  const courses = await client.getCourses();
  console.log(`Fetched ${courses.length} courses from Canvas`);

  let totalAssignments = 0;
  let totalModules = 0;
  let totalModuleItems = 0;

  for (const course of courses) {
    await db.upsertCourse(course);
    console.log(`  [${course.course_code}] ${course.name}`);

    const assignments = await client.getAssignments(course.id);
    for (const assignment of assignments) {
      await db.upsertAssignment(assignment);
    }
    totalAssignments += assignments.length;
    console.log(`    ${assignments.length} assignments`);

    const modules = await client.getModules(course.id);
    for (const mod of modules) {
      await db.upsertModule(mod, course.id);
      if (mod.items) {
        for (const item of mod.items) {
          await db.upsertModuleItem(item, course.id);
          totalModuleItems++;
        }
      }
    }
    totalModules += modules.length;
    console.log(`    ${modules.length} modules, ${totalModuleItems} items`);
  }

  console.log(
    `\nDone. ${courses.length} courses, ${totalAssignments} assignments, ${totalModules} modules, ${totalModuleItems} module items`
  );

  await db.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
