/**
 * Quick test — extract one PDF without touching the DB.
 * Usage: PDF_PASSWORD=xxx node scripts/testOneImport.js
 */
require('dotenv').config({ path: '../.env' });
const { extractQuestionsFromPDF } = require('../src/utils/pdfExtractor');

const pass = process.env.PDF_PASSWORD;
if (!pass) { console.error('Set PDF_PASSWORD env var'); process.exit(1); }

const file = 'C:\\Bharath\\Personal\\Ayansh\\Education\\QE\\Past tests\\11-plus-queen-elizabeths-school-3.pdf';

extractQuestionsFromPDF(file, pass).then(r => {
  const qs = r.questions;
  const mcq = qs.filter(q => q.questionType === 'mcq').length;
  const ft  = qs.filter(q => q.questionType === 'free_text').length;
  console.log(`Total: ${qs.length}  MCQ: ${mcq}  free_text: ${ft}`);
  console.log('\nFirst 5 questions:');
  qs.slice(0, 5).forEach(q => {
    console.log(`  [${q.orderIndex}] ${q.questionType.padEnd(9)} opts=${q.options?.length||0}  "${q.questionText.slice(0,70)}"`);
  });
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
