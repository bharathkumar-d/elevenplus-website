const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

const createdDir = path.join(__dirname, '../../../uploads/diagrams/created');
if (!fs.existsSync(createdDir)) fs.mkdirSync(createdDir, { recursive: true });

// POST /api/diagrams — save a base64 PNG from the diagram editor
router.post('/', authenticate, requireRole('admin'), (req, res) => {
  const { dataUrl } = req.body;
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
    return res.status(400).json({ error: 'dataUrl must be a PNG data URL' });
  }

  const base64 = dataUrl.replace('data:image/png;base64,', '');
  const filename = `created-${Date.now()}-${uuidv4()}.png`;
  const filepath = path.join(createdDir, filename);

  try {
    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
    res.json({ imageUrl: `/uploads/diagrams/created/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
