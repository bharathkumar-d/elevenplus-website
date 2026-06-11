require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Exam types
    await client.query(`
      INSERT INTO exam_types (name, slug, description) VALUES
        ('FSCE', 'fsce', 'Foundation Stage and Core Education format'),
        ('GL',   'gl',   'Granada Learning Assessment format'),
        ('CEM',  'cem',  'Centre for Evaluation & Monitoring format')
      ON CONFLICT (slug) DO NOTHING
    `);

    // Schools
    await client.query(`
      INSERT INTO schools (name, slug, county) VALUES
        ('Queen Elizabeth''s School Barnet', 'queen-elizabeth-barnet', 'Barnet, London'),
        ('Pates Grammar School',             'pates-grammar',          'Cheltenham, Gloucestershire'),
        ('Heckmondwike Grammar School',      'heckmondwike-grammar',   'Heckmondwike, West Yorkshire')
      ON CONFLICT (slug) DO NOTHING
    `);

    // Subjects
    await client.query(`
      INSERT INTO subjects (name, slug, icon) VALUES
        ('Maths',              'maths',              '🔢'),
        ('English',            'english',            '📖'),
        ('Verbal Reasoning',   'verbal-reasoning',   '💬'),
        ('Non-Verbal Reasoning', 'non-verbal-reasoning', '🔷')
      ON CONFLICT (slug) DO NOTHING
    `);

    // Admin user
    const hash = await bcrypt.hash('Admin@123!', 12);
    await client.query(`
      INSERT INTO users (email, password_hash, role, full_name)
      VALUES ('admin@elevenplus.local', $1, 'admin', 'Admin')
      ON CONFLICT (email) DO NOTHING
    `, [hash]);

    await client.query('COMMIT');
    console.log('✅ Seed complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
