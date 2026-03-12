import type {
  CanvasCourse,
  CanvasAssignment,
  CanvasModule,
} from "./types/canvas.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseLinkHeader(header: string | null): string | null {
  if (!header) return null;
  const links = header.split(",");
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

export class CanvasClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    this.baseUrl = requiredEnv("CANVAS_BASE_URL");
    this.token = requiredEnv("CANVAS_TOKEN");
  }

  private async fetchAllPages<T>(initialUrl: string): Promise<T[]> {
    const results: T[] = [];
    let url: string | null = initialUrl;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `Canvas API error: ${response.status} ${response.statusText} — ${url}\n${body}`
        );
      }

      const data: T[] = await response.json();
      results.push(...data);

      url = parseLinkHeader(response.headers.get("Link"));
    }

    return results;
  }

  async getCourses(): Promise<CanvasCourse[]> {
    const params = new URLSearchParams({
      enrollment_state: "active",
      per_page: "50",
      "include[]": "syllabus_body",
    });

    const url = `${this.baseUrl}/api/v1/courses?${params}&include[]=term`;
    return this.fetchAllPages<CanvasCourse>(url);
  }

  async getAssignments(courseId: number): Promise<CanvasAssignment[]> {
    const params = new URLSearchParams({
      per_page: "50",
      order_by: "due_at",
    });

    const url = `${this.baseUrl}/api/v1/courses/${courseId}/assignments?${params}`;
    return this.fetchAllPages<CanvasAssignment>(url);
  }

  async getModules(courseId: number): Promise<CanvasModule[]> {
    const params = new URLSearchParams({
      per_page: "50",
      "include[]": "items",
    });

    const url = `${this.baseUrl}/api/v1/courses/${courseId}/modules?${params}`;
    return this.fetchAllPages<CanvasModule>(url);
  }
}
