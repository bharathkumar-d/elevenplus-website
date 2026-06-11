require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/student');
const paperRoutes = require('./routes/papers');
const questionRoutes = require('./routes/questions');
const attemptRoutes = require('./routes/attempts');
const markingRoutes = require('./routes/marking');
const passageRoutes = require('./routes/passages');

const app = express();

const isProd = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: isProd ? false : process.env.CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Serve React production build in production mode
if (isProd) {
  const clientBuild = path.join(__dirname, '../../client/build');
  app.use(express.static(clientBuild));
}

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/papers', paperRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/marking', markingRoutes);
app.use('/api/passages', passageRoutes);

// Public reference data (exam types, schools, subjects) — any authenticated user
const pool = require('./db/pool');
const { authenticate } = require('./middleware/auth');
app.get('/api/reference', authenticate, async (req, res) => {
  const [examTypes, schools, subjects] = await Promise.all([
    pool.query('SELECT * FROM exam_types ORDER BY name'),
    pool.query(`SELECT s.*, et.slug AS exam_type_slug, et.name AS exam_type_name
                FROM schools s LEFT JOIN exam_types et ON et.id = s.exam_type_id
                ORDER BY s.name`),
    pool.query('SELECT * FROM subjects ORDER BY name'),
  ]);
  res.json({ examTypes: examTypes.rows, schools: schools.rows, subjects: subjects.rows });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Catch-all: send React app for any non-API route (production only)
if (isProd) {
  const clientBuild = path.join(__dirname, '../../client/build');
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
