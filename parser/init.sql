CREATE EXTENSION IF NOT EXISTS vector;

-- Rebuild schema deterministically for fresh-start environments.
DROP TABLE IF EXISTS course_grade_snapshots CASCADE;
DROP TABLE IF EXISTS calendar_events CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS pages CASCADE;
DROP TABLE IF EXISTS discussions CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS submissions CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS course_enrollments CASCADE;
DROP TABLE IF EXISTS module_items CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS assignments CASCADE;
DROP TABLE IF EXISTS assignment_groups CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS courses CASCADE;

CREATE TABLE courses (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    term_name TEXT,
    workflow_state TEXT,
    default_view TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    time_zone TEXT,
    syllabus_html TEXT,
    syllabus_updated_at TIMESTAMPTZ,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    embedding vector(1536)
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    sortable_name TEXT,
    short_name TEXT,
    sis_user_id TEXT,
    login_id TEXT,
    avatar_url TEXT,
    pronouns TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assignment_groups (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    group_weight REAL,
    position INTEGER,
    rules JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assignments (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    assignment_group_id INTEGER REFERENCES assignment_groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    due_at TIMESTAMPTZ,
    unlock_at TIMESTAMPTZ,
    lock_at TIMESTAMPTZ,
    points_possible REAL,
    grading_type TEXT,
    submission_types TEXT[],
    position INTEGER,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    workflow_state TEXT,
    html_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    embedding vector(1536)
);

CREATE TABLE modules (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER,
    unlock_at TIMESTAMPTZ,
    require_sequential_progress BOOLEAN NOT NULL DEFAULT FALSE,
    prerequisite_module_ids INTEGER[] NOT NULL DEFAULT '{}',
    items_count INTEGER,
    state TEXT,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE module_items (
    id INTEGER PRIMARY KEY,
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    content_id INTEGER,
    html_url TEXT,
    url TEXT,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    indent INTEGER,
    position INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE course_enrollments (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT,
    role TEXT,
    role_id INTEGER,
    enrollment_state TEXT,
    associated_user_id INTEGER,
    limit_privileges_to_course_section BOOLEAN,
    current_score REAL,
    current_grade TEXT,
    final_score REAL,
    final_grade TEXT,
    last_activity_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (course_id, user_id, role)
);

CREATE TABLE announcements (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message_html TEXT,
    posted_at TIMESTAMPTZ,
    delayed_post_at TIMESTAMPTZ,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    read_state TEXT,
    html_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE submissions (
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submitted_at TIMESTAMPTZ,
    graded_at TIMESTAMPTZ,
    posted_at TIMESTAMPTZ,
    score REAL,
    grade TEXT,
    entered_score REAL,
    entered_grade TEXT,
    attempt INTEGER,
    late BOOLEAN NOT NULL DEFAULT FALSE,
    missing BOOLEAN NOT NULL DEFAULT FALSE,
    excused BOOLEAN NOT NULL DEFAULT FALSE,
    workflow_state TEXT,
    submission_type TEXT,
    body TEXT,
    url TEXT,
    seconds_late INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (assignment_id, user_id)
);

CREATE TABLE quizzes (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    quiz_type TEXT,
    scoring_policy TEXT,
    due_at TIMESTAMPTZ,
    unlock_at TIMESTAMPTZ,
    lock_at TIMESTAMPTZ,
    time_limit INTEGER,
    allowed_attempts INTEGER,
    points_possible REAL,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    html_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE discussions (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message_html TEXT,
    discussion_type TEXT,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    allow_rating BOOLEAN NOT NULL DEFAULT FALSE,
    only_graders_can_rate BOOLEAN NOT NULL DEFAULT FALSE,
    sort_by_rating BOOLEAN NOT NULL DEFAULT FALSE,
    posted_at TIMESTAMPTZ,
    delayed_post_at TIMESTAMPTZ,
    lock_at TIMESTAMPTZ,
    todo_date TIMESTAMPTZ,
    html_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pages (
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    body_html TEXT,
    front_page BOOLEAN NOT NULL DEFAULT FALSE,
    published BOOLEAN NOT NULL DEFAULT TRUE,
    editing_roles TEXT,
    last_edited_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at_canvas TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (course_id, url)
);

CREATE TABLE files (
    id INTEGER PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    filename TEXT,
    content_type TEXT,
    size_bytes BIGINT,
    url TEXT,
    thumbnail_url TEXT,
    folder_id INTEGER,
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    locked BOOLEAN NOT NULL DEFAULT FALSE,
    unlock_at TIMESTAMPTZ,
    lock_at TIMESTAMPTZ,
    created_at_canvas TIMESTAMPTZ,
    updated_at_canvas TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE calendar_events (
    id INTEGER PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_at TIMESTAMPTZ,
    end_at TIMESTAMPTZ,
    location_name TEXT,
    location_address TEXT,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    all_day_date DATE,
    context_code TEXT,
    workflow_state TEXT,
    html_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE course_grade_snapshots (
    id BIGSERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_score REAL,
    current_grade TEXT,
    final_score REAL,
    final_grade TEXT,
    source TEXT,
    UNIQUE (course_id, user_id, captured_at)
);

CREATE INDEX idx_assignment_groups_course_id ON assignment_groups(course_id);
CREATE INDEX idx_assignments_course_id ON assignments(course_id);
CREATE INDEX idx_assignments_due_at ON assignments(due_at);
CREATE INDEX idx_assignments_group_id ON assignments(assignment_group_id);
CREATE INDEX idx_modules_course_id ON modules(course_id);
CREATE INDEX idx_module_items_module_id ON module_items(module_id);
CREATE INDEX idx_module_items_course_id ON module_items(course_id);
CREATE INDEX idx_course_enrollments_course_id ON course_enrollments(course_id);
CREATE INDEX idx_course_enrollments_user_id ON course_enrollments(user_id);
CREATE INDEX idx_course_enrollments_role ON course_enrollments(role);
CREATE INDEX idx_announcements_course_posted_at ON announcements(course_id, posted_at DESC);
CREATE INDEX idx_submissions_course_user ON submissions(course_id, user_id);
CREATE INDEX idx_submissions_submitted_at ON submissions(submitted_at);
CREATE INDEX idx_quizzes_course_due_at ON quizzes(course_id, due_at);
CREATE INDEX idx_discussions_course_posted_at ON discussions(course_id, posted_at DESC);
CREATE INDEX idx_pages_course_title ON pages(course_id, title);
CREATE INDEX idx_files_course_updated_at ON files(course_id, updated_at_canvas DESC);
CREATE INDEX idx_calendar_events_course_start_at ON calendar_events(course_id, start_at);
CREATE INDEX idx_calendar_events_assignment_id ON calendar_events(assignment_id);
CREATE INDEX idx_course_grade_snapshots_course_user_captured ON course_grade_snapshots(course_id, user_id, captured_at DESC);
