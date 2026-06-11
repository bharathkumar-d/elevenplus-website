/**
 * Bulk import script — imports all QE Boys Barnet practice test PDFs.
 * Usage: node scripts/bulkImport.js
 *
 * The PDF password is passed via the PDF_PASSWORD env var (never hard-coded).
 * e.g.:  PDF_PASSWORD=xxx node scripts/bulkImport.js
 */
require('dotenv').config({ path: '../.env' });

const fs   = require('fs');
const path = require('path');
const pool = require('../src/db/pool');
const { extractQuestionsFromPDF } = require('../src/utils/pdfExtractor');

// ── Config ────────────────────────────────────────────────────────────────────
const PDF_DIR    = 'C:\\Bharath\\Personal\\Ayansh\\Education\\QE\\Practice tests';
const UPLOAD_DIR = path.join(__dirname, '../../uploads/papers');
const PASSWORD   = process.env.PDF_PASSWORD;

// Papers already imported — skip these (matched against title)
const ALREADY_IMPORTED = ['QE Boys Barnet Practice Test 1'];

const QE_SCHOOL_ID   = '5f97a59b-4e0a-4c94-af7b-edd19dfbdf07';
const ADMIN_USER_ID  = '15226cb1-999a-4486-8b30-d21d39e17039';
// Full papers contain both English + Maths — no single subject
const SUBJECT_ID     = null;
const EXAM_TYPE_ID   = null;
const TIME_LIMIT     = 90; // 45 min English + 45 min Maths

if (!PASSWORD) {
  console.error('ERROR: set PDF_PASSWORD env var before running this script.');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function titleFromFilename(filename) {
  // "11+ QE Boys, Barnet, Practice Test 3.pdf" → "QE Boys Barnet Practice Test 3"
  const base = path.basename(filename, '.pdf');
  const m = base.match(/Practice Test (\d+)/i);
  if (m) return `QE Boys Barnet Practice Test ${m[1]}`;
  return `QE Boys Barnet — ${base}`;
}

async function importPaper(filename) {
  const srcPath  = path.join(PDF_DIR, filename);
  const destName = `${Date.now()}-${filename}`;
  const destPath = path.join(UPLOAD_DIR, destName);
  const pdfUrl   = `/uploads/papers/${destName}`;
  const title    = titleFromFilename(filename);

  console.log(`\n── ${title}`);

  // 1. Copy PDF to uploads
  fs.copyFileSync(srcPath, destPath);
  console.log(`   Copied → ${destName}`);

  // 2. Create paper record
  const { rows: [paper] } = await pool.query(
    `INSERT INTO papers
       (title, paper_type, school_id, subject_id, exam_type_id, time_limit_mins, status, pdf_url, created_by)
     VALUES ($1, 'full_paper', $2, $3, $4, $5, 'published', $6, $7)
     RETURNING id`,
    [title, QE_SCHOOL_ID, SUBJECT_ID, EXAM_TYPE_ID, TIME_LIMIT, pdfUrl, ADMIN_USER_ID]
  );
  console.log(`   Paper created: ${paper.id}`);

  // 3. Extract questions
  let result;
  try {
    result = await extractQuestionsFromPDF(destPath, PASSWORD);
  } catch (err) {
    console.error(`   ✗ Extraction failed: ${err.message}`);
    // Clean up the paper record so we don't leave orphans
    await pool.query('DELETE FROM papers WHERE id = $1', [paper.id]);
    fs.unlinkSync(destPath);
    return { title, ok: false, error: err.message };
  }

  const { questions } = result;
  console.log(`   Extracted: ${questions.length} questions`);

  if (!questions.length) {
    console.warn('   ⚠ No questions extracted — paper saved but empty.');
    return { title, ok: true, count: 0 };
  }

  // 4. Insert questions + options in a transaction
  const client = await pool.connect();
  let saved = 0;
  try {
    await client.query('BEGIN');
    for (const q of questions.sort((a, b) => a.orderIndex - b.orderIndex)) {
      const { rows: [qRow] } = await client.query(
        `INSERT INTO questions
           (paper_id, question_text, question_type, marks, order_index, source_question_num, hint, explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [paper.id, q.questionText, q.questionType, q.marks || 1,
         q.orderIndex, q.sourceQuestionNum || null, q.hint || '', q.explanation || '']
      );

      if (q.questionType === 'mcq' && q.options?.length) {
        for (let oi = 0; oi < q.options.length; oi++) {
          const opt = q.options[oi];
          await client.query(
            `INSERT INTO mcq_options (question_id, option_text, option_label, is_correct, order_index)
             VALUES ($1, $2, $3, $4, $5)`,
            [qRow.id, opt.text, opt.label, opt.isCorrect || false, oi]
          );
        }
      }
      saved++;
    }
    await client.query('COMMIT');
    console.log(`   ✓ Saved ${saved} questions to DB`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`   ✗ DB insert failed: ${err.message}`);
    return { title, ok: false, error: err.message };
  } finally {
    client.release();
  }

  return { title, ok: true, count: saved };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const files = fs.readdirSync(PDF_DIR)
    .filter(f => f.endsWith('.pdf'))
    .filter(f => !ALREADY_IMPORTED.includes(titleFromFilename(f)))
    .sort();
  console.log(`Found ${files.length} PDF(s) to import:\n${files.map(f => '  ' + f).join('\n')}`);

  const results = [];
  for (const file of files) {
    const r = await importPaper(file);
    results.push(r);
  }

  console.log('\n══ Summary ══════════════════════════════');
  let total = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`✓ ${r.title}: ${r.count} questions`);
      total += r.count || 0;
    } else {
      console.log(`✗ ${r.title}: FAILED — ${r.error}`);
    }
  }
  console.log(`\nTotal questions imported: ${total}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
