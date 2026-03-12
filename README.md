# Personal Canvas

An AI-powered academic planning assistant built on top of Canvas LMS data. Not a chatbot. Not a planner. A partner that knows your courses, remembers you, and tells you what to do next.

---

## The Problem

Canvas is the source of truth for a student's academic life — deadlines, syllabi, grades, announcements. But it doesn't tell you what to do with any of it. It's a filing cabinet. Personal Canvas turns that data into a live, reactive plan that works with you across every session.

---

## What It Does

- **Daily briefing**: On load, the AI scans upcoming deadlines, overdue work, and recent announcements and generates a personalized summary. It knows when two midterms cluster in the same week.
- **Course intelligence**: For each course, the AI reads the syllabus, current grade, submission history, and active module — then generates next steps, effort estimates, and curated study resources.
- **Conversational agent**: A multi-step AI agent with 9 typed tools that queries your live Canvas data and renders structured UI cards alongside its responses.
- **Persistent memory**: Auto-extracts preferences and context from your messages. Stores them as searchable memories via vector embeddings. Recalls them in future sessions without you repeating yourself.
- **Reactive planner**: Every session recomputes a live snapshot — due today, overdue, today's events, recent announcements — and injects it into the AI's context automatically.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| AI Runtime | Vercel AI SDK — `streamText`, typed tools, multi-step loops |
| Models | OpenRouter model/BYOK configurable |
| Database | PostgreSQL 16 + pgvector (Docker) |
| ORM / Queries | Raw `pg` with parameterized SQL |
| Memory Search | pgvector cosine similarity (2048-dim) |
| UI | Tailwind CSS, Radix UI, Framer Motion |

---

## Architecture

### Tool-Calling Agent

`/api/chat` runs a `streamText` loop with up to 8 steps per turn. Nine typed tools — each backed by a parameterized SQL template, no model-generated SQL — query the Canvas-mirrored schema and return structured payloads. Each payload includes a `uiTarget` field so the frontend renders the right component automatically.

Tools: `getDashboardSnapshot`, `getCourseOverview`, `getCourseTimeline`, `getCourseResources`, `getSubmissionInsights`, `searchAssignments`, `getTodayPlanSnapshot`, `saveMemory`, `searchMemories`.

### Session Persistence

Chat sessions are stored server-side in Postgres as `UIMessage[]` JSON with a per-session lock queue to prevent concurrent write races. When a session exceeds 30 messages, older turns are compacted into a rolling summary via a secondary LLM call, keeping the context window focused without losing history.

### Memory Layer

Memories are extracted automatically from user messages and stored in `chat_memories`. Every memory is embedded with a 2048-dimensional vector. Recall uses hybrid search — vector cosine distance for embedded entries, ILIKE for unembedded ones. The AI also has an explicit `saveMemory` tool it can invoke.

### Reactive Planner

On every chat request, the system recomputes a planner snapshot (assignments due today, overdue work, today's calendar events, recent announcements) and compares it against the stored signature. If anything changed, a `planner-updated` event fires and the live counts are injected into the AI's system prompt. The AI always knows your current workload state.

### Schema

We mirror the Canvas LMS schema precisely — `courses`, `assignments`, `modules`, `module_items`, `submissions`, `course_enrollments`, `assignment_groups`, `announcements`, `quizzes`, `discussions`, `pages`, `files`, `calendar_events`, `course_grade_snapshots` — extended with AI-runtime tables: `chat_sessions`, `chat_memories`, `chat_planner_state`, `chat_planner_events`.

This design means a real-time Canvas ETL layer would require no changes to the AI layer or UI — just a parser swap.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker

### Setup

```bash
# Start PostgreSQL with pgvector
docker compose up -d

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Fill in DATABASE_URL and OPENROUTER_API_KEY

# Seed the database
psql postgres://canvas:canvas@localhost:5432/canvas -f Seed.sql

# Run the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Backfill Embeddings (optional but recommended)

```bash
curl -X POST http://localhost:3000/api/admin/backfill-embeddings
```

This embeds course syllabi and assignment descriptions for semantic search.

---

## Project Structure

```
app/
  api/
    chat/              # Main AI agent endpoint (streamText + tools)
    course-analysis/   # Course-level AI insight generation
    dashboard-analysis/# Dashboard briefing generation
    admin/             # Backfill + admin utilities
  chat/                # Chat UI
  courses/             # Course pages
lib/
  ai/
    chat-tools.ts      # 9 typed tools
    chat-store.ts      # Session persistence, memory, planner
    embeddings.ts      # Embedding generation
  db.ts                # Postgres pool
docs/
  Schema.md            # Full schema documentation
  DataDefinitions.md   # Canonical field definitions
parser/
  init.sql             # Schema definition
Seed.sql               # Demo data
```

---

## What's Next

The natural next step is **direct Canvas API integration** — a real-time ETL parser that polls the Canvas REST API and upserts into the existing schema. The data model is already Canvas-compatible; no AI or UI changes required. With live data, the planner reacts to grade updates, new assignment releases, and due date changes as they happen.

---

*Built for a hackathon. Genuinely want to use it.*
