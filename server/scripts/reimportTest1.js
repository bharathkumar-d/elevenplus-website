/**
 * Re-import Paper 1 with source_question_num preserved.
 * Usage: PDF_PASSWORD=xxx node scripts/reimportTest1.js
 */
require('dotenv').config({ path: '../.env' });
const fs   = require('fs');
const path = require('path');
const pool = require('../src/db/pool');
const { extractQuestionsFromPDF } = require('../src/utils/pdfExtractor');

const SRC   = 'C:\\Bharath\\Personal\\Ayansh\\Education\\QE\\Practice tests\\11+ QE Boys, Barnet, Practice Test 1.pdf';
const UPLOAD_DIR = path.join(__dirname, '../../uploads/papers');
const QE_SCHOOL_ID  = '5f97a59b-4e0a-4c94-af7b-edd19dfbdf07';
const ADMIN_USER_ID = '15226cb1-999a-4486-8b30-d21d39e17039';
const PASSWORD = process.env.PDF_PASSWORD;

if (!PASSWORD) { console.error('Set PDF_PASSWORD'); process.exit(1); }

async function run() {
  const destName = `${Date.now()}-11+ QE Boys, Barnet, Practice Test 1.pdf`;
  const destPath = path.join(UPLOAD_DIR, destName);

  fs.copyFileSync(SRC, destPath);
  console.log('Copied →', destName);

  const { rows: [paper] } = await pool.query(
    `INSERT INTO papers(title,paper_type,school_id,subject_id,exam_type_id,time_limit_mins,status,pdf_url,created_by)
     VALUES($1,'full_paper',$2,null,null,90,'published',$3,$4) RETURNING id`,
    ['QE Test 1', QE_SCHOOL_ID, '/uploads/papers/' + destName, ADMIN_USER_ID]
  );
  console.log('Paper created:', paper.id);

  const result = await extractQuestionsFromPDF(destPath, PASSWORD);
  console.log('Extracted:', result.questions.length, 'questions');

  // Show source_question_num distribution
  const nums = result.questions.map(q => q.sourceQuestionNum).filter(Boolean);
  console.log('Q nums range:', Math.min(...nums), '–', Math.max(...nums));

  const client = await pool.connect();
  let saved = 0;
  try {
    await client.query('BEGIN');
    for (const q of result.questions.sort((a, b) => a.orderIndex - b.orderIndex)) {
      const { rows: [qRow] } = await client.query(
        `INSERT INTO questions(paper_id,question_text,question_type,marks,order_index,source_question_num,hint,explanation)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [paper.id, q.questionText, q.questionType, q.marks || 1,
         q.orderIndex, q.sourceQuestionNum || null, q.hint || '', q.explanation || '']
      );
      if (q.questionType === 'mcq' && q.options?.length) {
        for (let i = 0; i < q.options.length; i++) {
          const o = q.options[i];
          await client.query(
            `INSERT INTO mcq_options(question_id,option_text,option_label,is_correct,order_index)
             VALUES($1,$2,$3,$4,$5)`,
            [qRow.id, o.text, o.label, false, i]
          );
        }
      }
      saved++;
    }
    await client.query('COMMIT');
    console.log('Saved:', saved, 'questions');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed:', err.message);
  } finally {
    client.release();
  }
  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
