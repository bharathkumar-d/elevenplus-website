const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  const [papers, questions, students, pending] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM papers WHERE status = 'published'"),
    pool.query('SELECT COUNT(*) FROM questions'),
    pool.query("SELECT COUNT(*) FROM users WHERE role = 'student'"),
    pool.query("SELECT COUNT(*) FROM answers a JOIN attempts att ON att.id = a.attempt_id JOIN questions q ON q.id = a.question_id WHERE q.question_type = 'free_text' AND att.status = 'submitted' AND a.marked_at IS NULL"),
  ]);
  res.json({
    publishedPapers: parseInt(papers.rows[0].count),
    totalQuestions: parseInt(questions.rows[0].count),
    totalStudents: parseInt(students.rows[0].count),
    pendingMarking: parseInt(pending.rows[0].count),
  });
});

// GET /api/admin/students
router.get('/students', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.created_at,
            sp.year_group, sp.avatar_emoji,
            sc.name AS school_name, et.name AS exam_type_name
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     LEFT JOIN schools sc ON sc.id = sp.school_id
     LEFT JOIN exam_types et ON et.id = sp.exam_type_id
     WHERE u.role = 'student' AND u.is_active = TRUE
     ORDER BY u.full_name`
  );
  res.json(rows);
});

// POST /api/admin/students/:id/reset-password
router.post('/students/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  const { rowCount } = await pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2 AND role IN ('student', 'parent')`,
    [hash, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Account not found' });
  res.json({ success: true });
});

// GET /api/admin/reference  — exam types, schools, subjects for dropdowns
router.get('/reference', async (req, res) => {
  const [examTypes, schools, subjects] = await Promise.all([
    pool.query('SELECT * FROM exam_types ORDER BY name'),
    pool.query('SELECT * FROM schools ORDER BY name'),
    pool.query('SELECT * FROM subjects ORDER BY name'),
  ]);
  res.json({
    examTypes: examTypes.rows,
    schools: schools.rows,
    subjects: subjects.rows,
  });
});

module.exports = router;
