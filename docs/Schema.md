# Database Schema

PostgreSQL 16 with `pgvector`, running via Docker.

This schema keeps the original Canvas-mirror core and adds a focused extension layer so AI + UI can query grades, instructors, announcements, and richer course context without unnecessary complexity.

---

## Core Tables (Canvas-compatible base)

### `courses`

One row per course.

Key columns:
- `id` (PK), `name`, `code`, `term_name`
- `start_date`, `end_date`
- `syllabus_html` (primary AI source)
- `workflow_state`, `default_view`, `time_zone`
- `embedding vector(1536)` for future semantic search

### `assignments`

One row per assignment.

Key columns:
- `id` (PK), `course_id` (FK → `courses`)
- `assignment_group_id` (FK → `assignment_groups`)
- `name`, `description`, `due_at`, `unlock_at`, `lock_at`
- `points_possible`, `grading_type`, `submission_types`, `position`
- `published`, `workflow_state`, `html_url`
- `embedding vector(1536)` for future semantic search

### `modules`

Course-level module containers.

Key columns:
- `id` (PK), `course_id` (FK → `courses`)
- `name`, `position`, `unlock_at`
- `require_sequential_progress`, `prerequisite_module_ids`
- `items_count`, `state`, `published`

### `module_items`

Items inside modules (assignment, page, quiz, file, link, etc.).

Key columns:
- `id` (PK), `module_id` (FK → `modules`), `course_id` (FK → `courses`)
- `title`, `type`, `content_id`, `position`
- `html_url`, `url`, `published`, `indent`

---

## Extension Tables (AI-complete context)

### `users`

Canvas people referenced in courses (student/instructor/TAs).

Key columns:
- `id` (PK), `name`, `sortable_name`, `short_name`
- `sis_user_id`, `login_id`, `avatar_url`, `pronouns`

### `course_enrollments`

User role and grade summary per course.

Key columns:
- `id` (PK), `course_id` (FK), `user_id` (FK)
- `type`, `role`, `role_id`, `enrollment_state`
- `current_score`, `current_grade`, `final_score`, `final_grade`
- `last_activity_at`
- Unique key: (`course_id`, `user_id`, `role`)

### `assignment_groups`

Weighted grading groups in a course.

Key columns:
- `id` (PK), `course_id` (FK)
- `name`, `group_weight`, `position`
- `rules` (`JSONB`)

### `submissions`

Assignment outcome/state for a user.

Key columns:
- Composite PK: (`assignment_id`, `user_id`)
- `assignment_id` (FK), `course_id` (FK), `user_id` (FK)
- `submitted_at`, `graded_at`, `posted_at`
- `score`, `grade`, `entered_score`, `entered_grade`
- `late`, `missing`, `excused`, `workflow_state`
- `attempt`, `submission_type`, `seconds_late`, `url`, `body`

### `announcements`

Course communication feed.

Key columns:
- `id` (PK), `course_id` (FK), `author_id` (FK → `users`)
- `title`, `message_html`
- `posted_at`, `delayed_post_at`
- `published`, `read_state`, `html_url`

### `quizzes`

Quiz metadata (including assignment-linked quizzes).

Key columns:
- `id` (PK), `course_id` (FK), `assignment_id` (nullable FK)
- `title`, `description`, `quiz_type`, `scoring_policy`
- `due_at`, `unlock_at`, `lock_at`
- `time_limit`, `allowed_attempts`, `points_possible`
- `published`, `html_url`

### `discussions`

Discussion topics and metadata.

Key columns:
- `id` (PK), `course_id` (FK)
- `assignment_id` (nullable FK), `user_id` (nullable FK)
- `title`, `message_html`, `discussion_type`
- `pinned`, `locked`, `published`
- `posted_at`, `delayed_post_at`, `lock_at`, `todo_date`
- `html_url`

### `pages`

Course wiki pages.

Key columns:
- Composite PK: (`course_id`, `url`)
- `course_id` (FK), `url`, `title`
- `body_html`, `front_page`, `published`, `editing_roles`
- `last_edited_by_id` (nullable FK → `users`)
- `updated_at_canvas`

### `files`

Course files for resource linking.

Key columns:
- `id` (PK), `course_id` (FK)
- `display_name`, `filename`, `content_type`
- `size_bytes`, `url`, `thumbnail_url`
- `folder_id`, `hidden`, `locked`, `unlock_at`, `lock_at`
- `created_at_canvas`, `updated_at_canvas`

### `calendar_events`

Timeline and scheduling context.

Key columns:
- `id` (PK), `course_id` (nullable FK), `assignment_id` (nullable FK)
- `title`, `description`
- `start_at`, `end_at`, `all_day`, `all_day_date`
- `location_name`, `location_address`
- `context_code`, `workflow_state`, `html_url`

### `course_grade_snapshots`

Historical grade snapshots for trend-aware AI analysis.

Key columns:
- `id` (PK), `course_id` (FK), `user_id` (FK)
- `captured_at`
- `current_score`, `current_grade`, `final_score`, `final_grade`
- `source`
- Unique key: (`course_id`, `user_id`, `captured_at`)

---

## Relationships (high-level)

```text
courses ──< assignments ──< submissions >── users
courses ──< modules ──< module_items
courses ──< assignment_groups ──< assignments
courses ──< course_enrollments >── users
courses ──< announcements >── users (author)
courses ──< quizzes
courses ──< discussions
courses ──< pages
courses ──< files
courses ──< calendar_events
courses ──< course_grade_snapshots >── users
```

Foreign keys cascade on course deletion unless explicitly set to `SET NULL` (for optional links like announcement authors or assignment-linked quiz/discussion rows).

---

## Index Strategy

Main indexes:
- `assignments(course_id)`, `assignments(due_at)`
- `modules(course_id)`, `module_items(module_id)`, `module_items(course_id)`
- `course_enrollments(course_id)`, `course_enrollments(user_id)`, `course_enrollments(role)`
- `submissions(course_id, user_id)`, `submissions(submitted_at)`
- `announcements(course_id, posted_at DESC)`
- `quizzes(course_id, due_at)`
- `discussions(course_id, posted_at DESC)`
- `pages(course_id, title)`
- `files(course_id, updated_at_canvas DESC)`
- `calendar_events(course_id, start_at)`, `calendar_events(assignment_id)`
- `course_grade_snapshots(course_id, user_id, captured_at DESC)`

---

