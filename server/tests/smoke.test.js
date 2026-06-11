/**
 * API smoke test suite — covers every core user journey end-to-end
 * against a real server + real database.
 *
 * Run from the server directory:  npm test
 *
 * Spawns its own server instance on a random port (NODE_ENV=production),
 * so it can run while the PM2 instance keeps serving the family on :5000.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const pool = require('../src/db/pool');

const PORT = 5600 + Math.floor(Math.random() * 200);
const BASE = `http://localhost:${PORT}/api`;

const ADMIN = { email: 'admin@elevenplus.local', password: 'admin123' };
const STUDENT = { email: 'ayansh@elevenplus.local', password: 'ayansh123' };

let serverProc;
let adminToken;
let studentToken;

async function api(pathname, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  return { status: res.status, data };
}

before(async () => {
  serverProc = spawn(process.execPath, [path.join(__dirname, '../src/index.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
  });

  // Wait for the server to come up
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server did not start on port ${PORT}`);
});

const createdAttemptIds = [];

after(async () => {
  // Remove attempts created by this test run so the real student's progress stays clean
  if (createdAttemptIds.length) {
    await pool.query('DELETE FROM answers WHERE attempt_id = ANY($1)', [createdAttemptIds]);
    await pool.query('DELETE FROM attempts WHERE id = ANY($1)', [createdAttemptIds]);
  }
  await pool.end();
  serverProc?.kill();
});

// ── Auth ─────────────────────────────────────────────────────────────────────

test('health endpoint responds', async () => {
  const { status, data } = await api('/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
});

test('admin can log in', async () => {
  const { status, data } = await api('/auth/login', { method: 'POST', body: ADMIN });
  assert.equal(status, 200, JSON.stringify(data));
  assert.ok(data.token, 'expected a JWT token');
  assert.equal(data.user.role, 'admin');
  adminToken = data.token;
});

test('student can log in', async () => {
  const { status, data } = await api('/auth/login', { method: 'POST', body: STUDENT });
  assert.equal(status, 200, JSON.stringify(data));
  assert.ok(data.token);
  assert.equal(data.user.role, 'student');
  studentToken = data.token;
});

test('wrong password is rejected', async () => {
  const { status } = await api('/auth/login', { method: 'POST', body: { ...STUDENT, password: 'wrong' } });
  assert.equal(status, 401);
});

test('protected endpoint rejects missing token', async () => {
  const { status } = await api('/papers');
  assert.equal(status, 401);
});

// ── Reference data ───────────────────────────────────────────────────────────

test('reference data has subjects with icons and schools linked to exam types', async () => {
  const { status, data } = await api('/reference', { token: studentToken });
  assert.equal(status, 200);
  assert.ok(data.subjects.length >= 4, 'expected at least 4 subjects');
  for (const s of data.subjects) {
    assert.ok(s.icon, `subject ${s.slug} should have an icon (regression: VALUES join nulled icons)`);
  }
  assert.ok(data.schools.length >= 3, 'expected at least 3 schools');
  for (const sc of data.schools) {
    assert.ok('exam_type_id' in sc, `school ${sc.slug} should expose exam_type_id (onboarding auto-select)`);
  }
});

// ── Papers & questions (every paper must be renderable) ─────────────────────

test('every published paper serves valid questions, options and passages', async () => {
  const { status, data: papers } = await api('/papers', { token: studentToken });
  assert.equal(status, 200);
  assert.ok(Array.isArray(papers) && papers.length > 0, 'expected at least one paper');

  for (const p of papers) {
    const [qRes, passRes] = await Promise.all([
      api(`/questions?paperId=${p.id}`, { token: studentToken }),
      api(`/passages?paperId=${p.id}`, { token: studentToken }),
    ]);
    assert.equal(qRes.status, 200, `questions failed for "${p.title}"`);
    assert.equal(passRes.status, 200, `passages failed for "${p.title}"`);

    for (const q of qRes.data) {
      assert.ok(q.question_text, `empty question_text in "${p.title}"`);
      assert.ok(['mcq', 'free_text'].includes(q.question_type), `bad type in "${p.title}"`);
      if (q.question_type === 'mcq') {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2,
          `MCQ ${q.id} in "${p.title}" should have 2+ options`);
        for (const o of q.options) {
          assert.ok(o.optionLabel && o.optionText != null,
            `malformed option in "${p.title}" question ${q.id}`);
        }
      }
      // Questions referencing a passage must reference one that exists
      if (q.passage_id) {
        assert.ok(passRes.data.some(ps => ps.id === q.passage_id),
          `question ${q.id} in "${p.title}" references missing passage ${q.passage_id}`);
      }
    }
  }
});

// ── Student attempt flow ─────────────────────────────────────────────────────

test('student can start, answer, submit an attempt and see results', async () => {
  const { data: papers } = await api('/papers', { token: studentToken });
  const paper = papers.find(p => p.status === 'published' && p.question_count > 0);
  assert.ok(paper, 'need a published paper with questions');

  const start = await api('/attempts/start', { method: 'POST', token: studentToken, body: { paperId: paper.id } });
  assert.ok([200, 201].includes(start.status), JSON.stringify(start.data));
  const attemptId = start.data.attemptId;
  assert.ok(attemptId);
  createdAttemptIds.push(attemptId);

  const { data: questions } = await api(`/questions?paperId=${paper.id}`, { token: studentToken });
  const mcq = questions.find(q => q.question_type === 'mcq' && q.options?.length);
  if (mcq) {
    const ans = await api(`/attempts/${attemptId}/answer`, {
      method: 'POST', token: studentToken,
      body: { questionId: mcq.id, selectedOptionId: mcq.options[0].id },
    });
    assert.equal(ans.status, 200, JSON.stringify(ans.data));
  }

  const submit = await api(`/attempts/${attemptId}/submit`, {
    method: 'POST', token: studentToken, body: { timeTakenSecs: 60 },
  });
  assert.equal(submit.status, 200, JSON.stringify(submit.data));

  const results = await api(`/attempts/${attemptId}/results`, { token: studentToken });
  assert.equal(results.status, 200);
  assert.ok(results.data.attempt, 'results should include the attempt');
  assert.ok(Array.isArray(results.data.answers), 'results should include answers');

  // Score must be out of the WHOLE paper, not just answered questions
  assert.equal(results.data.answers.length, questions.length,
    'results must include every question in the paper (skipped ones too)');
  const paperMarks = questions.reduce((s, q) => s + q.marks, 0);
  assert.equal(results.data.attempt.max_score, paperMarks,
    `max_score should equal the paper total (${paperMarks}), got ${results.data.attempt.max_score}`);
});

test('student progress endpoint returns coherent stats', async () => {
  const { status, data } = await api('/student/progress', { token: studentToken });
  assert.equal(status, 200);
  assert.ok(data.overall, 'expected overall stats');
  assert.ok(Array.isArray(data.attempts));
  assert.ok(Array.isArray(data.subjectStats));
});

test('student profile returns school and exam type fields', async () => {
  const { status, data } = await api('/student/profile', { token: studentToken });
  assert.equal(status, 200);
  assert.ok('school_name' in data, 'profile should include school_name');
  assert.ok('onboarded' in data, 'profile should include onboarded flag');
});

// ── Admin endpoints ──────────────────────────────────────────────────────────

test('admin stats endpoint works', async () => {
  const { status, data } = await api('/admin/stats', { token: adminToken });
  assert.equal(status, 200);
  assert.ok(typeof data.publishedPapers === 'number');
  assert.ok(typeof data.pendingMarking === 'number');
});

test('admin students list includes school and exam type columns', async () => {
  const { status, data } = await api('/admin/students', { token: adminToken });
  assert.equal(status, 200);
  assert.ok(data.length >= 1, 'expected at least one student');
  assert.ok('school_name' in data[0], 'students should include school_name');
  assert.ok('exam_type_name' in data[0], 'students should include exam_type_name');
});

test('admin can reset a student password (and login still works after)', async () => {
  const { data: students } = await api('/admin/students', { token: adminToken });
  const ayansh = students.find(s => s.email === STUDENT.email);
  assert.ok(ayansh, 'test student must exist');

  // Reset to the SAME password so we never break the real account
  const reset = await api(`/admin/students/${ayansh.id}/reset-password`, {
    method: 'POST', token: adminToken, body: { newPassword: STUDENT.password },
  });
  assert.equal(reset.status, 200, JSON.stringify(reset.data));

  const relogin = await api('/auth/login', { method: 'POST', body: STUDENT });
  assert.equal(relogin.status, 200, 'student must still be able to log in after reset');
});

test('admin reset-password rejects short passwords', async () => {
  const { data: students } = await api('/admin/students', { token: adminToken });
  const { status } = await api(`/admin/students/${students[0].id}/reset-password`, {
    method: 'POST', token: adminToken, body: { newPassword: 'abc' },
  });
  assert.equal(status, 400);
});

test('student cannot access admin endpoints', async () => {
  const { status } = await api('/admin/stats', { token: studentToken });
  assert.equal(status, 403);
});

test('marking queue endpoint responds', async () => {
  const { status, data } = await api('/marking/queue', { token: adminToken });
  assert.equal(status, 200, JSON.stringify(data));
  assert.ok(Array.isArray(data), 'marking queue should be an array');
});
