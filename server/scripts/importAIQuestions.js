/**
 * importAIQuestions.js
 *
 * Imports a JSON file containing AI-generated questions (output from Claude.ai)
 * and creates a new published paper in the DB.
 *
 * Usage:
 *   node scripts/importAIQuestions.js <json-file> "<Paper Title>" [time_limit_mins]
 *
 * Example:
 *   node scripts/importAIQuestions.js ai-prompts/new_questions.json "QE Maths Practice Set A" 45
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });
const pool = require('../src/db/pool');

const ADMIN_USER_ID = '15226cb1-999a-4486-8b30-d21d39e17039';

async function run() {
  const [,, jsonFile, paperTitle, timeLimitArg] = process.argv;

  if (!jsonFile || !paperTitle) {
    console.log('Usage: node scripts/importAIQuestions.js <json-file> "<Paper Title>" [time_limit_mins]');
    process.exit(1);
  }

  const filePath = path.isAbsolute(jsonFile)
    ? jsonFile
    : path.join(process.cwd(), jsonFile);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  let raw = fs.readFileSync(filePath, 'utf8').trim();

  // Strip markdown code fences if Claude wrapped in ```json ... ```
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    console.error('Make sure the file contains only the raw JSON from Claude (no extra text).');
    process.exit(1);
  }

  const { subjectSlug, questions } = data;

  if (!questions || !questions.length) {
    console.error('No questions found in JSON.');
    process.exit(1);
  }

  console.log(`\nImporting ${questions.length} questions as "${paperTitle}"...`);

  // Look up subject and default school (QE) in parallel;
  // the exam type comes from the school's own exam_type_id link.
  const [subjectRes, schoolRes] = await Promise.all([
    pool.query('SELECT id FROM subjects WHERE slug = $1', [subjectSlug]),
    pool.query(`SELECT id, name, exam_type_id FROM schools
                WHERE name ILIKE '%Queen Elizabeth%' OR name ILIKE '%QE%' LIMIT 1`),
  ]);

  if (!subjectRes.rows.length) {
    const all = await pool.query('SELECT name, slug FROM subjects ORDER BY name');
    console.error(`Subject slug "${subjectSlug}" not found. Available slugs:`);
    all.rows.forEach(r => console.log(`  ${r.slug} (${r.name})`));
    process.exit(1);
  }
  const subjectId = subjectRes.rows[0].id;

  const school = schoolRes.rows[0] || null;
  if (!school) {
    console.warn('⚠ No QE school found — paper will be created with no school (visible to all schools).');
  }
  const schoolId = school?.id || null;
  const examTypeId = school?.exam_type_id || null;

  const timeLimitMins = parseInt(timeLimitArg) || null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create paper
    const paperRes = await client.query(`
      INSERT INTO papers (title, subject_id, school_id, exam_type_id, paper_type, status, time_limit_mins, created_by)
      VALUES ($1, $2, $3, $4, 'worksheet', 'published', $5, $6)
      RETURNING id
    `, [paperTitle, subjectId, schoolId, examTypeId, timeLimitMins, ADMIN_USER_ID]);

    const paperId = paperRes.rows[0].id;
    console.log(`Created paper: ${paperId}`);

    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      if (!q.questionText || !q.type) {
        console.warn(`  Skipping Q${i + 1}: missing questionText or type`);
        skipped++;
        continue;
      }

      const qType = q.type === 'free_text' ? 'free_text' : 'mcq';

      const qRes = await client.query(`
        INSERT INTO questions (paper_id, question_text, question_type, marks, order_index, hint, explanation)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [paperId, q.questionText, qType, q.marks || 1, i + 1, q.hint || null, q.explanation || null]);

      const questionId = qRes.rows[0].id;

      // Insert MCQ options
      if (qType === 'mcq' && q.options && q.options.length) {
        for (let oi = 0; oi < q.options.length; oi++) {
          const opt = q.options[oi];
          await client.query(`
            INSERT INTO mcq_options (question_id, option_label, option_text, is_correct, order_index)
            VALUES ($1, $2, $3, $4, $5)
          `, [questionId, opt.label, opt.text, !!opt.isCorrect, oi + 1]);
        }
      }

      imported++;
      if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${questions.length} questions processed...`);
    }

    await client.query('COMMIT');

    console.log(`\n✅ Done!`);
    console.log(`   Paper: "${paperTitle}"`);
    console.log(`   Imported: ${imported} questions`);
    if (skipped) console.log(`   Skipped: ${skipped} questions (missing data)`);
    console.log(`\n   View it in the admin panel or at http://localhost:5000/papers`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
