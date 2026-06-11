const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/questions?paperId=xxx
router.get('/', authenticate, async (req, res) => {
  const { paperId } = req.query;
  if (!paperId) return res.status(400).json({ error: 'paperId is required' });

  const { rows } = await pool.query(`
    SELECT q.*,
      json_agg(
        json_build_object(
          'id', o.id,
          'optionText', o.option_text,
          'optionLabel', o.option_label,
          'isCorrect', o.is_correct,
          'orderIndex', o.order_index
        ) ORDER BY o.order_index
      ) FILTER (WHERE o.id IS NOT NULL) AS options
    FROM questions q
    LEFT JOIN mcq_options o ON o.question_id = q.id
    WHERE q.paper_id = $1
    GROUP BY q.id
    ORDER BY q.order_index
  `, [paperId]);

  // Hide correct answers from students
  if (req.user.role !== 'admin') {
    rows.forEach(q => {
      if (q.options) q.options.forEach(o => delete o.isCorrect);
    });
  }

  res.json(rows);
});

// POST /api/questions — add single question (admin)
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { paperId, questionText, questionType, marks, orderIndex, hint, explanation, passageId, imageUrl, diagramPage } = req.body;
  const { rows } = await pool.query(`
    INSERT INTO questions (paper_id, question_text, question_type, marks, order_index, hint, explanation, passage_id, image_url, diagram_page)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [paperId, questionText, questionType || 'mcq', marks || 1, orderIndex || 0, hint, explanation, passageId || null, imageUrl || null, diagramPage || null]);

  const question = rows[0];

  if (questionType === 'mcq' && req.body.options) {
    for (const opt of req.body.options) {
      await pool.query(`
        INSERT INTO mcq_options (question_id, option_text, option_label, is_correct, order_index)
        VALUES ($1, $2, $3, $4, $5)
      `, [question.id, opt.optionText, opt.optionLabel, opt.isCorrect || false, opt.orderIndex || 0]);
    }
  }

  res.status(201).json(question);
});

// PATCH /api/questions/:id — edit question text, marks, explanation, hint, and correct MCQ option
router.patch('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { questionText, marks, hint, explanation, correctOptionId, passageId, imageUrl } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build dynamic update for questions table
    const updates = [];
    const params = [];
    if (questionText !== undefined) { params.push(questionText);         updates.push(`question_text = $${params.length}`); }
    if (marks !== undefined)        { params.push(marks);                updates.push(`marks = $${params.length}`); }
    if (hint !== undefined)         { params.push(hint);                 updates.push(`hint = $${params.length}`); }
    if (explanation !== undefined)  { params.push(explanation);          updates.push(`explanation = $${params.length}`); }
    if (passageId !== undefined)    { params.push(passageId || null);    updates.push(`passage_id = $${params.length}`); }
    if (imageUrl !== undefined)     { params.push(imageUrl || null);     updates.push(`image_url = $${params.length}`); }

    if (updates.length) {
      params.push(id);
      await client.query(
        `UPDATE questions SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    // Update correct option if provided
    if (correctOptionId) {
      // Set all options for this question to false
      await client.query(
        'UPDATE mcq_options SET is_correct = FALSE WHERE question_id = $1',
        [id]
      );
      // Set the chosen option to true
      await client.query(
        'UPDATE mcq_options SET is_correct = TRUE WHERE id = $1 AND question_id = $2',
        [correctOptionId, id]
      );
    }

    await client.query('COMMIT');

    // Return updated question with options
    const { rows } = await client.query(`
      SELECT q.*,
        json_agg(
          json_build_object(
            'id', o.id,
            'optionText', o.option_text,
            'optionLabel', o.option_label,
            'isCorrect', o.is_correct,
            'orderIndex', o.order_index
          ) ORDER BY o.order_index
        ) FILTER (WHERE o.id IS NOT NULL) AS options
      FROM questions q
      LEFT JOIN mcq_options o ON o.question_id = q.id
      WHERE q.id = $1
      GROUP BY q.id
    `, [id]);

    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// DELETE /api/questions/:id
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM questions WHERE id = $1', [req.params.id]);
  res.json({ message: 'Question deleted' });
});

// POST /api/questions/approve-generated — save AI-generated questions to a paper.
// Questions are generated via the claude.ai clipboard workflow in the admin UI
// (no API key); this endpoint just persists the reviewed/approved batch.
router.post('/approve-generated', authenticate, requireRole('admin'), async (req, res) => {
  const { paperId, questions } = req.body;
  if (!paperId || !Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ error: 'paperId and a non-empty questions array are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Append after any existing questions so order_index stays unique
    const { rows: maxRows } = await client.query(
      'SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM questions WHERE paper_id = $1', [paperId]
    );
    const baseIndex = parseInt(maxRows[0].next);

    const saved = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const { rows } = await client.query(`
        INSERT INTO questions (paper_id, question_text, question_type, marks, order_index, hint, explanation)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [paperId, q.questionText, q.questionType === 'free_text' ? 'free_text' : 'mcq', q.marks || 1, baseIndex + i, q.hint || null, q.explanation || null]);

      if (q.questionType === 'mcq' && q.options) {
        for (let j = 0; j < q.options.length; j++) {
          const o = q.options[j];
          await client.query(`
            INSERT INTO mcq_options (question_id, option_text, option_label, is_correct, order_index)
            VALUES ($1, $2, $3, $4, $5)
          `, [rows[0].id, o.optionText, o.optionLabel, o.isCorrect, j]);
        }
      }
      saved.push(rows[0].id);
    }

    await client.query('COMMIT');
    res.json({ saved: saved.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
