const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');

const router = express.Router();

// GET /api/passages?paperId=xxx
router.get('/', authenticate, async (req, res) => {
  const { paperId } = req.query;
  if (!paperId) return res.status(400).json({ error: 'paperId required' });
  const { rows } = await pool.query(
    'SELECT * FROM passages WHERE paper_id = $1 ORDER BY order_index',
    [paperId]
  );
  res.json(rows);
});

// POST /api/passages — create a passage (admin)
router.post('/', authenticate, requireRole('admin'), async (req, res) => {
  const { paperId, title, content, orderIndex } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO passages (paper_id, title, content, order_index)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [paperId, title || 'Reading Passage', content, orderIndex ?? 0]
  );
  res.status(201).json(rows[0]);
});

// PATCH /api/passages/:id
router.patch('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const { title, content } = req.body;
  const updates = [], params = [];
  if (title   !== undefined) { params.push(title);   updates.push(`title = $${params.length}`); }
  if (content !== undefined) { params.push(content); updates.push(`content = $${params.length}`); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE passages SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  res.json(rows[0]);
});

// DELETE /api/passages/:id  (unlinks questions first, then deletes)
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  await pool.query('UPDATE questions SET passage_id = NULL WHERE passage_id = $1', [req.params.id]);
  await pool.query('DELETE FROM passages WHERE id = $1', [req.params.id]);
  res.json({ message: 'Passage deleted' });
});

module.exports = router;
