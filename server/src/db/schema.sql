-- ============================================================
-- 11+ Exam Website — PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS & ROLES
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'student', 'parent');

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role        user_role NOT NULL DEFAULT 'student',
  full_name   VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE student_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year_group      SMALLINT,           -- e.g. 5 or 6
  date_of_birth   DATE,
  avatar_emoji    VARCHAR(10) DEFAULT '⭐',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE parent_student_links (
  parent_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);

-- ============================================================
-- REFERENCE DATA
-- ============================================================

CREATE TABLE exam_types (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name    VARCHAR(50) UNIQUE NOT NULL,   -- FSCE, GL, CEM
  slug    VARCHAR(50) UNIQUE NOT NULL,   -- fsce, gl, cem
  description TEXT
);

CREATE TABLE schools (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) UNIQUE NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  exam_type_id UUID REFERENCES exam_types(id),
  county      VARCHAR(100),
  description TEXT
);

CREATE TABLE subjects (
  id      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name    VARCHAR(100) UNIQUE NOT NULL,  -- Maths, English, Verbal Reasoning, Non-Verbal Reasoning
  slug    VARCHAR(100) UNIQUE NOT NULL,
  icon    VARCHAR(10) DEFAULT '📚'       -- emoji icon for kid-friendly UI
);

-- ============================================================
-- PAPERS & WORKSHEETS
-- ============================================================

CREATE TYPE paper_type AS ENUM ('full_paper', 'worksheet', 'mini_test');
CREATE TYPE paper_status AS ENUM ('draft', 'published');

CREATE TABLE papers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  paper_type      paper_type NOT NULL DEFAULT 'full_paper',
  status          paper_status NOT NULL DEFAULT 'draft',
  subject_id      UUID REFERENCES subjects(id),
  exam_type_id    UUID REFERENCES exam_types(id),
  school_id       UUID REFERENCES schools(id),   -- NULL means applies to all schools
  time_limit_mins SMALLINT,                       -- NULL means untimed
  total_marks     SMALLINT,
  pdf_url         VARCHAR(500),                   -- uploaded PDF version
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUESTIONS
-- ============================================================

CREATE TYPE question_type AS ENUM ('mcq', 'free_text');

CREATE TABLE questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  paper_id        UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  question_text   TEXT NOT NULL,
  question_type   question_type NOT NULL DEFAULT 'mcq',
  marks           SMALLINT NOT NULL DEFAULT 1,
  order_index     SMALLINT NOT NULL DEFAULT 0,
  image_url       VARCHAR(500),         -- optional image for the question
  hint            TEXT,                 -- optional hint shown to student
  explanation     TEXT,                 -- shown after answer revealed
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mcq_options (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question_id     UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_text     TEXT NOT NULL,
  option_label    CHAR(1) NOT NULL,     -- A, B, C, D, E
  is_correct      BOOLEAN NOT NULL DEFAULT FALSE,
  order_index     SMALLINT NOT NULL DEFAULT 0
);

-- ============================================================
-- AI GENERATION QUEUE
-- ============================================================

CREATE TYPE ai_gen_status AS ENUM ('pending', 'generated', 'approved', 'rejected');

CREATE TABLE ai_generation_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt          TEXT NOT NULL,
  subject_id      UUID REFERENCES subjects(id),
  exam_type_id    UUID REFERENCES exam_types(id),
  num_questions   SMALLINT NOT NULL DEFAULT 5,
  difficulty      VARCHAR(20) DEFAULT 'medium',   -- easy, medium, hard
  status          ai_gen_status NOT NULL DEFAULT 'pending',
  raw_response    JSONB,              -- Claude's raw output
  paper_id        UUID REFERENCES papers(id),     -- assigned after approval
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ
);

-- ============================================================
-- ATTEMPTS & ANSWERS
-- ============================================================

CREATE TYPE attempt_status AS ENUM ('in_progress', 'submitted', 'marked');

CREATE TABLE attempts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paper_id        UUID NOT NULL REFERENCES papers(id),
  status          attempt_status NOT NULL DEFAULT 'in_progress',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at    TIMESTAMPTZ,
  marked_at       TIMESTAMPTZ,
  auto_score      SMALLINT,   -- marks from MCQ (auto-calculated)
  manual_score    SMALLINT,   -- marks from free-text (admin-assigned)
  total_score     SMALLINT,   -- auto_score + manual_score
  max_score       SMALLINT,
  time_taken_secs INT
);

CREATE TABLE answers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attempt_id          UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id         UUID NOT NULL REFERENCES questions(id),
  -- MCQ
  selected_option_id  UUID REFERENCES mcq_options(id),
  is_correct          BOOLEAN,            -- auto-set for MCQ
  -- Free text
  free_text_answer    TEXT,
  awarded_marks       SMALLINT,           -- admin fills in for free-text
  admin_feedback      TEXT,               -- admin comment on the answer
  marked_by           UUID REFERENCES users(id),
  marked_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

-- ============================================================
-- MARKING QUEUE VIEW
-- ============================================================

CREATE VIEW marking_queue AS
SELECT
  a.id            AS answer_id,
  att.id          AS attempt_id,
  att.student_id,
  u.full_name     AS student_name,
  p.title         AS paper_title,
  s.name          AS subject_name,
  q.question_text,
  q.marks         AS max_marks,
  a.free_text_answer,
  a.awarded_marks,
  a.marked_at
FROM answers a
JOIN attempts att       ON att.id = a.attempt_id
JOIN users u            ON u.id = att.student_id
JOIN questions q        ON q.id = a.question_id
JOIN papers p           ON p.id = att.paper_id
LEFT JOIN subjects s    ON s.id = p.subject_id
WHERE q.question_type = 'free_text'
  AND att.status = 'submitted'
  AND a.marked_at IS NULL
ORDER BY att.submitted_at ASC;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_papers_subject       ON papers(subject_id);
CREATE INDEX idx_papers_exam_type     ON papers(exam_type_id);
CREATE INDEX idx_papers_school        ON papers(school_id);
CREATE INDEX idx_papers_status        ON papers(status);
CREATE INDEX idx_questions_paper      ON questions(paper_id);
CREATE INDEX idx_mcq_options_question ON mcq_options(question_id);
CREATE INDEX idx_attempts_student     ON attempts(student_id);
CREATE INDEX idx_attempts_paper       ON attempts(paper_id);
CREATE INDEX idx_answers_attempt      ON answers(attempt_id);
CREATE INDEX idx_answers_question     ON answers(question_id);
