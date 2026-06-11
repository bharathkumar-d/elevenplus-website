/**
 * Day 8 migration — passages + question diagram fields
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const pool = require('./pool');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── passages table ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS passages (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        paper_id     UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
        title        VARCHAR(255),
        content      TEXT NOT NULL,
        order_index  SMALLINT NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── add passage_id + diagram_page to questions ────────────────────────────
    await client.query(`
      ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS passage_id   UUID REFERENCES passages(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS diagram_page SMALLINT
    `);

    // ── index for fast passage lookups ────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_passages_paper    ON passages(paper_id);
      CREATE INDEX IF NOT EXISTS idx_questions_passage ON questions(passage_id);
    `);

    await client.query('COMMIT');
    console.log('✅ Day 8 migration complete');
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
