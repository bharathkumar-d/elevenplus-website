const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();
router.use(authenticate, requireRole('student'));

// GET /api/student/profile
router.get('/profile', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT u.full_name, u.email,
           sp.year_group, sp.avatar_emoji, sp.target_year, sp.onboarded,
           sp.school_id, sp.exam_type_id,
           sc.name AS school_name, sc.slug AS school_slug,
           et.name AS exam_type_name, et.slug AS exam_type_slug
    FROM users u
    LEFT JOIN student_profiles sp ON sp.user_id = u.id
    LEFT JOIN schools sc ON sc.id = sp.school_id
    LEFT JOIN exam_types et ON et.id = sp.exam_type_id
    WHERE u.id = $1
  `, [req.user.id]);
  res.json(rows[0] || {});
});

// PUT /api/student/profile
router.put('/profile', async (req, res) => {
  const { schoolId, examTypeId, yearGroup, avatarEmoji, targetYear } = req.body;

  // Ensure profile row exists
  await pool.query(`
    INSERT INTO student_profiles (user_id) VALUES ($1)
    ON CONFLICT DO NOTHING
  `, [req.user.id]);

  await pool.query(`
    UPDATE student_profiles
    SET school_id    = COALESCE($1, school_id),
        exam_type_id = COALESCE($2, exam_type_id),
        year_group   = COALESCE($3, year_group),
        avatar_emoji = COALESCE($4, avatar_emoji),
        target_year  = COALESCE($5, target_year),
        onboarded    = TRUE
    WHERE user_id = $6
  `, [schoolId || null, examTypeId || null, yearGroup || null, avatarEmoji || null, targetYear || null, req.user.id]);

  res.json({ saved: true });
});

// GET /api/student/progress
router.get('/progress', async (req, res) => {
  const studentId = req.user.id;

  const [attempts, subjectStats, recentStreak] = await Promise.all([
    // All submitted/marked attempts
    pool.query(`
      SELECT att.id, att.status, att.submitted_at, att.auto_score,
             att.total_score, att.max_score, att.time_taken_secs,
             p.title AS paper_title, p.paper_type,
             s.name AS subject_name, s.icon AS subject_icon, s.slug AS subject_slug,
             et.name AS exam_type_name
      FROM attempts att
      JOIN papers p ON p.id = att.paper_id
      LEFT JOIN subjects s ON s.id = p.subject_id
      LEFT JOIN exam_types et ON et.id = p.exam_type_id
      WHERE att.student_id = $1
        AND att.status IN ('submitted','marked')
      ORDER BY att.submitted_at DESC
    `, [studentId]),

    // Per-subject averages
    pool.query(`
      SELECT s.name, s.icon, s.slug,
             COUNT(att.id) AS attempts,
             ROUND(AVG(CASE WHEN att.max_score > 0
               THEN att.total_score::float / att.max_score * 100 END)::numeric, 1) AS avg_pct,
             MAX(CASE WHEN att.max_score > 0
               THEN att.total_score::float / att.max_score * 100 END) AS best_pct
      FROM attempts att
      JOIN papers p ON p.id = att.paper_id
      LEFT JOIN subjects s ON s.id = p.subject_id
      WHERE att.student_id = $1 AND att.status IN ('submitted','marked')
      GROUP BY s.id, s.name, s.icon, s.slug
      ORDER BY avg_pct DESC NULLS LAST
    `, [studentId]),

    // Streak: count consecutive days with at least one attempt (last 30 days)
    pool.query(`
      SELECT COUNT(DISTINCT DATE(submitted_at)) AS active_days
      FROM attempts
      WHERE student_id = $1
        AND status IN ('submitted','marked')
        AND submitted_at >= NOW() - INTERVAL '30 days'
    `, [studentId]),
  ]);

  // Overall stats
  const totalAttempts = attempts.rows.length;
  const scores = attempts.rows.filter(a => a.max_score > 0).map(a => (a.total_score / a.max_score) * 100);
  const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
  const bestScore = scores.length ? Math.round(Math.max(...scores)) : null;

  res.json({
    attempts: attempts.rows,
    subjectStats: subjectStats.rows,
    overall: {
      totalAttempts,
      avgScore,
      bestScore,
      activeDays: parseInt(recentStreak.rows[0].active_days),
    },
  });
});

// GET /api/student/dashboard (kept for backward compat)
router.get('/dashboard', async (req, res) => {
  const [profile, recentAttempts, stats] = await Promise.all([
    pool.query(
      'SELECT u.full_name, sp.year_group, sp.avatar_emoji FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id WHERE u.id = $1',
      [req.user.id]
    ),
    pool.query(`
      SELECT att.id, att.status, att.submitted_at, att.total_score, att.max_score,
             p.title, p.paper_type, s.name AS subject_name, s.icon AS subject_icon
      FROM attempts att
      JOIN papers p ON p.id = att.paper_id
      LEFT JOIN subjects s ON s.id = p.subject_id
      WHERE att.student_id = $1
      ORDER BY att.started_at DESC LIMIT 5
    `, [req.user.id]),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'submitted' OR status = 'marked') AS completed,
        AVG(CASE WHEN max_score > 0 THEN total_score::float / max_score * 100 END) AS avg_percent
      FROM attempts
      WHERE student_id = $1
    `, [req.user.id]),
  ]);
  res.json({ profile: profile.rows[0], recentAttempts: recentAttempts.rows, stats: stats.rows[0] });
});

module.exports = router;
