const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, requireRole } = require('../middleware/auth');
const pool = require('../db/pool');
const { extractQuestionsFromPDF } = require('../utils/pdfExtractor');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../../uploads/papers');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  limits: { fileSize: (process.env.MAX_FILE_SIZE_MB || 20) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// GET /api/papers — list published papers (students) or all (admin)
router.get('/', authenticate, async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { subject, examType, school, type } = req.query;

  let where = isAdmin ? [] : ["p.status = 'published'"];
  const params = [];

  if (subject) { params.push(subject); where.push(`s.slug = $${params.length}`); }
  if (examType) { params.push(examType); where.push(`et.slug = $${params.length}`); }
  if (school) { params.push(school); where.push(`sc.slug = $${params.length}`); }
  if (type) { params.push(type); where.push(`p.paper_type = $${params.length}`); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const { rows } = await pool.query(`
    SELECT p.id, p.title, p.description, p.paper_type, p.status,
           p.time_limit_mins, p.total_marks, p.pdf_url, p.created_at,
           s.name AS subject_name, s.slug AS subject_slug, s.icon AS subject_icon,
           et.name AS exam_type_name, et.slug AS exam_type_slug,
           sc.name AS school_name, sc.slug AS school_slug,
           (SELECT COUNT(*) FROM questions q WHERE q.paper_id = p.id) AS question_count
    FROM papers p
    LEFT JOIN subjects s   ON s.id = p.subject_id
    LEFT JOIN exam_types et ON et.id = p.exam_type_id
    LEFT JOIN schools sc    ON sc.id = p.school_id
    ${whereClause}
    ORDER BY p.created_at DESC
  `, params);

  res.json(rows);
});

// GET /api/papers/:id
router.get('/:id', authenticate, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.*, s.name AS subject_name, et.name AS exam_type_name, sc.name AS school_name
    FROM papers p
    LEFT JOIN subjects s   ON s.id = p.subject_id
    LEFT JOIN exam_types et ON et.id = p.exam_type_id
    LEFT JOIN schools sc    ON sc.id = p.school_id
    WHERE p.id = $1
  `, [req.params.id]);

  if (!rows[0]) return res.status(404).json({ error: 'Paper not found' });
  if (rows[0].status === 'draft' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'This paper is not yet published' });
  }
  res.json(rows[0]);
});

// POST /api/papers — create paper (admin only)
router.post('/', authenticate, requireRole('admin'), upload.single('pdf'), async (req, res) => {
  const { title, description, paperType, subjectId, examTypeId, schoolId, timeLimitMins } = req.body;
  const pdfUrl = req.file ? `/uploads/papers/${req.file.filename}` : null;
  const { rows } = await pool.query(`
    INSERT INTO papers (title, description, paper_type, subject_id, exam_type_id, school_id, time_limit_mins, created_by, pdf_url)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [title, description, paperType || 'full_paper', subjectId || null, examTypeId || null, schoolId || null, timeLimitMins || null, req.user.id, pdfUrl]);
  res.status(201).json(rows[0]);
});

// PATCH /api/papers/:id
router.patch('/:id', authenticate, requireRole('admin'), upload.single('pdf'), async (req, res) => {
  const allowed = ['title', 'description', 'paper_type', 'subject_id', 'exam_type_id',
                   'school_id', 'time_limit_mins', 'status', 'total_marks'];
  const updates = [];
  const params = [];

  for (const [key, val] of Object.entries(req.body)) {
    const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowed.includes(col)) {
      params.push(val === '' ? null : val);
      updates.push(`${col} = $${params.length}`);
    }
  }

  // If a new PDF was uploaded, update pdf_url too
  if (req.file) {
    params.push(`/uploads/papers/${req.file.filename}`);
    updates.push(`pdf_url = $${params.length}`);
  }

  if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE papers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  res.json(rows[0]);
});

// POST /api/papers/:id/extract-questions — parse PDF and return extracted questions for review
router.post('/:id/extract-questions', authenticate, requireRole('admin'), async (req, res) => {
  const paper = await pool.query('SELECT * FROM papers WHERE id = $1', [req.params.id]);
  if (!paper.rows[0]) return res.status(404).json({ error: 'Paper not found' });

  const { pdf_url } = paper.rows[0];
  if (!pdf_url) return res.status(400).json({ error: 'This paper has no PDF uploaded yet. Please upload a PDF first.' });

  const filePath = path.join(__dirname, '../../../', pdf_url);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'PDF file not found on server.' });

  try {
    const password = req.body.password || null;
    const result = await extractQuestionsFromPDF(filePath, password);
    res.json(result);
  } catch (err) {
    console.error('PDF extraction error:', err.message);
    if (err.message === 'PDF_PASSWORD_REQUIRED') {
      return res.status(422).json({ error: 'This PDF is password-protected. Please enter the password.', needsPassword: true });
    }
    if (err.message === 'PDF_PASSWORD_INCORRECT') {
      return res.status(422).json({ error: 'Incorrect password. Please try again.', needsPassword: true, wrongPassword: true });
    }
    res.status(500).json({ error: 'Failed to parse PDF: ' + err.message });
  }
});

// GET /api/papers/diagram-images — list all extracted candidate images on disk
router.get('/diagram-images', authenticate, requireRole('admin'), (req, res) => {
  const dir = path.join(__dirname, '../../../uploads/diagrams/tmp');
  if (!fs.existsSync(dir)) return res.json({ images: [] });
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.png'))
    .sort()
    .map(f => ({ imageUrl: `/uploads/diagrams/tmp/${f}`, filename: f }));
  res.json({ images: files });
});

// POST /api/papers/:id/upload-pdf
router.post('/:id/upload-pdf', authenticate, requireRole('admin'), upload.single('pdf'), async (req, res) => {
  const pdfUrl = `/uploads/papers/${req.file.filename}`;
  await pool.query('UPDATE papers SET pdf_url = $1, updated_at = NOW() WHERE id = $2', [pdfUrl, req.params.id]);
  res.json({ pdfUrl });
});

// DELETE /api/papers/:id
router.delete('/:id', authenticate, requireRole('admin'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = req.params.id;
    // answers cascade from attempts, but attempts have no cascade on paper_id — delete manually
    // (answers.attempt_id has ON DELETE CASCADE so deleting attempts also deletes answers)
    await client.query('DELETE FROM attempts WHERE paper_id = $1', [id]);
    // ai_generation_jobs has a nullable FK to papers — just nullify it
    await client.query('UPDATE ai_generation_jobs SET paper_id = NULL WHERE paper_id = $1', [id]);
    // Now delete the paper — questions + mcq_options cascade automatically
    await client.query('DELETE FROM papers WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Paper deleted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete paper error:', err.message);
    res.status(500).json({ error: 'Failed to delete paper: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
