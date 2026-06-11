const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

// POST /api/attempts/start
router.post('/start', authenticate, requireRole('student'), async (req, res) => {
  const { paperId } = req.body;

  // Check for existing in-progress attempt
  const existing = await pool.query(
    "SELECT id FROM attempts WHERE student_id = $1 AND paper_id = $2 AND status = 'in_progress'",
    [req.user.id, paperId]
  );
  if (existing.rows[0]) return res.json({ attemptId: existing.rows[0].id, resumed: true });

  const paper = await pool.query('SELECT total_marks FROM papers WHERE id = $1', [paperId]);
  const { rows } = await pool.query(`
    INSERT INTO attempts (student_id, paper_id, max_score)
    VALUES ($1, $2, $3)
    RETURNING id
  `, [req.user.id, paperId, paper.rows[0]?.total_marks]);

  res.status(201).json({ attemptId: rows[0].id, resumed: false });
});

// POST /api/attempts/:id/answer — save a single answer
router.post('/:id/answer', authenticate, requireRole('student'), async (req, res) => {
  const { questionId, selectedOptionId, freeTextAnswer } = req.body;

  // Verify attempt belongs to this student
  const attempt = await pool.query(
    "SELECT id FROM attempts WHERE id = $1 AND student_id = $2 AND status = 'in_progress'",
    [req.params.id, req.user.id]
  );
  if (!attempt.rows[0]) return res.status(403).json({ error: 'Attempt not found or already submitted' });

  // Upsert answer
  await pool.query(`
    INSERT INTO answers (attempt_id, question_id, selected_option_id, free_text_answer)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (attempt_id, question_id)
    DO UPDATE SET selected_option_id = $3, free_text_answer = $4
  `, [req.params.id, questionId, selectedOptionId || null, freeTextAnswer || null]);

  res.json({ saved: true });
});

// POST /api/attempts/:id/submit
router.post('/:id/submit', authenticate, requireRole('student'), async (req, res) => {
  const { timeTakenSecs } = req.body;
  const attemptId = req.params.id;

  // Auto-mark MCQ answers
  const { rows: mcqAnswers } = await pool.query(`
    SELECT a.id, o.is_correct
    FROM answers a
    JOIN mcq_options o ON o.id = a.selected_option_id
    WHERE a.attempt_id = $1 AND a.selected_option_id IS NOT NULL
  `, [attemptId]);

  for (const ans of mcqAnswers) {
    await pool.query(
      'UPDATE answers SET is_correct = $1 WHERE id = $2',
      [ans.is_correct, ans.id]
    );
  }

  // Calculate auto score (MCQ only)
  const { rows: scoreRows } = await pool.query(`
    SELECT COALESCE(SUM(q.marks), 0) AS auto_score
    FROM answers a
    JOIN questions q ON q.id = a.question_id
    WHERE a.attempt_id = $1 AND a.is_correct = TRUE
  `, [attemptId]);

  const autoScore = parseInt(scoreRows[0].auto_score);

  // max_score is the full paper's marks — including unanswered questions —
  // so a kid who skips questions sees e.g. 3/16, not 3/4.
  await pool.query(`
    UPDATE attempts
    SET status = 'submitted', submitted_at = NOW(), auto_score = $1, time_taken_secs = $2,
        max_score = (SELECT COALESCE(SUM(q.marks), 0) FROM questions q WHERE q.paper_id = attempts.paper_id)
    WHERE id = $3
  `, [autoScore, timeTakenSecs, attemptId]);

  res.json({ submitted: true, autoScore });
});

// GET /api/attempts/my — student's own attempt history
router.get('/my', authenticate, requireRole('student'), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT att.id, att.status, att.started_at, att.submitted_at,
           att.auto_score, att.manual_score, att.total_score, att.max_score, att.time_taken_secs,
           p.title AS paper_title, p.paper_type,
           s.name AS subject_name, s.icon AS subject_icon
    FROM attempts att
    JOIN papers p ON p.id = att.paper_id
    LEFT JOIN subjects s ON s.id = p.subject_id
    WHERE att.student_id = $1
    ORDER BY att.started_at DESC
  `, [req.user.id]);
  res.json(rows);
});

// GET /api/attempts/:id/results
router.get('/:id/results', authenticate, async (req, res) => {
  const attempt = await pool.query('SELECT * FROM attempts WHERE id = $1', [req.params.id]);
  if (!attempt.rows[0]) return res.status(404).json({ error: 'Not found' });

  const att = attempt.rows[0];
  if (att.student_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Return EVERY question in the paper (LEFT JOIN answers) so skipped
  // questions appear in the review and count towards the maximum score.
  const { rows: answers } = await pool.query(`
    SELECT a.id, q.id AS question_id, a.selected_option_id, a.is_correct,
           a.free_text_answer, a.awarded_marks, a.admin_feedback,
           q.question_text, q.question_type, q.marks, q.explanation, q.image_url,
           o.option_text AS selected_option_text, o.option_label AS selected_option_label,
           (SELECT json_agg(json_build_object(
             'id', o2.id, 'label', o2.option_label, 'text', o2.option_text, 'isCorrect', o2.is_correct
           ) ORDER BY o2.order_index)
           FROM mcq_options o2 WHERE o2.question_id = q.id) AS all_options
    FROM questions q
    LEFT JOIN answers a ON a.question_id = q.id AND a.attempt_id = $1
    LEFT JOIN mcq_options o ON o.id = a.selected_option_id
    WHERE q.paper_id = $2
    ORDER BY q.order_index
  `, [req.params.id, att.paper_id]);

  res.json({ attempt: att, answers });
});

module.exports = router;
