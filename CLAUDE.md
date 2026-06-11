# 11+ Exam Prep Website — Project Context for Claude

## What this is

A local-network 11+ exam preparation website for Ayansh (age 9–10) preparing for **QE Boys Barnet** (FSCE exam type) grammar school entrance. Admin is Bharath (solution architect). Also covers GL/CEM exam types for other schools.

**Not cloud-hosted** — runs on a Windows 11 machine at `http://192.168.1.218:5000`, LAN only.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Tailwind CSS (Create React App) |
| Backend | Node.js + Express |
| Database | PostgreSQL 16 (local) |
| Process manager | PM2 with `ecosystem.config.js` |
| Auth | JWT (bcryptjs, 12 salt rounds) |
| PDF extraction | pdfjs-dist 3.11.174 (legacy build) |
| AI features | claude.ai subscription (clipboard workflow — NO API key) |
| Tests | `node --test` (server smoke), Jest (client unit) |

---

## How to run

```powershell
# Start (production mode — REQUIRED for static React to be served)
cd "C:\Bharath\AI\Code\11+ website\server"
pm2 start ecosystem.config.js

# Or without PM2:
cd "C:\Bharath\AI\Code\11+ website"
set NODE_ENV=production && node server/src/index.js

# Build frontend after changes
cd client && npm run build

# Run tests
cd server && npm test          # 16 smoke tests
cd client && npm test -- --watchAll=false   # 6 unit tests
```

**Critical:** PM2 must use `ecosystem.config.js` (sets `NODE_ENV=production`). If started with `pm2 start src/index.js` directly, the root URL returns 404 because static React files are only served in production mode.

---

## Environment variables

Copy `.env.example` → `.env` and fill in real values. **Never commit `.env`.**

| Variable | Purpose |
|---|---|
| `DB_HOST/PORT/NAME/USER/PASSWORD` | PostgreSQL connection |
| `JWT_SECRET` | 64-char hex string |
| `PORT` | Server port (default 5000) |
| `NODE_ENV` | Must be `production` to serve React static build |
| `PDF_PASSWORD` | **Security-sensitive** — PDF unlock password. Also the watermark email. Never store in code or commit to git. |

---

## Accounts

| Role | Username | Notes |
|---|---|---|
| Admin | admin | Full access — questions, papers, marking |
| Student | ayansh | Age 9 — primary test subject |
| Parent | (wife) | Admin workflow tester |

---

## 25-Day Development Plan

**Started:** 2026-05-31 | **Phase 4 completed as of 2026-06-11**

### Phase 1 — Architecture & Foundation (Days 1–3) ✅
- DB schema, JWT auth, user roles
- React scaffold with Tailwind
- Student + Admin routing

### Phase 2 — Admin Panel (Days 4–9) ✅
- PDF bulk import (`bulkImport.js`) with pdfjs-dist
- Question bank with passage grouping
- MCQ options management, answer key import (`applyAnswerKey.js`)
- School & exam-type management
- Student account management + password reset

### Phase 3 — Student UI (Days 10–16) ✅
- Onboarding flow (school/exam type selection)
- Test-taking UI with kid-friendly design (ages 9–10)
- Submit confirmation modal (shows unanswered count, "Show Me What I Missed" CTA)
- Results page with confetti (≥75%), skipped-question display
- Progress dashboard

### Phase 4 — Content & School Logic (Days 17–19) ✅ (Days 17–18 done)
- Content seeded: QE Boys Barnet Tests 1–10 (PDF-extracted)
- Scoring fixed: `max_score` computed from ALL paper questions (not just answered)
- Results LEFT JOIN so skipped questions appear
- AI question generation switched to claude.ai clipboard workflow (no API key)
- Admin Students page upgraded (school/exam type columns, reset password)
- ErrorBoundary added to prevent white-screen crashes

### Phase 5 — Family Testing (Days 20–23) ⏳ PENDING
- Wife tests admin workflow (create paper, mark free-text)
- Ayansh tests student UI end-to-end on phone/tablet

### Phase 6 — Deployment Polish (Days 24–25) ⏳ PENDING
- PM2 auto-start on Windows boot (Task Scheduler — requires admin elevation)
- Backup strategy for PostgreSQL
- LAN firewall rule persisted across reboots

---

## AI Features (claude.ai subscription workflow)

All AI features use copy-paste with claude.ai — **no API key needed**.

### 1. Generate new questions (Admin UI)
Admin Questions page → "🤖 Generate with AI" → builds prompt → copy to claude.ai → paste JSON back → review → save to paper.

### 2. Bulk AI answer keys (scripts)
```powershell
# Step 1: build prompt
node server/scripts/generatePrompt.js "QE Boys Barnet Practice Test 2" 15 maths
# → writes to server/ai-prompts/prompt_*.txt

# Step 2: paste prompt to claude.ai, copy JSON reply

# Step 3: save JSON reply to server/ai-prompts/new_maths_questions.json

# Step 4: import
node server/scripts/importAIQuestions.js server/ai-prompts/new_maths_questions.json "QE Test 2 Maths"
```

---

## Key Database Notes

- `mcq_options` table (not `question_options`)
- Correctness: `mcq_options.is_correct` boolean (no `correct_option_id` on questions)
- `source_question_num` on questions — tracks original PDF question number; resets to ≤5 at maths section boundary
- `passages` table — linked to questions via `questions.passage_id`
- `student_profiles` — has `school_id`, `exam_type_id`, `target_year`, `onboarded` columns

---

## Known Issues / Pending Work

- **PM2 boot**: Auto-start on Windows boot still requires manual fix (Task Scheduler with admin elevation)
- **Test 4**: Only 36 questions extracted vs 83–98 for other papers — PDF formatting differs
- **English extraction**: Only ~29/64 English questions per paper (cloze/error-correction sections not well extracted)
- **schema.sql drift**: `schema.sql` is out of date — missing `student_profiles` columns, `passages` table, `source_question_num`, `passage_id` on questions
- **Tests 2–10 answer keys**: AI answer-key workflow is ready; just needs running per paper

---

## File Layout

```
/
├── client/                  # React app (CRA)
│   └── src/
│       ├── pages/admin/     # Admin views
│       ├── pages/student/   # Student views
│       ├── components/      # Shared (ErrorBoundary, etc.)
│       └── utils/           # groupQuestionsByPassage, etc.
├── server/
│   ├── src/
│   │   ├── index.js         # Express entry point
│   │   ├── routes/          # admin, attempts, auth, marking, papers, passages, questions, student
│   │   ├── middleware/       # auth.js (JWT + requireRole)
│   │   └── db/              # pool.js, schema.sql, migrate*.js
│   ├── scripts/             # bulkImport, applyAnswerKey, generatePrompt, importAIQuestions
│   ├── tests/               # smoke.test.js (16 tests, node --test)
│   └── ecosystem.config.js  # PM2 config — always use this
├── .env                     # NOT in git — copy from .env.example
├── .env.example             # Template (no real values)
├── SETUP.md                 # Windows setup guide
└── CLAUDE.md                # This file
```
