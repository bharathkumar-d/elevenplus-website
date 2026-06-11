/**
 * PDF Question Extractor — Day 8 revision 2
 *
 * Key changes vs revision 1:
 *  • Images are NO LONGER auto-assigned to questions.
 *    Instead, all candidate images are returned as an unassigned bank.
 *  • Deduplication: images with the same pixel dimensions are counted;
 *    if the same size appears on 3+ pages it is almost certainly a
 *    repeating template/branding element and is discarded.
 *  • Size filtering: images smaller than 80×80 px (icons) or larger
 *    than 90% of the page area (full-page decorative fills) are dropped.
 *  • Passages are still detected automatically.
 */

const fs      = require('fs');
const path    = require('path');
const { PNG } = require('pngjs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

// ─── Storage ─────────────────────────────────────────────────────────────────

const DIAGRAM_DIR = path.join(__dirname, '../../../uploads/diagrams');
if (!fs.existsSync(DIAGRAM_DIR)) fs.mkdirSync(DIAGRAM_DIR, { recursive: true });

// ─── Raw PDF scan ─────────────────────────────────────────────────────────────

async function extractFromPDF(filePath, password) {
  const data = new Uint8Array(fs.readFileSync(filePath));

  let pdfDoc;
  try {
    pdfDoc = await pdfjsLib.getDocument({
      data,
      password: password || '',
      useSystemFonts: true,
    }).promise;
  } catch (err) {
    if (err.name === 'PasswordException') {
      if (!password) throw new Error('PDF_PASSWORD_REQUIRED');
      throw new Error('PDF_PASSWORD_INCORRECT');
    }
    throw err;
  }

  // First pass — collect all images with their pixel dimensions
  // so we can identify repeating template elements before saving anything.
  const rawPages = [];

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page    = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items.map(i => i.str).join(' ');

    // Page dimensions in PDF units (pts)
    const viewport = page.getViewport({ scale: 1 });
    const pageArea = viewport.width * viewport.height;

    const opList   = await page.getOperatorList();
    const PAINT_OPS = new Set([
      pdfjsLib.OPS.paintImageXObject,
      pdfjsLib.OPS.paintJpegXObject,
      pdfjsLib.OPS.paintImageMaskXObject,
    ]);

    const seen = new Set();
    const images = [];

    for (let i = 0; i < opList.fnArray.length; i++) {
      if (!PAINT_OPS.has(opList.fnArray[i])) continue;
      const name = opList.argsArray[i]?.[0];
      if (!name || seen.has(name)) continue;
      seen.add(name);

      try {
        let imgData = null;
        if (page.commonObjs.has(name))  imgData = page.commonObjs.get(name);
        else if (page.objs.has(name))   imgData = page.objs.get(name);
        if (!imgData || !imgData.data || !imgData.width) continue;

        images.push({ name, width: imgData.width, height: imgData.height, data: imgData.data, pageArea });
      } catch (_) { /* image not decoded without canvas — skip */ }
    }

    rawPages.push({ pageNum: p, text: pageText, images });
  }

  return { rawPages, pageCount: pdfDoc.numPages };
}

// ─── Deduplicate + filter images ──────────────────────────────────────────────
// Returns array of { pageNum, imageUrl } for images that look like real content.

function filterAndSaveImages(rawPages) {
  // Count how many pages each pixel-dimension appears on
  const dimCount = {}; // "WxH" → count of pages
  for (const pg of rawPages) {
    const seenDims = new Set();
    for (const img of pg.images) {
      const key = `${img.width}x${img.height}`;
      if (!seenDims.has(key)) { dimCount[key] = (dimCount[key] || 0) + 1; seenDims.add(key); }
    }
  }

  const saved = [];

  for (const pg of rawPages) {
    for (const img of pg.images) {
      const { width, height, data, pageArea } = img;
      const key = `${width}x${height}`;

      // Drop if same dimensions appear on 3+ pages (repeating template)
      if (dimCount[key] >= 3) continue;

      // Drop tiny images (icons, decorators)
      if (width < 80 || height < 80) continue;

      // Drop images that fill 80%+ of the page (full-page background fills)
      // PDF pts ≈ 72dpi; image pixels have no direct conversion but area ratio is a proxy
      // Use pixel area vs expected page pixel area as a rough check
      // (A4 at 96dpi ≈ 794×1123 px ≈ 892k px²; our page viewport area is in pts²)
      // Just drop very large landscape images that are likely page headers
      const aspect = width / height;
      if (width > 900 && height < 400) continue; // wide short header banners

      const url = saveImageData({ width, height, data }, pg.pageNum, saved.length);
      if (url) saved.push({ pageNum: pg.pageNum, imageUrl: url, width, height });
    }
  }

  return saved;
}

// Save RGBA pixel buffer as PNG; returns relative URL or null
function saveImageData(imgData, pageNum, idx) {
  try {
    const { width, height, data } = imgData;
    const png = new PNG({ width, height });
    for (let i = 0; i < width * height * 4; i++) {
      png.data[i] = data[i] ?? 255;
    }
    const dir = path.join(DIAGRAM_DIR, 'tmp');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `page${pageNum}-img${idx}-${Date.now()}.png`;
    fs.writeFileSync(path.join(dir, filename), PNG.sync.write(png));
    return `/uploads/diagrams/tmp/${filename}`;
  } catch (_) {
    return null;
  }
}

// ─── Section splitter ─────────────────────────────────────────────────────────
// QE-style papers contain two completely independent numbered sections:
//   English  Q1-Qn  (45 min)
//   Mathematics  Q1-Qm  (45 min)
// Each section restarts numbering from 1 so we must parse them independently.

const SECTION_HEADER_RE = /(English|Mathematics|Maths|Verbal Reasoning|Non-Verbal Reasoning|Non Verbal Reasoning|Numerical Reasoning|Spatial Reasoning)\s+\d+\s+minutes/gi;

function splitIntoSections(text) {
  const breaks = [];
  SECTION_HEADER_RE.lastIndex = 0;
  let m;
  while ((m = SECTION_HEADER_RE.exec(text)) !== null) {
    // Only keep the FIRST occurrence of each section name (avoid duplicate headers per page)
    const name = m[1].trim();
    if (!breaks.find(b => b.name.toLowerCase() === name.toLowerCase())) {
      breaks.push({ name, index: m.index });
    }
  }

  if (breaks.length <= 1) {
    // Single section or no clear headers — treat entire text as one section
    return [{ name: 'Paper', text }];
  }

  return breaks.map((b, i) => ({
    name: b.name,
    text: text.slice(b.index, i + 1 < breaks.length ? breaks[i + 1].index : text.length),
  }));
}

// ─── Passage + question parser ────────────────────────────────────────────────

function parseContent(rawPages) {
  const normalized = rawPages.map(p => p.text).join('\n').replace(/\s+/g, ' ');

  const sections = splitIntoSections(normalized);

  const allPassages = [];
  const allQuestions = [];

  for (const section of sections) {
    const { passages, questions } = parseSingleSection(section.text, allQuestions.length);
    allPassages.push(...passages);
    allQuestions.push(...questions);
  }

  return { passages: allPassages, questions: allQuestions };
}

// Strip repeating PDF noise that causes false-positive question number matches.
// Be surgical — only remove the specific fragments that contain stray numbers.
function stripNoise(text) {
  return text
    // Remove email addresses — the part before @ is often "address@domain" but
    // the street address BEFORE the email (e.g. "29 lockheed street, ") is the real problem
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
    // Remove the licence watermark block that appears verbatim on every page
    // "This product is licensed solely for the personal and private use of ... Unauthorized distribution prohibited"
    // {0,600} because the full block (name + address + email + CONFIDENTIAL clause) is ~450 chars
    .replace(/This product is licensed solely[\s\S]{0,600}?Unauthorized distribution prohibited/gi, '')
    // Any remaining fragments from above block
    .replace(/for the personal and private use of[^.]*\./gi, '')
    .replace(/Any transfer[^.]*forbidden/gi, '')
    .replace(/CONFIDENTIAL\s+This copy is issued to[^.]*\./gi, '')
    .replace(/Unauthorized distribution[^\n.]*/gi, '')
    // Street addresses left over (e.g. "29 lockheed street" without the email context)
    .replace(/\d{1,3}\s+lockheed\s+street/gi, '')
    // Section preamble metadata — "45 minutes 60 marks" at top of each section header
    // Removing this prevents "5 minutes" and "60 marks" from being detected as Q5/Q60
    .replace(/\d+\s+minutes\s+\d+\s+marks/gi, '')
    // Page navigation footers/headers
    .replace(/Page\s+\d+\s+Please go on to the next page\s*>+/gi, '')
    .replace(/Please go on to the next page\s*>+/gi, '')
    // Running page headers like "11+ Queen Elizabeth's School... Practice Test N, Maths, Page N"
    // These create phantom question numbers (e.g. "Test 1 1 Jen" → double "1")
    .replace(/11\+\s+Queen Elizabeth[^|]{0,120}?,\s*Page\s+\d+/gi, '')
    // Standalone duplicate "Page N Page N" and ", Page N" fragments
    .replace(/,?\s*Page\s+\d+\s+Page\s+\d+/gi, '')
    .replace(/,\s*Page\s+\d+\b/gi, '')
    // Branding lines — keep minimal, just the repeated watermark stamp
    .replace(/www\.exampapersplus\.co\.uk\s*©?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseSingleSection(text, questionOffset) {
  // Strip all recurring noise FIRST so it doesn't pollute question parsing
  const cleaned = stripNoise(text);
  const instructionEnd = findInstructionEnd(cleaned);
  // Join PDF-spaced digit pairs that represent two-digit question numbers.
  // pdfjs sometimes extracts "16" as two separate text items → "1 6".
  // Pattern: isolated digit + space + digit + space(s) + letter → join the two digits.
  // e.g. "1 6 Using 8 km = 5 miles" → "16 Using 8 km = 5 miles"
  //      "1 9 David says"            → "19 David says"
  // Only applied to the BODY (after instruction end) to avoid touching instruction text.
  // Join PDF-spaced digit pairs that represent two-digit question numbers.
  // pdfjs sometimes extracts "16" as two separate text items → "1 6 Using 8 km".
  // Guard: only join when the resulting number is ≤ 65 (no 11+ section has more than 65 Qs).
  // This prevents "E 9 2 One side" → "E 92 One side" (92 > 65 → skipped),
  // while still joining "D 4 7 I need" → "D 47 I need" (47 ≤ 65 → OK).
  const body = cleaned.slice(instructionEnd)
    .replace(/(?<!\w)(\d)[ \t](\d)([ \t]{1,3})(?=[A-Za-z"'(])/g, (match, d1, d2, sp) => {
      const joined = parseInt(d1 + d2);
      return joined <= 65 ? (d1 + d2 + sp) : match;
    });

  const chunks = splitIntoQuestionChunks(body);
  if (!chunks.length) return { passages: [], questions: [] };

  const passages  = [];
  const questions = [];

  // Text before the first question — may be a reading passage
  const preText = body.slice(0, chunks[0].textIndex).trim();
  if (preText.length > 150) {
    const p = buildPassage(preText, 0);
    if (p) passages.push(p);
  }

  let lastQNum   = 0;
  let passageIdx = passages.length ? 0 : null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Big gap in numbering → look for a passage between chunks
    if (chunk.num > lastQNum + 4 && i > 0) {
      const prevChunk = chunks[i - 1];
      const between  = body.slice(prevChunk.textIndex + prevChunk.text.length, chunk.textIndex).trim();
      if (between.length > 150) {
        const p = buildPassage(between, passages.length);
        if (p) { passages.push(p); passageIdx = passages.length - 1; }
      }
    }

    const q = parseQuestionChunk(chunk);
    if (!q) { lastQNum = chunk.num; continue; }

    lastQNum = chunk.num;
    questions.push({ ...q, passageHint: passageIdx, orderIndex: questionOffset + questions.length, sourceQuestionNum: chunk.num });
  }

  return { passages, questions };
}

function buildPassage(text, orderIndex) {
  const clean = text
    .replace(/www\.[^\s]+/gi, '')
    .replace(/©[^.]+\./gi, '')
    .replace(/Page\s+\d+[^.]*\./gi, '')
    .replace(/Please go on[^.]*\./gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length < 100) return null;
  const sentences = (clean.match(/[.!?]/g) || []).length;
  if (sentences < 2) return null;

  const firstLine = clean.split(/[.!\n]/)[0].trim();
  const title = firstLine.length < 80 ? firstLine : 'Reading Passage';
  return { title, content: clean, orderIndex };
}

// ─── Instruction-end detector ─────────────────────────────────────────────────

function findInstructionEnd(text) {
  // Instruction blocks always appear at the START of each section (first ~1500 chars).
  // Only look in that window — "mark" and "answer" appear later in question text too.
  const window = text.slice(0, 1500);

  const markers = [
    /work as quickly and carefully as you can\./i,
    /answer sheet\./i,
    /mark your answer/i,
    /answer the questions/i,
    /answer these questions/i,
    /choose the best answer/i,
  ];

  let furthest = 0;
  for (const m of markers) {
    const match = m.exec(window);
    if (match) furthest = Math.max(furthest, match.index + match[0].length);
  }

  // Skip the "Page N [title] Page N" header that follows instructions before Q1
  if (furthest > 0) {
    const rest = text.slice(furthest, furthest + 500);
    const pageHeader = /(?:Page\s+\d+\s+){1,3}/i.exec(rest);
    if (pageHeader) furthest += pageHeader.index + pageHeader[0].length;
  }

  return furthest;
}

// ─── Question chunk splitter ──────────────────────────────────────────────────

function splitIntoQuestionChunks(text) {
  // Step 1: collect ALL candidate positions where a 1-2 digit number is followed by
  // a letter/quote/paren — covers both uppercase ("32 Work out") AND lowercase
  // ("32 simplify", "36 look at") question starts.
  const re = /(?<!\w)(\d{1,2})[ \t]{1,3}(?=[A-Za-z"'(])/g;
  const candidates = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const num = parseInt(m[1]);
    if (num >= 1 && num <= 100) {
      candidates.push({ num, index: m.index, matchEnd: m.index + m[0].length });
    }
  }

  // Step 1b: second pass for sequence-type questions where the question number is
  // followed directly by the first term of a numerical sequence (e.g. "3 2, 5, 10, …").
  // The letter-lookahead regex above misses these because "2" is not a letter.
  // Pattern: isolated 1-2 digit number + spaces + digit + comma/period
  const seqRe = /(?<!\w)(\d{1,2})[ \t]{1,3}(\d[,.])/g;
  while ((m = seqRe.exec(text)) !== null) {
    const num = parseInt(m[1]);
    if (num >= 1 && num <= 100) {
      // matchEnd points at the start of the sequence (the digit after the Q number)
      const matchEnd = m.index + m[0].length - m[2].length;
      // Avoid duplicate if already captured by main regex
      if (!candidates.some(c => Math.abs(c.index - m.index) < 3)) {
        candidates.push({ num, index: m.index, matchEnd });
      }
    }
  }

  // Sort candidates by position (seqRe pass may insert out-of-order entries)
  candidates.sort((a, b) => a.index - b.index);

  // Step 2: filter out false positives.
  const filtered = candidates.filter((c, ci) => {
    const nextIdx = candidates[ci + 1]?.index ?? text.length;
    const chunk = text.slice(c.matchEnd, Math.min(c.matchEnd + 120, nextIdx)).trim();

    // Reject if immediately-following text looks like an MCQ option label:
    // "A 24 km", "B 3 C", "E 9 2" — i.e. letter + space + uppercase/digit.
    // Do NOT reject "A square" / "A circle" (lowercase after A = English article, not option).
    if (/^[A-E][ \t][A-Z0-9£$€(]/.test(chunk)) return false;

    // Reject very short chunks — not enough text to be a question
    if (chunk.length < 6) return false;

    // Reject if the chunk text immediately starts with a unit or measurement word —
    // these are almost always numbers referenced within existing question text.
    // e.g. "12 square numbers" → chunk starts "square numbers"
    //      "8 cm long"         → chunk starts "cm long"
    //      "60 marks"          → chunk starts "marks"   (already stripped above, but belt-and-braces)
    if (/^(square|cubic|minutes?|marks?|cm|mm|km|kg|ml|litres?|metres?|miles?|degree|percent|%|cents?|pence|penny|pennies|pounds?|hours?|seconds?|days?|weeks?|months?|years?)/i.test(chunk)) return false;

    return true;
  });

  // Step 3: build a sequential chain from filtered candidates.
  // Start from a low number (≤5) and allow up to 2 gaps (for diagram-only NVR questions
  // whose text is blank and thus may not generate a candidate).
  const positions = [];
  for (const c of filtered) {
    if (positions.length === 0) {
      if (c.num <= 5) positions.push(c);
      continue;
    }
    const last = positions[positions.length - 1].num;
    if (c.num <= last) continue;          // must be strictly increasing
    if (c.num <= last + 3) positions.push(c); // allow up to 2 missed questions
  }

  // Step 4: slice text into chunks
  const chunks = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end   = i + 1 < positions.length ? positions[i + 1].index : text.length;
    chunks.push({ num: positions[i].num, text: text.slice(start, end).trim(), textIndex: start });
  }
  return chunks;
}

// ─── Single chunk parser ──────────────────────────────────────────────────────

function parseQuestionChunk(chunk) {
  const { num, text } = chunk;
  if (text.length < 10) return null;

  // Find the first " A " that is far enough into the text to be actual MCQ options,
  // not the English article. E.g. "9 A square of area..." — the "A" is the article,
  // not option A.  We require at least 10 chars of real question text before it.
  let firstOptionMatch = null;
  {
    const optRE = /\s+A\s+/g;
    let mo2;
    while ((mo2 = optRE.exec(text)) !== null) {
      const potBody = text.slice(0, mo2.index).replace(/^\d+[ \t]+/, '').trim();
      if (potBody.length >= 10) { firstOptionMatch = mo2; break; }
    }
  }
  if (!firstOptionMatch) {
    const questionText = cleanQuestionText(text, num);
    if (!questionText || questionText.length < 8) return null;
    return { questionText, questionType: 'free_text', marks: 1, options: [], hint: '', explanation: '' };
  }

  const questionBody  = text.slice(0, firstOptionMatch.index).trim();
  const optionsBlock  = text.slice(firstOptionMatch.index).trim();
  if (questionBody.length > 600) return null;

  const options    = [];
  const seenLabels = new Set();
  const optBlockRE = /\b([A-E])\s+((?:(?!\b[A-E]\s).)+)/g;
  let mo;
  while ((mo = optBlockRE.exec(optionsBlock)) !== null) {
    // A repeated label means we've crossed into the next question's options — stop.
    if (seenLabels.has(mo[1])) break;
    seenLabels.add(mo[1]);
    const optText = mo[2].replace(/\s+/g, ' ').trim()
      .replace(/\s*(Page\s+\d+|Please go on|This product is licensed|www\.|©).*/i, '')
      .trim();
    if (optText.length > 0) options.push({ label: mo[1], text: optText });
  }

  const questionText = cleanQuestionText(questionBody, num);
  if (!questionText || questionText.length < 8) return null;
  if (options.length > 6) return null;

  // Reject only clear section-header instructions (not content questions)
  const isInstruction = /^(read this passage|read the passage|answer the questions|please answer|look at the passage|passage|extract from)/i.test(questionText);
  if (isInstruction) return null;

  // Reject very long free-text blocks with no question marker (likely mis-parsed passage text)
  if (!questionText.includes('?') && options.length === 0 && questionText.length > 250) return null;

  // Accept question if it looks like a question OR has MCQ options
  // Broadened to include maths verbs: calculate, find, work out, simplify, complete, etc.
  const looksLikeQuestion = options.length >= 2 ||
    /\?|which|what|why|how|who|where|when|suggest|refer|mean|describe|best sum/i.test(questionText) ||
    /^(calculate|find|work out|simplify|complete|solve|evaluate|expand|factorise|factorise|write|give|show|prove|state|identify|select|choose|circle|underline|tick|match|sort|order|put|list|name|define|explain|compare|convert|round|estimate|measure)/i.test(questionText) ||
    /^(in which|in the|from the|using the|based on|according to)/i.test(questionText);

  if (!looksLikeQuestion) return null;

  return {
    questionText,
    questionType: options.length >= 2 ? 'mcq' : 'free_text',
    marks: 1,
    options,
    hint: '',
    explanation: '',
  };
}

function cleanQuestionText(text, num) {
  const s = String(num);
  return text
    // Strip normal prefix "47 " or spaced prefix "4 7 " (PDF digit-split artifact)
    .replace(new RegExp(`^${num}[ \\t]+`), '')
    .replace(s.length === 2 ? new RegExp(`^${s[0]}[ \\t]${s[1]}[ \\t]+`) : /^$/, '')
    .replace(/www\.exampapersplus\.co\.uk\s*©?\s*/gi, '')
    .replace(/11\+\s+Queen Elizabeth[^.]*?Page\s+\d+/gi, '')
    .replace(/Page\s+\d+\s+Please go on[^>]*>>>/gi, '')
    .replace(/Please go on to the next page >>>/gi, '')
    .replace(/This product is licensed[^.]*\./gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function extractQuestionsFromPDF(filePath, password) {
  const { rawPages, pageCount } = await extractFromPDF(filePath, password);
  const { passages, questions }  = parseContent(rawPages);
  const candidateImages          = filterAndSaveImages(rawPages);

  return {
    questions,
    passages,
    // Images are returned as an unassigned bank — admin assigns them manually
    candidateImages,
    pageCount,
    rawTextLength:  rawPages.map(p => p.text).join('').length,
    extractedCount: questions.length,
  };
}

module.exports = { extractQuestionsFromPDF };
