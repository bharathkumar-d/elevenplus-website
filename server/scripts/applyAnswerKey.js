/**
 * Apply answer keys to a paper's MCQ options.
 * Usage: node scripts/applyAnswerKey.js
 *
 * Reads the ANSWER_KEYS map below and sets is_correct=true on the matching
 * option_label for each question, clearing any previous correct flags.
 *
 * Questions are matched by order_index (0-based in DB) mapped to the 1-based
 * question numbers in the mark scheme.
 *
 * For full papers (English + Maths both present), English questions come first
 * in the DB (order_index 0–63), Maths follow (order_index 64–123).
 * However our extractor re-numbers each section starting from 0, so we match
 * by section offset.
 */
require('dotenv').config({ path: '../.env' });
const pool = require('../src/db/pool');

// ── Answer Keys ───────────────────────────────────────────────────────────────
// Format: { paperTitle: { english: { 1:'D', 2:'C', ... }, maths: { 1:'D', 2:'C', ... } } }
// 'N' means "None of the above" / no error — treated as option label 'N' if present,
// otherwise skipped (some spelling/punctuation Qs use N as the answer).

const ANSWER_KEYS = {
  'QE Test 1': {
    english: {
      1:'D', 2:'C', 3:'D', 4:'E', 5:'A', 6:'A', 7:'E', 8:'B', 9:'A', 10:'C',
      11:'D', 12:'B', 13:'B', 14:'C', 15:'B', 16:'B', 17:'B', 18:'C', 19:'D', 20:'E',
      21:'B', 22:'B', 23:'A', 24:'C', 25:'E', 26:'A', 27:'E', 28:'D', 29:'E', 30:'C',
      31:'C', 32:'A', 33:'C', 34:'N', 35:'D', 36:'B', 37:'D', 38:'D', 39:'A', 40:'B',
      41:'A', 42:'N', 43:'A', 44:'B', 45:'A', 46:'B', 47:'A', 48:'N', 49:'C', 50:'B',
      51:'B', 52:'C', 53:'C', 54:'B', 55:'B', 56:'E', 57:'C', 58:'A', 59:'E', 60:'C',
      61:'A', 62:'D', 63:'A', 64:'D',
    },
    maths: {
      1:'D', 2:'C', 3:'E', 4:'B', 5:'A', 6:'C', 7:'E', 8:'B', 9:'D', 10:'B',
      11:'E', 12:'C', 13:'B', 14:'C', 15:'D', 16:'E', 17:'B', 18:'A', 19:'A', 20:'C',
      21:'C', 22:'B', 23:'D', 24:'A', 25:'D', 26:'E', 27:'E', 28:'D', 29:'C', 30:'A',
      31:'E', 32:'D', 33:'C', 34:'A', 35:'D', 36:'E', 37:'C', 38:'A', 39:'B', 40:'D',
      41:'B', 42:'E', 43:'D', 44:'C', 45:'B', 46:'C', 47:'E', 48:'B', 49:'B', 50:'C',
      51:'C', 52:'A', 53:'D', 54:'E', 55:'B', 56:'C', 57:'D', 58:'E', 59:'C', 60:'B',
    },
  },
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function applyKey(paperTitle, englishKey, mathsKey) {
  const { rows: papers } = await pool.query(
    'SELECT id FROM papers WHERE title = $1', [paperTitle]
  );
  if (!papers.length) { console.error(`Paper not found: ${paperTitle}`); return; }
  const paperId = papers[0].id;

  // Get all questions ordered by order_index — source_question_num resets at section boundary
  const { rows: questions } = await pool.query(
    `SELECT id, order_index, source_question_num, question_type FROM questions
     WHERE paper_id = $1 ORDER BY order_index`,
    [paperId]
  );

  console.log(`\n${paperTitle} — ${questions.length} questions`);

  // Detect section boundary: where source_question_num resets back to small values
  // English comes first, Maths second. Maths starts when src_q_num goes back to 1.
  let mathsStart = questions.length; // default: all English
  for (let i = 1; i < questions.length; i++) {
    const prev = questions[i - 1].source_question_num;
    const curr = questions[i].source_question_num;
    if (curr !== null && prev !== null && curr < prev && curr <= 5) {
      mathsStart = i;
      break;
    }
  }

  const englishQs = questions.slice(0, mathsStart);
  const mathsQs   = questions.slice(mathsStart);
  console.log(`  English: ${englishQs.length} questions, Maths: ${mathsQs.length} questions`);

  let updated = 0;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const applySection = async (qs, key, sectionName) => {
      for (const q of qs) {
        const qNum = q.source_question_num;
        if (!qNum || q.question_type !== 'mcq') continue;

        const correctLabel = key[qNum];
        if (!correctLabel) {
          console.log(`  ${sectionName} Q${qNum}: no answer in key — skipped`);
          continue;
        }

        // Clear existing correct flags
        await client.query(
          'UPDATE mcq_options SET is_correct = false WHERE question_id = $1',
          [q.id]
        );

        if (correctLabel === 'N') {
          const { rowCount } = await client.query(
            `UPDATE mcq_options SET is_correct = true
             WHERE question_id = $1 AND UPPER(option_label) = 'N'`,
            [q.id]
          );
          if (rowCount) updated++;
          else console.log(`  ${sectionName} Q${qNum}: label N not found — skipped`);
          continue;
        }

        const { rowCount } = await client.query(
          `UPDATE mcq_options SET is_correct = true
           WHERE question_id = $1 AND option_label = $2`,
          [q.id, correctLabel]
        );

        if (rowCount === 0) console.warn(`  ${sectionName} Q${qNum}: label ${correctLabel} not found`);
        else updated++;
      }
    };

    await applySection(englishQs, englishKey, 'English');
    await applySection(mathsQs,   mathsKey,   'Maths');

    await client.query('COMMIT');
    console.log(`  ✓ Applied ${updated} correct answers`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`  ✗ Failed: ${err.message}`);
  } finally {
    client.release();
  }
}

async function main() {
  for (const [title, { english, maths }] of Object.entries(ANSWER_KEYS)) {
    await applyKey(title, english, maths);
  }
  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
