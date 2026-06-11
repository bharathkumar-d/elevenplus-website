const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// GET /api/marking/queue
router.get('/queue', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM marking_queue');
  res.json(rows);
});

// POST /api/marking/:answerId
router.post('/:answerId', async (req, res) => {
  const { awardedMarks, adminFeedback } = req.body;

  const { rows } = await pool.query(`
    UPDATE answers
    SET awarded_marks = $1, admin_feedback = $2, marked_by = $3, marked_at = NOW()
    WHERE id = $4
    RETURNING attempt_id
  `, [awardedMarks, adminFeedback, req.user.id, req.params.answerId]);

  if (!rows[0]) return res.status(404).json({ error: 'Answer not found' });

  // Recalculate total score for the attempt
  const { rows: scoreRows } = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN q.question_type = 'mcq' AND a.is_correct = TRUE THEN q.marks ELSE 0 END), 0) AS auto_score,
      COALESCE(SUM(CASE WHEN q.question_type = 'free_text' THEN COALESCE(a.awarded_marks, 0) ELSE 0 END), 0) AS manual_score
    FROM answers a
    JOIN questions q ON q.id = a.question_id
    WHERE a.attempt_id = $1
  `, [rows[0].attempt_id]);

  const { auto_score, manual_score } = scoreRows[0];
  const total = parseInt(auto_score) + parseInt(manual_score);

  // Check if all free-text answers are now marked
  const { rows: unmarked } = await pool.query(`
    SELECT COUNT(*) FROM answers a
    JOIN questions q ON q.id = a.question_id
    WHERE a.attempt_id = $1 AND q.question_type = 'free_text' AND a.marked_at IS NULL
  `, [rows[0].attempt_id]);

  const allMarked = parseInt(unmarked[0].count) === 0;

  await pool.query(`
    UPDATE attempts
    SET auto_score = $1, manual_score = $2, total_score = $3,
        status = $4, marked_at = CASE WHEN $4 = 'marked' THEN NOW() ELSE marked_at END
    WHERE id = $5
  `, [auto_score, manual_score, total, allMarked ? 'marked' : 'submitted', rows[0].attempt_id]);

  res.json({ marked: true, total });
});

module.exports = router;
