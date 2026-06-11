/**
 * generatePrompt.js
 *
 * Pulls existing questions from the DB for a given paper,
 * then writes a ready-to-paste Claude.ai prompt to a .txt file.
 *
 * Usage:
 *   node scripts/generatePrompt.js                        -- lists available papers
 *   node scripts/generatePrompt.js "QE Test 1"           -- full paper, prompt for both subjects
 *   node scripts/generatePrompt.js "QE Test 1" 20        -- generate 20 questions (default 15)
 *   node scripts/generatePrompt.js "QE Test 1" 20 maths  -- only maths questions as inspiration
 *   node scripts/generatePrompt.js "QE Test 1" 20 english
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });
const pool = require('../src/db/pool');

async function listPapers() {
  const { rows } = await pool.query(`
    SELECT p.title, COUNT(q.id) as q_count,
           COALESCE(s.name, 'Mixed') as subject_name
    FROM papers p
    LEFT JOIN subjects s ON s.id = p.subject_id
    LEFT JOIN questions q ON q.paper_id = p.id
    GROUP BY p.id, p.title, s.name
    ORDER BY p.title
  `);
  console.log('\nAvailable papers:\n');
  rows.forEach(r => console.log(`  "${r.title}"  (${r.subject_name}, ${r.q_count} questions)`));
  console.log('\nUsage: node scripts/generatePrompt.js "<paper title>" [count] [maths|english|verbal-reasoning|non-verbal-reasoning]');
}

async function run() {
  const [,, paperTitle, countArg, subjectFilter] = process.argv;

  if (!paperTitle) {
    await listPapers();
    await pool.end();
    return;
  }

  const count = parseInt(countArg) || 15;

  // Find the paper
  const paperRes = await pool.query(
    `SELECT p.*, COALESCE(s.name, 'Mixed') as subject_name, COALESCE(s.slug, 'mixed') as subject_slug
     FROM papers p LEFT JOIN subjects s ON s.id = p.subject_id
     WHERE p.title ILIKE $1 LIMIT 1`,
    [`%${paperTitle}%`]
  );

  if (!paperRes.rows.length) {
    console.error(`Paper not found: "${paperTitle}"`);
    await listPapers();
    await pool.end();
    return;
  }

  const paper = paperRes.rows[0];

  const subjectNames = {
    'maths': 'Maths',
    'english': 'English',
    'verbal-reasoning': 'Verbal Reasoning',
    'non-verbal-reasoning': 'Non-Verbal Reasoning',
  };
  const outputSubject = subjectFilter || 'maths'; // default to maths if mixed paper
  const outputSubjectName = subjectNames[outputSubject] || outputSubject;

  console.log(`\nPaper: "${paper.title}" (${paper.subject_name})`);
  console.log(`Generating prompt for: ${outputSubjectName} questions`);

  // Fetch all questions in paper order (QE papers: English section first, then Maths)
  const { rows: allQuestions } = await pool.query(`
    SELECT q.id, q.question_text, q.question_type, q.marks, q.hint, q.explanation,
           q.source_question_num,
           json_agg(
             json_build_object('label', qo.option_label, 'text', qo.option_text, 'isCorrect', qo.is_correct)
             ORDER BY qo.order_index
           ) FILTER (WHERE qo.id IS NOT NULL) as options
    FROM questions q
    LEFT JOIN mcq_options qo ON qo.question_id = q.id
    WHERE q.paper_id = $1
    GROUP BY q.id ORDER BY q.order_index
  `, [paper.id]);

  // Detect the Maths section start: source_question_num resets to a low value
  // (same heuristic as applyAnswerKey.js — both sections number from 1)
  let mathsStart = -1;
  for (let i = 1; i < allQuestions.length; i++) {
    const prev = allQuestions[i - 1].source_question_num;
    const curr = allQuestions[i].source_question_num;
    if (prev != null && curr != null && curr < prev && curr <= 5) {
      mathsStart = i;
      break;
    }
  }

  let sectionQuestions = allQuestions;
  if (mathsStart > 0 && (subjectFilter === 'maths' || subjectFilter === 'english')) {
    sectionQuestions = subjectFilter === 'maths'
      ? allQuestions.slice(mathsStart)
      : allQuestions.slice(0, mathsStart);
    console.log(`Filtered to ${subjectFilter} section: ${sectionQuestions.length} of ${allQuestions.length} questions.`);
  } else if (subjectFilter && mathsStart < 0) {
    console.warn(`Could not detect section boundary — using all ${allQuestions.length} questions as samples.`);
  }

  const questions = sectionQuestions.slice(0, 40);
  console.log(`Using ${questions.length} sample questions as inspiration.`);

  // Build sample block
  const sampleBlock = questions.map((q, i) => {
    let block = `Q${i + 1} [${q.question_type.toUpperCase()}, ${q.marks} mark${q.marks > 1 ? 's' : ''}]\n`;
    block += `${q.question_text}\n`;
    if (q.options && q.options.length) {
      q.options.forEach(o => {
        block += `  ${o.label}. ${o.text}${o.isCorrect ? ' ✓' : ''}\n`;
      });
    }
    if (q.hint) block += `Hint: ${q.hint}\n`;
    if (q.explanation) block += `Explanation: ${q.explanation}\n`;
    return block;
  }).join('\n');

  const prompt = `You are helping create 11+ exam practice questions for UK students aged 9–10 preparing for grammar school entrance exams.

The subject for the NEW questions is: **${outputSubjectName}**

Below are sample questions from an existing QE Boys Barnet practice paper. Use them as inspiration for style and difficulty — but create ENTIRELY NEW questions. Do NOT copy or slightly rephrase any sample question.

===== SAMPLE QUESTIONS (for style reference only) =====
${sampleBlock}
===== END SAMPLES =====

Now generate ${count} NEW ${outputSubjectName} questions of similar style and difficulty.

RULES:
- Mix question types: mostly MCQ (4 options A/B/C/D), occasionally free_text
- Difficulty: appropriate for 10–11 year olds sitting QE Boys Barnet grammar school entrance exams
- For MCQ: always mark exactly one option as correct (isCorrect: true)
- For free_text: provide a model answer in the explanation field
- Keep question_text concise and clear
- Marks: 1 for MCQ, 1–2 for free_text
- Questions must be entirely original

Return ONLY valid JSON — no markdown fences, no text before or after the JSON:

{
  "subject": "${outputSubjectName}",
  "subjectSlug": "${outputSubject}",
  "questions": [
    {
      "questionText": "...",
      "type": "mcq",
      "marks": 1,
      "hint": null,
      "explanation": null,
      "options": [
        { "label": "A", "text": "...", "isCorrect": false },
        { "label": "B", "text": "...", "isCorrect": true },
        { "label": "C", "text": "...", "isCorrect": false },
        { "label": "D", "text": "...", "isCorrect": false }
      ]
    },
    {
      "questionText": "...",
      "type": "free_text",
      "marks": 2,
      "hint": null,
      "explanation": "Model answer: ...",
      "options": []
    }
  ]
}`;

  // Write to file
  const outDir = path.join(__dirname, '../ai-prompts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const safeTitle = paper.title.replace(/[^a-z0-9]+/gi, '_');
  const outFile = path.join(outDir, `prompt_${safeTitle}_${outputSubject}.txt`);
  fs.writeFileSync(outFile, prompt, 'utf8');

  console.log(`\n✅ Prompt written to:\n   ${outFile}`);
  console.log(`\n━━━ NEXT STEPS ━━━`);
  console.log(`  1. Open claude.ai in your browser`);
  console.log(`  2. Paste the entire contents of the file above into the chat`);
  console.log(`  3. Copy Claude's JSON response (just the JSON, nothing else)`);
  console.log(`  4. Save it as:  server/ai-prompts/new_${outputSubject}_questions.json`);
  console.log(`  5. Run:`);
  console.log(`     node scripts/importAIQuestions.js ai-prompts/new_${outputSubject}_questions.json "My New ${outputSubjectName} Worksheet" 30`);

  await pool.end();
}

run().catch(err => { console.error(err); process.exit(1); });
