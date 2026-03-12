# Data Definitions

Canonical definitions used across the UI and AI prompts. AI output must be consistent with these rules.

---

## Grades

| Field | Source | Meaning |
|---|---|---|
| `current_score` | `course_enrollments.current_score` | Running percentage (0–100) based on graded work so far |
| `current_grade` | `course_enrollments.current_grade` | Letter grade derived from `current_score` (A, B, C, D, F) |
| `final_score` | `course_enrollments.final_score` | Score including unsubmitted work as zero |
| `final_grade` | `course_enrollments.final_grade` | Letter grade derived from `final_score` |

**Display rule**: Show `current_grade` as the prominent grade. Show `current_score` as the percentage beneath it. Never show both `current` and `final` unless they differ — when they differ, show `final` with a warning indicator (unsubmitted work drags it down).

**Progress bar**: Driven by `current_score`. Full bar = 100%. No bar if `current_score` is null.

---

## Priority Levels (AI-generated)

Used in "Next 48 Hours" steps inside Course AI Insights.

| Level | Rule |
|---|---|
| `high` | Due within 48 hours, or an exam/quiz, or a missing submission |
| `medium` | Due within 7 days |
| `low` | Due more than 7 days away, or a reading/prep task |

**AI prompt rule**: Always assign priority based on the due date relative to today. Never assign `high` to tasks > 48 hours away unless it is an exam.

---

## Effort Levels (AI-generated)

Used in the "Assignment Breakdown" inside Course AI Insights.

| Level | Expected Time | Examples |
|---|---|---|
| `high` | > 4 hours | Final project, research paper, major coding assignment |
| `medium` | 2–4 hours | Problem set, lab report, short coding task |
| `low` | < 2 hours | Reading, quiz, single-problem homework |

---

## Submission States

Sourced from `submissions` table. Display rules for assignment rows:

| State | Visual |
|---|---|
| `graded` + `score` set | Show score (e.g. "85/100") in green |
| `submitted` (not yet graded) | "Submitted" in blue |
| `missing = true` | "Missing" in red |
| `late = true` | "Late" in amber (can co-exist with `graded`) |
| No submission row | Show nothing (assignment not yet attempted) |

---

## Assignment Groups

Sourced from `assignment_groups`. Each group has a `group_weight` (percentage of final grade). Display as tiles in the Grade Breakdown card. Sum of all weights = 100%.

---

## Resources (AI-generated)

Used in Course AI Insights to suggest study materials.

| Field | Rule |
|---|---|
| `title` | Short human-readable label (e.g. "3Blue1Brown – Statistics playlist") |
| `query` | Exact YouTube search query or URL search string |
| `type` | `youtube` or `article` |

**AI prompt rule**: Suggest 3–5 resources that directly match the current module's topics. Prefer well-known channels (3Blue1Brown, Khan Academy, MIT OpenCourseWare, StatQuest, etc.) over generic queries.

---

## Course Progress Bar (Homepage)

Displayed on course cards on the home page.

- Driven by `current_score` from `course_enrollments`
- If `current_score` is null → no bar, show "No grade yet"
- Color: use `bg-primary/70` (theme color)
- Width: `Math.min(current_score, 100)%`
