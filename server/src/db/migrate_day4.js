require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const pool = require('./pool');
const bcrypt = require('bcryptjs');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add school_id + exam_type_id + target_year to student_profiles
    await client.query(`
      ALTER TABLE student_profiles
        ADD COLUMN IF NOT EXISTS school_id    UUID REFERENCES schools(id),
        ADD COLUMN IF NOT EXISTS exam_type_id UUID REFERENCES exam_types(id),
        ADD COLUMN IF NOT EXISTS target_year  SMALLINT DEFAULT 2026,
        ADD COLUMN IF NOT EXISTS onboarded    BOOLEAN NOT NULL DEFAULT FALSE
    `);

    console.log('✅ student_profiles columns added');

    // Seed a test student: Ayansh
    const hash = await bcrypt.hash('Student@123!', 12);
    const userRes = await client.query(`
      INSERT INTO users (email, password_hash, role, full_name)
      VALUES ('ayansh@elevenplus.local', $1, 'student', 'Ayansh')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1
      RETURNING id
    `, [hash]);
    const userId = userRes.rows[0].id;

    await client.query(`
      INSERT INTO student_profiles (user_id, year_group, avatar_emoji, onboarded)
      VALUES ($1, 5, '🚀', FALSE)
      ON CONFLICT DO NOTHING
    `, [userId]);

    console.log('✅ Test student created: ayansh@elevenplus.local / Student@123!');

    await client.query('COMMIT');
    console.log('✅ Day 4 migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
