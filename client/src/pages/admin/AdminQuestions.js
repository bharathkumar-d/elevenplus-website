import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import Badge from '../../components/Badge';
import groupQuestionsByPassage from '../../utils/groupQuestionsByPassage';
import DiagramEditor from '../../components/DiagramEditor';

const EMPTY_Q = { questionText: '', questionType: 'mcq', marks: 1, hint: '', explanation: '', options: [
  { optionLabel: 'A', optionText: '', isCorrect: false },
  { optionLabel: 'B', optionText: '', isCorrect: false },
  { optionLabel: 'C', optionText: '', isCorrect: false },
  { optionLabel: 'D', optionText: '', isCorrect: false },
]};

export default function AdminQuestions() {
  const [searchParams] = useSearchParams();
  const paperId = searchParams.get('paperId');
  const paperTitle = searchParams.get('paperTitle') || 'Questions';

  const [questions, setQuestions] = useState([]);
  const [papers, setPapers] = useState([]);
  const [ref, setRef] = useState({ examTypes: [], schools: [], subjects: [] });
  const [loading, setLoading] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState(paperId || '');

  // Manual add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [qForm, setQForm] = useState(EMPTY_Q);
  const [saving, setSaving] = useState(false);

  // AI generator modal (claude.ai clipboard workflow — no API key)
  const [showAI, setShowAI] = useState(false);
  const [aiForm, setAiForm] = useState({ prompt: '', subjectId: '', examTypeId: '', numQuestions: 5, difficulty: 'medium' });
  const [aiGenPrompt, setAiGenPrompt] = useState('');     // prompt the admin pastes into claude.ai
  const [aiGenResponse, setAiGenResponse] = useState(''); // JSON reply pasted back
  const [aiGenCopied, setAiGenCopied] = useState(false);
  const [aiGenError, setAiGenError] = useState('');
  const [generated, setGenerated] = useState(null); // { questions }
  const [approved, setApproved] = useState({}); // questionIndex -> bool
  const [approving, setApproving] = useState(false);

  // Edit question modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null); // full question object
  const [editQForm, setEditQForm] = useState({ questionText: '', marks: 1, hint: '', explanation: '', correctOptionId: null });
  const [savingEdit, setSavingEdit] = useState(false);

  // PDF extractor modal
  const [showPdfExtract, setShowPdfExtract] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extracted, setExtracted] = useState(null); // { questions, passages, candidateImages, pageCount, extractedCount }
  const [extractedApproved, setExtractedApproved] = useState({});
  const [extractedQuestions, setExtractedQuestions] = useState([]); // editable copy
  const [savingExtracted, setSavingExtracted] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfNeedsPassword, setPdfNeedsPassword] = useState(false);
  const [pdfWrongPassword, setPdfWrongPassword] = useState(false);

  // Image bank — used during extraction review AND on saved questions
  // selectedImageUrl: the image the admin just clicked in the bank
  // assigningImageToQ: index into extractedQuestions (during review) or question id (on saved list)
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);
  const [assigningImageTo, setAssigningImageTo] = useState(null); // { mode:'extract'|'saved', idx/id }
  // Image bank for saved questions (after extraction is done)
  const [showImageBank, setShowImageBank] = useState(false);
  const [imageBankImages, setImageBankImages] = useState([]);
  const [imageBankTarget, setImageBankTarget] = useState(null); // question id

  // Diagram editor
  const [showDiagramEditor, setShowDiagramEditor] = useState(false);
  const [diagramEditorTarget, setDiagramEditorTarget] = useState(null); // question id or null (save to bank only)

  // AI answer helper — bulk (during PDF extraction, clipboard-based)
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [aiPromptText, setAiPromptText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [applyError, setApplyError] = useState('');

  // AI answer helper — single saved question
  const [showSingleAi, setShowSingleAi] = useState(false);
  const [singleAiQuestion, setSingleAiQuestion] = useState(null);
  const [singleAiPrompt, setSingleAiPrompt] = useState('');
  const [singleAiResponse, setSingleAiResponse] = useState('');
  const [singleAiCopied, setSingleAiCopied] = useState(false);
  const [singleAiError, setSingleAiError] = useState('');
  const [savingSingleAi, setSavingSingleAi] = useState(false);

  // Passages
  const [passages, setPassages] = useState([]);
  const [activeTab, setActiveTab] = useState('questions'); // 'questions' | 'passages'
  const [showPassageModal, setShowPassageModal] = useState(false);
  const [editingPassage, setEditingPassage] = useState(null);
  const [passageForm, setPassageForm] = useState({ title: '', content: '' });
  const [savingPassage, setSavingPassage] = useState(false);

  const loadQuestions = useCallback(async () => {
    if (!selectedPaperId) return;
    setLoading(true);
    const [qRes, pRes] = await Promise.all([
      api.get(`/questions?paperId=${selectedPaperId}`),
      api.get(`/passages?paperId=${selectedPaperId}`),
    ]);
    setQuestions(qRes.data);
    setPassages(pRes.data);
    setLoading(false);
  }, [selectedPaperId]);

  useEffect(() => {
    api.get('/papers').then(r => setPapers(r.data));
    api.get('/admin/reference').then(r => setRef(r.data));
  }, []);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);

  // Manual add
  const saveQuestion = async () => {
    if (!qForm.questionText.trim() || !selectedPaperId) return;
    setSaving(true);
    try {
      await api.post('/questions', { ...qForm, paperId: selectedPaperId });
      setShowAddModal(false);
      setQForm(EMPTY_Q);
      loadQuestions();
    } finally { setSaving(false); }
  };

  const deleteQuestion = async (id) => {
    if (!window.confirm('Delete this question?')) return;
    await api.delete(`/questions/${id}`);
    loadQuestions();
  };

  const openEditQuestion = (q) => {
    setEditingQuestion(q);
    setEditQForm({
      questionText: q.question_text,
      marks: q.marks,
      hint: q.hint || '',
      explanation: q.explanation || '',
      correctOptionId: q.options ? (q.options.find(o => o.isCorrect)?.id || null) : null,
    });
    setShowEditModal(true);
  };

  const saveEditQuestion = async () => {
    if (!editingQuestion || !editQForm.questionText.trim()) return;
    setSavingEdit(true);
    try {
      await api.patch(`/questions/${editingQuestion.id}`, editQForm);
      setShowEditModal(false);
      setEditingQuestion(null);
      loadQuestions();
    } finally { setSavingEdit(false); }
  };

  const setCorrect = (idx) => {
    setQForm(f => ({ ...f, options: f.options.map((o, i) => ({ ...o, isCorrect: i === idx })) }));
  };

  // AI generator — build a prompt for claude.ai (uses your Claude subscription, no API key)
  const buildGeneratePrompt = () => {
    if (!aiForm.prompt.trim()) return;
    const subject = ref.subjects.find(s => s.id === aiForm.subjectId)?.name || 'general';
    const examType = ref.examTypes.find(e => e.id === aiForm.examTypeId)?.name || '';
    const n = parseInt(aiForm.numQuestions) || 5;

    const prompt = `You are an expert 11+ exam question writer for UK grammar school entrance exams.
Generate ${n} questions appropriate for children aged 9-10.
${examType ? `These questions are for the ${examType} exam format.` : ''}
Subject: ${subject}
Difficulty: ${aiForm.difficulty}

Topic / instructions: ${aiForm.prompt}

Return ONLY valid JSON in this exact structure — no markdown fences, no text before or after:
{
  "questions": [
    {
      "questionText": "...",
      "questionType": "mcq",
      "marks": 1,
      "hint": "optional hint or null",
      "explanation": "explanation of the correct answer",
      "options": [
        { "optionLabel": "A", "optionText": "...", "isCorrect": false },
        { "optionLabel": "B", "optionText": "...", "isCorrect": true },
        { "optionLabel": "C", "optionText": "...", "isCorrect": false },
        { "optionLabel": "D", "optionText": "...", "isCorrect": false }
      ]
    }
  ]
}
For free_text questions, set "questionType": "free_text" and omit the options array.
For MCQ, exactly one option must have isCorrect true.`;

    setAiGenPrompt(prompt);
    setAiGenResponse('');
    setAiGenError('');
    setAiGenCopied(false);
  };

  const copyGenPrompt = () => {
    navigator.clipboard.writeText(aiGenPrompt).then(() => {
      setAiGenCopied(true);
      setTimeout(() => setAiGenCopied(false), 2500);
    });
  };

  // Parse the JSON pasted back from claude.ai into the review list
  const applyGenResponse = () => {
    setAiGenError('');
    try {
      const cleaned = aiGenResponse.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.questions || !Array.isArray(parsed.questions) || !parsed.questions.length) {
        setAiGenError('Unexpected format — make sure you pasted the full JSON response from Claude.');
        return;
      }
      setGenerated({ questions: parsed.questions });
      const init = {};
      parsed.questions.forEach((_, i) => { init[i] = true; });
      setApproved(init);
    } catch {
      setAiGenError('Could not parse the response. Paste only the JSON that Claude returned.');
    }
  };

  // PDF extraction
  const extractFromPdf = async () => {
    if (!selectedPaperId) { alert('Select a paper first'); return; }
    setExtracting(true);
    setExtracted(null);
    setPdfNeedsPassword(false);
    setPdfWrongPassword(false);
    try {
      const { data } = await api.post(`/papers/${selectedPaperId}/extract-questions`, {
        password: pdfPassword || undefined,
      });
      // Mark detected passages as accepted by default; images start unassigned
      const dataWithPassages = {
        ...data,
        passages: (data.passages || []).map(p => ({ ...p, accepted: true })),
        candidateImages: (data.candidateImages || []),
      };
      setExtracted(dataWithPassages);
      setSelectedImageUrl(null);
      setAssigningImageTo(null);
      const editable = data.questions.map(q => ({
        ...q,
        options: q.options.map((o, i) => ({
          optionLabel: o.label || String.fromCharCode(65 + i),
          optionText: o.text,
          isCorrect: false,
        })),
        imageUrl: q.imageUrl || null,
      }));
      setExtractedQuestions(editable);
      const init = {};
      data.questions.forEach((_, i) => { init[i] = true; });
      setExtractedApproved(init);
    } catch (err) {
      if (err.response?.data?.needsPassword) {
        setPdfNeedsPassword(true);
        setPdfWrongPassword(err.response?.data?.wrongPassword || false);
      } else {
        alert('Extraction failed: ' + (err.response?.data?.error || err.message));
      }
    } finally { setExtracting(false); }
  };

  const saveExtracted = async () => {
    const toSave = extractedQuestions.filter((_, i) => extractedApproved[i]);
    if (!toSave.length) { alert('Select at least one question'); return; }
    setSavingExtracted(true);
    try {
      // First save any new passages and build id map
      const passageIdMap = {}; // passageHint index → saved passage id
      if (extracted.passages && extracted.passages.length > 0) {
        for (let pi = 0; pi < extracted.passages.length; pi++) {
          const p = extracted.passages[pi];
          if (p.accepted) {
            const { data } = await api.post('/passages', {
              paperId: selectedPaperId,
              title: p.title,
              content: p.content,
              orderIndex: pi,
            });
            passageIdMap[pi] = data.id;
          }
        }
      }

      // Then save questions, linking passage IDs where applicable
      // Use the original extractedQuestions index for orderIndex so questions stay in paper order
      for (let si = 0; si < toSave.length; si++) {
        const q = toSave[si];
        const passageId = q.passageHint != null ? (passageIdMap[q.passageHint] || null) : null;
        // q.orderIndex was set during extraction; fall back to loop position
        const orderIndex = q.orderIndex != null ? q.orderIndex : si;
        await api.post('/questions', {
          ...q,
          paperId: selectedPaperId,
          passageId,
          imageUrl: q.imageUrl || null,
          orderIndex,
        });
      }

      setShowPdfExtract(false);
      setExtracted(null);
      setExtractedQuestions([]);
      loadQuestions();
    } finally { setSavingExtracted(false); }
  };

  const updateExtractedQ = (i, field, value) => {
    setExtractedQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, [field]: value } : q));
  };

  const setExtractedCorrect = (qIdx, optIdx) => {
    setExtractedQuestions(qs => qs.map((q, i) => i === qIdx
      ? { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === optIdx })) }
      : q
    ));
  };

  // Build a prompt for Claude.ai to identify correct answers
  const buildAiPrompt = () => {
    const mcqOnly = extractedQuestions.filter(q => q.questionType === 'mcq' && q.options.length > 0);
    if (!mcqOnly.length) return;

    const lines = [
      'I have extracted these MCQ questions from an 11+ exam paper.',
      'Please identify the most likely correct answer for each question.',
      'Return ONLY valid JSON, exactly like this example — no explanation, no markdown:',
      '{"answers":[{"q":1,"correct":"B"},{"q":2,"correct":"D"}]}',
      '',
      'Questions:',
      '',
    ];

    mcqOnly.forEach((q, i) => {
      // Use the original index so we can map back
      const origIdx = extractedQuestions.indexOf(q);
      lines.push(`Q${origIdx + 1}: ${q.questionText}`);
      q.options.forEach(o => lines.push(`  ${o.optionLabel}. ${o.optionText}`));
      lines.push('');
    });

    const prompt = lines.join('\n');
    setAiPromptText(prompt);
    setAiResponseText('');
    setApplyError('');
    setPromptCopied(false);
    setShowAiHelper(true);
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(aiPromptText).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    });
  };

  // Parse Claude's JSON response and fill in correct answers
  const applyAiAnswers = () => {
    setApplyError('');
    try {
      // Strip markdown code fences if Claude wrapped it
      const cleaned = aiResponseText.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!parsed.answers || !Array.isArray(parsed.answers)) {
        setApplyError('Unexpected format — make sure you pasted the full JSON response from Claude.');
        return;
      }

      let applied = 0;
      setExtractedQuestions(qs => {
        const updated = qs.map((q, idx) => {
          const match = parsed.answers.find(a => a.q === idx + 1);
          if (!match || q.questionType !== 'mcq') return q;
          const correctLabel = match.correct.toUpperCase();
          const optIdx = q.options.findIndex(o => o.optionLabel === correctLabel);
          if (optIdx === -1) return q;
          applied++;
          return { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === optIdx })) };
        });
        return updated;
      });

      setTimeout(() => {
        setShowAiHelper(false);
        setAiResponseText('');
      }, 300);
    } catch (e) {
      setApplyError('Could not parse the response. Make sure you paste only the JSON that Claude returned.');
    }
  };

  // Passage CRUD
  const openCreatePassage = () => { setEditingPassage(null); setPassageForm({ title: '', content: '' }); setShowPassageModal(true); };
  const openEditPassage   = (p) => { setEditingPassage(p); setPassageForm({ title: p.title || '', content: p.content }); setShowPassageModal(true); };
  const savePassage = async () => {
    if (!passageForm.content.trim()) return;
    setSavingPassage(true);
    try {
      if (editingPassage) {
        await api.patch(`/passages/${editingPassage.id}`, passageForm);
      } else {
        await api.post('/passages', { ...passageForm, paperId: selectedPaperId, orderIndex: passages.length });
      }
      setShowPassageModal(false);
      loadQuestions();
    } finally { setSavingPassage(false); }
  };
  const deletePassage = async (id) => {
    if (!window.confirm('Delete this passage? Questions linked to it will be unlinked.')) return;
    await api.delete(`/passages/${id}`);
    loadQuestions();
  };
  const linkQuestionToPassage = async (questionId, passageId) => {
    await api.patch(`/questions/${questionId}`, { passageId: passageId || null });
    loadQuestions();
  };

  // ── Image bank helpers ────────────────────────────────────────────────────

  // During extraction review: click image → select it; click question → assign
  const handleExtractImageClick = (imageUrl) => {
    setSelectedImageUrl(prev => prev === imageUrl ? null : imageUrl);
  };

  const handleExtractQuestionImageAssign = (qIdx) => {
    if (!selectedImageUrl) return;
    updateExtractedQ(qIdx, 'imageUrl', selectedImageUrl);
    setSelectedImageUrl(null);
  };

  const removeExtractQuestionImage = (qIdx) => {
    updateExtractedQ(qIdx, 'imageUrl', null);
  };

  // Diagram editor handlers
  const openDiagramEditor = (questionId) => {
    setDiagramEditorTarget(questionId || null);
    setShowDiagramEditor(true);
  };

  const handleDiagramSave = async (imageUrl, saveOnly) => {
    if (!saveOnly && diagramEditorTarget) {
      await api.patch(`/questions/${diagramEditorTarget}`, { imageUrl });
      loadQuestions();
    }
    // Add to image bank list so it appears immediately without re-fetch
    setImageBankImages(prev => [{ imageUrl, filename: imageUrl.split('/').pop() }, ...prev]);
    setShowDiagramEditor(false);
    setDiagramEditorTarget(null);
  };

  // On saved questions: open modal with images from tmp folder
  const openImageBankForQuestion = async (questionId) => {
    // Fetch list of available images from server
    try {
      const { data } = await api.get('/papers/diagram-images');
      setImageBankImages(data.images || []);
      setImageBankTarget(questionId);
      setShowImageBank(true);
    } catch {
      alert('Could not load image bank. Extract a PDF first to populate it.');
    }
  };

  const assignImageToSavedQuestion = async (imageUrl) => {
    if (!imageBankTarget) return;
    await api.patch(`/questions/${imageBankTarget}`, { imageUrl });
    setShowImageBank(false);
    setImageBankTarget(null);
    loadQuestions();
  };

  const removeImageFromSavedQuestion = async (questionId) => {
    await api.patch(`/questions/${questionId}`, { imageUrl: null });
    loadQuestions();
  };

  // Single-question AI helper
  const openSingleAiHelper = (q) => {
    setSingleAiQuestion(q);
    setSingleAiResponse('');
    setSingleAiError('');
    setSingleAiCopied(false);

    const lines = [
      'I have an MCQ question from an 11+ exam paper. Please identify the correct answer.',
      'Return ONLY valid JSON, no explanation, no markdown:',
      '{"correct":"B"}',
      '',
      `Question: ${q.question_text}`,
    ];
    q.options.forEach(o => lines.push(`${o.optionLabel}. ${o.optionText}`));

    setSingleAiPrompt(lines.join('\n'));
    setShowSingleAi(true);
  };

  const copySinglePrompt = () => {
    navigator.clipboard.writeText(singleAiPrompt).then(() => {
      setSingleAiCopied(true);
      setTimeout(() => setSingleAiCopied(false), 2500);
    });
  };

  const applySingleAiAnswer = async () => {
    setSingleAiError('');
    let correctLabel;
    try {
      const cleaned = singleAiResponse.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
      // Accept plain letter ("B") or JSON ({"correct":"B"})
      if (/^[A-Ea-e]$/.test(cleaned)) {
        correctLabel = cleaned.toUpperCase();
      } else {
        const parsed = JSON.parse(cleaned);
        if (!parsed.correct) throw new Error('missing correct field');
        correctLabel = parsed.correct.toUpperCase();
      }
    } catch {
      setSingleAiError('Could not parse the response. Paste just the JSON Claude returned, e.g. {"correct":"B"}');
      return;
    }

    const matchedOption = singleAiQuestion.options.find(o => o.optionLabel === correctLabel);
    if (!matchedOption) {
      setSingleAiError(`Option "${correctLabel}" not found in this question's choices.`);
      return;
    }

    setSavingSingleAi(true);
    try {
      await api.patch(`/questions/${singleAiQuestion.id}`, { correctOptionId: matchedOption.id });
      setShowSingleAi(false);
      setSingleAiQuestion(null);
      loadQuestions();
    } catch (err) {
      setSingleAiError('Save failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingSingleAi(false);
    }
  };

  const approveGenerated = async () => {
    if (!selectedPaperId) { alert('Please select a paper first'); return; }
    const toSave = generated.questions.filter((_, i) => approved[i]);
    if (!toSave.length) { alert('Select at least one question'); return; }
    setApproving(true);
    try {
      await api.post('/questions/approve-generated', { paperId: selectedPaperId, questions: toSave });
      setShowAI(false);
      setGenerated(null);
      setAiGenPrompt('');
      setAiGenResponse('');
      setAiForm({ prompt: '', subjectId: '', examTypeId: '', numQuestions: 5, difficulty: 'medium' });
      loadQuestions();
    } finally { setApproving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Questions</h1>
          <p className="text-slate-500 mt-1">{selectedPaperId ? decodeURIComponent(paperTitle) : 'Select a paper to manage its questions'}</p>
        </div>
        {selectedPaperId && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setQForm(EMPTY_Q); setShowAddModal(true); }} className="btn-secondary flex items-center gap-2">
              <span>➕</span> Add Question
            </button>
            <button onClick={() => { setExtracted(null); setPdfPassword(''); setPdfNeedsPassword(false); setShowPdfExtract(true); }} className="btn-secondary flex items-center gap-2 border-orange-300 text-orange-700 hover:bg-orange-50">
              <span>📄</span> Extract from PDF
            </button>
            <button onClick={() => { setGenerated(null); setAiGenPrompt(''); setAiGenResponse(''); setAiGenError(''); setShowAI(true); }} className="btn-primary flex items-center gap-2">
              <span>🤖</span> Generate with AI
            </button>
          </div>
        )}
      </div>

      {/* Paper selector */}
      <div className="card">
        <label className="block text-sm font-bold text-slate-600 mb-2">Select Paper</label>
        <select className="input" value={selectedPaperId} onChange={e => setSelectedPaperId(e.target.value)}>
          <option value="">— Choose a paper —</option>
          {papers.map(p => <option key={p.id} value={p.id}>{p.subject_icon} {p.title} ({p.exam_type_name || 'No exam type'})</option>)}
        </select>
      </div>

      {/* Tabs */}
      {selectedPaperId && (
        <div className="flex gap-1 border-b border-slate-200">
          {[['questions', `❓ Questions (${questions.length})`], ['passages', `📖 Passages (${passages.length})`]].map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-bold rounded-t-lg transition-colors ${activeTab === tab ? 'bg-white border border-b-white border-slate-200 text-brand-600 -mb-px' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Questions list */}
      {activeTab === 'questions' && (
        loading ? (
          <div className="text-center py-12 text-slate-400">Loading questions...</div>
        ) : !selectedPaperId ? null : questions.length === 0 ? (
          <div className="card border-2 border-dashed border-slate-200 text-center py-16">
            <div className="text-5xl mb-3">❓</div>
            <p className="font-bold text-slate-500">No questions yet</p>
            <p className="text-slate-400 mt-1">Add manually, extract from PDF, or generate with AI</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(() => {
              const groups = groupQuestionsByPassage(questions, passages);

              return groups.map((group, gi) => (
                <div key={gi} className="space-y-2">
                  {/* Passage group header */}
                  {group.passage && (
                    <div className="flex items-center gap-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <span className="text-base">📖</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-emerald-800 text-sm">{group.passage.title}</span>
                        <span className="text-emerald-600 text-xs ml-2">{group.questions.length} question{group.questions.length !== 1 ? 's' : ''}</span>
                      </div>
                      <button onClick={() => openEditPassage(group.passage)} className="text-xs text-emerald-600 hover:underline font-semibold">Edit passage</button>
                    </div>
                  )}
                  {/* Question cards */}
                  {group.questions.map(({ q, idx }) => (
                    <div key={q.id} className={`card border ${q.passage_id ? 'border-emerald-100 ml-4' : 'border-slate-100'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs font-black text-slate-400">Q{idx + 1}</span>
                            <Badge label={q.question_type === 'mcq' ? 'MCQ' : 'Free Text'} colour={q.question_type === 'mcq' ? 'blue' : 'purple'} />
                            <Badge label={`${q.marks} mark${q.marks > 1 ? 's' : ''}`} colour="slate" />
                            {q.image_url && <span className="text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">🖼️ Diagram</span>}
                            {q.passage_id && <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">📖 Passage</span>}
                            {/* Passage link selector */}
                            <select
                              value={q.passage_id || ''}
                              onChange={e => linkQuestionToPassage(q.id, e.target.value || null)}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-0.5 text-slate-600 bg-white ml-auto"
                              title="Link to passage">
                              <option value="">No passage</option>
                              {passages.map(p => <option key={p.id} value={p.id}>📖 {p.title}</option>)}
                            </select>
                          </div>
                          {/* Diagram thumbnail + assign/remove controls */}
                          {q.image_url ? (
                            <div className="mb-2 relative inline-block">
                              <img src={`http://localhost:5000${q.image_url}`} alt="diagram"
                                className="max-h-32 rounded-lg border border-amber-200 bg-white object-contain cursor-zoom-in"
                                onClick={() => window.open(`http://localhost:5000${q.image_url}`, '_blank')} />
                              <button onClick={() => removeImageFromSavedQuestion(q.id)}
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center hover:bg-red-600"
                                title="Remove image">✕</button>
                            </div>
                          ) : null}
                          <p className="font-semibold text-slate-800">{q.question_text}</p>
                          {q.options && (
                            <div className="mt-2 grid grid-cols-2 gap-1">
                              {q.options.map(o => (
                                <div key={o.id} className={`text-sm px-3 py-1.5 rounded-lg ${o.isCorrect ? 'bg-green-50 text-green-700 font-bold' : 'bg-slate-50 text-slate-600'}`}>
                                  <span className="font-bold mr-1">{o.optionLabel}.</span>{o.optionText}
                                </div>
                              ))}
                            </div>
                          )}
                          {q.explanation && <p className="mt-2 text-xs text-slate-500 italic">💡 {q.explanation}</p>}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          {q.question_type === 'mcq' && q.options && q.options.length > 0 && (
                            <button onClick={() => openSingleAiHelper(q)}
                              className="px-2 py-1 text-xs font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 rounded-lg transition-colors" title="Ask Claude for correct answer">🤖</button>
                          )}
                          <button onClick={() => openDiagramEditor(q.id)}
                            className="px-2 py-1 text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors" title="Create diagram">✏️🖼️</button>
                          <button onClick={() => openImageBankForQuestion(q.id)}
                            className="px-2 py-1 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors" title="Assign diagram from bank">🖼️</button>
                          <button onClick={() => openEditQuestion(q)}
                            className="px-2 py-1 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors" title="Edit question">✏️</button>
                          <button onClick={() => deleteQuestion(q.id)}
                            className="px-2 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-500 rounded-lg transition-colors" title="Delete">🗑️</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>
        )
      )}

      {/* Passages tab */}
      {activeTab === 'passages' && selectedPaperId && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openCreatePassage} className="btn-secondary flex items-center gap-2">
              <span>➕</span> New Passage
            </button>
          </div>
          {passages.length === 0 ? (
            <div className="card border-2 border-dashed border-slate-200 text-center py-16">
              <div className="text-5xl mb-3">📖</div>
              <p className="font-bold text-slate-500">No passages yet</p>
              <p className="text-slate-400 mt-1">Passages are detected automatically during PDF extraction, or create one manually</p>
            </div>
          ) : passages.map(p => {
            const linked = questions.filter(q => q.passage_id === p.id);
            return (
              <div key={p.id} className="card border border-emerald-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📖</span>
                      <h3 className="font-bold text-slate-800">{p.title}</h3>
                      <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 font-bold">{linked.length} question{linked.length !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-3">{p.content}</p>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button onClick={() => openEditPassage(p)} className="px-2 py-1 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg">✏️</button>
                    <button onClick={() => deletePassage(p.id)} className="px-2 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-500 rounded-lg">🗑️</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Add Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Question" wide>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Question Text *</label>
            <textarea className="input" rows={3} value={qForm.questionText} onChange={e => setQForm(f => ({ ...f, questionText: e.target.value }))} placeholder="Type your question here..." />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Type</label>
              <select className="input" value={qForm.questionType} onChange={e => setQForm(f => ({ ...f, questionType: e.target.value }))}>
                <option value="mcq">Multiple Choice</option>
                <option value="free_text">Free Text</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Marks</label>
              <input className="input" type="number" min={1} max={10} value={qForm.marks} onChange={e => setQForm(f => ({ ...f, marks: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Hint (optional)</label>
              <input className="input" value={qForm.hint} onChange={e => setQForm(f => ({ ...f, hint: e.target.value }))} placeholder="Optional hint" />
            </div>
          </div>
          {qForm.questionType === 'mcq' && (
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-2">Answer Options <span className="text-slate-400 font-normal">(click ✓ to mark correct)</span></label>
              <div className="space-y-2">
                {qForm.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-black text-slate-500 w-5">{o.optionLabel}.</span>
                    <input className="input flex-1" value={o.optionText} onChange={e => setQForm(f => ({ ...f, options: f.options.map((opt, idx) => idx === i ? { ...opt, optionText: e.target.value } : opt) }))} placeholder={`Option ${o.optionLabel}`} />
                    <button onClick={() => setCorrect(i)} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${o.isCorrect ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400 hover:bg-green-100'}`}>✓</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Explanation (shown after answer)</label>
            <textarea className="input" rows={2} value={qForm.explanation} onChange={e => setQForm(f => ({ ...f, explanation: e.target.value }))} placeholder="Why is this the correct answer?" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={saveQuestion} disabled={saving || !qForm.questionText.trim()} className="btn-primary flex-1">{saving ? 'Saving...' : 'Add Question'}</button>
            <button onClick={() => setShowAddModal(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* PDF Extractor Modal */}
      <Modal open={showPdfExtract} onClose={() => setShowPdfExtract(false)} title="📄 Extract Questions from PDF" wide>
        {!extracted ? (
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-800">
              <p className="font-bold mb-1">How this works:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Make sure this paper has a PDF uploaded (upload it first in Papers if not)</li>
                <li>Click Extract — we'll scan the PDF for numbered questions and answer options</li>
                <li>Review each question, mark the correct answer, then save</li>
              </ol>
            </div>

            {/* Password field — shown always, highlighted if required */}
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">
                PDF Password <span className="text-slate-400 font-normal">(leave blank if not protected)</span>
              </label>
              {pdfNeedsPassword && !pdfWrongPassword && (
                <div className="mb-2 flex items-center gap-2 text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  🔒 This PDF is password-protected. Enter the password and try again.
                </div>
              )}
              {pdfWrongPassword && (
                <div className="mb-2 flex items-center gap-2 text-sm text-red-600 font-semibold bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  ❌ Incorrect password. Please check and try again.
                </div>
              )}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔑</span>
                <input
                  type="password"
                  className={`input pl-9 ${pdfNeedsPassword ? 'border-red-400 focus:border-red-500' : ''}`}
                  placeholder="Enter PDF password if required"
                  value={pdfPassword}
                  onChange={e => { setPdfPassword(e.target.value); setPdfNeedsPassword(false); setPdfWrongPassword(false); }}
                />
              </div>
            </div>

            {extracting ? (
              <div className="text-center py-8">
                <div className="text-5xl mb-3 animate-spin">📄</div>
                <p className="font-bold text-slate-600">Scanning PDF for questions...</p>
                <p className="text-slate-400 text-sm mt-1">This takes a few seconds</p>
              </div>
            ) : (
              <button onClick={extractFromPdf} className="btn-primary w-full text-lg">
                📄 Scan PDF Now
              </button>
            )}
          </div>
        ) : extracted.questions.length === 0 ? (
          <div className="space-y-4">
            <div className="text-center py-8">
              <div className="text-5xl mb-3">🔍</div>
              <p className="font-bold text-slate-700">No questions found automatically</p>
              <p className="text-slate-500 text-sm mt-2 max-w-sm mx-auto">
                This PDF may be scanned (image-based) or use an unusual format. Try adding questions manually instead.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setExtracted(null)} className="btn-secondary flex-1">Try Again</button>
              <button onClick={() => setShowPdfExtract(false)} className="btn-primary flex-1">Close</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-700">
                  Found <span className="text-orange-600">{extracted.extractedCount} questions</span> across {extracted.pageCount} pages
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Review each question below. For MCQ — mark the correct answer with ✓. Untick any to skip.</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={buildAiPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-xl transition-colors"
                  title="Let Claude.ai fill in the correct answers for you">
                  🤖 Ask Claude
                </button>
                <button onClick={() => setExtracted(null)} className="text-sm text-brand-600 hover:underline">← Rescan</button>
              </div>
            </div>

            {/* Claude.ai helper panel */}
            {showAiHelper && (
              <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-violet-800 flex items-center gap-2">🤖 Ask Claude to fill answers</p>
                  <button onClick={() => setShowAiHelper(false)} className="text-violet-400 hover:text-violet-600 text-lg font-bold">✕</button>
                </div>

                {/* Step 1 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-violet-700">Step 1 — Copy this prompt</p>
                  <div className="relative">
                    <textarea
                      readOnly
                      value={aiPromptText}
                      rows={5}
                      className="w-full text-xs font-mono bg-white border border-violet-200 rounded-xl px-3 py-2 resize-none text-slate-700 focus:outline-none"
                    />
                    <button onClick={copyPrompt}
                      className={`absolute top-2 right-2 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${promptCopied ? 'bg-green-500 text-white' : 'bg-violet-100 hover:bg-violet-200 text-violet-700'}`}>
                      {promptCopied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="bg-white border border-violet-200 rounded-xl px-3 py-2.5 text-xs text-violet-700 font-semibold flex items-center gap-2">
                  <span className="text-base">👆</span>
                  <span>Step 2 — Open <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline font-black">claude.ai</a>, paste the prompt, and send it. Copy Claude's JSON reply.</span>
                </div>

                {/* Step 3 */}
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-violet-700">Step 3 — Paste Claude's response here</p>
                  <textarea
                    value={aiResponseText}
                    onChange={e => { setAiResponseText(e.target.value); setApplyError(''); }}
                    rows={3}
                    placeholder={'Paste the JSON response from Claude here, e.g.\n{"answers":[{"q":1,"correct":"B"},{"q":2,"correct":"D"},...]}'}
                    className="w-full text-xs font-mono bg-white border border-violet-200 rounded-xl px-3 py-2 resize-none text-slate-700 focus:outline-none focus:border-violet-400"
                  />
                  {applyError && (
                    <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{applyError}</p>
                  )}
                  <button
                    onClick={applyAiAnswers}
                    disabled={!aiResponseText.trim()}
                    className="btn-primary w-full !bg-violet-600 hover:!bg-violet-700 disabled:opacity-40">
                    ✅ Apply Answers
                  </button>
                </div>
              </div>
            )}

            {/* Detected passages — accept / reject */}
            {extracted.passages && extracted.passages.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">📖 Detected Reading Passages ({extracted.passages.length})</p>
                {extracted.passages.map((p, pi) => (
                  <div key={pi} className={`border-2 rounded-2xl p-3 transition-colors ${p.accepted ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-60'}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => setExtracted(ex => ({ ...ex, passages: ex.passages.map((pp, ppi) => ppi === pi ? { ...pp, accepted: !pp.accepted } : pp) }))}
                        className={`w-6 h-6 rounded flex-shrink-0 mt-0.5 flex items-center justify-center font-bold text-sm transition-colors ${p.accepted ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-500'}`}>
                        {p.accepted ? '✓' : ''}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-emerald-800">{p.title}</p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-3">{p.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Image Bank — click an image to select it, then click a question card to assign */}
            {extracted.candidateImages && extracted.candidateImages.length > 0 && (
              <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-amber-800">🖼️ Diagram Image Bank ({extracted.candidateImages.length} found)</p>
                  {selectedImageUrl && (
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-3 py-1 animate-pulse">
                      ✅ Image selected — now click a question below to assign it
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-700">
                  {selectedImageUrl
                    ? 'Click a question card below to assign this image to it. Click the image again to deselect.'
                    : 'Click an image to select it, then click a question card below to link the diagram to that question.'}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {extracted.candidateImages.map((img, ii) => {
                    const isSelected = selectedImageUrl === img.imageUrl;
                    const isUsed = extractedQuestions.some(q => q.imageUrl === img.imageUrl);
                    return (
                      <div key={ii} className="relative">
                        <img
                          src={`http://localhost:5000${img.imageUrl}`}
                          alt={`p${img.pageNum}`}
                          className={`h-24 rounded-xl border-2 bg-white object-contain cursor-pointer transition-all ${
                            isSelected ? 'border-amber-500 ring-2 ring-amber-400 scale-105 shadow-lg'
                            : isUsed   ? 'border-green-400 opacity-60'
                            : 'border-amber-200 hover:border-amber-400 hover:scale-105'
                          }`}
                          onClick={() => handleExtractImageClick(img.imageUrl)}
                          title={isSelected ? 'Click to deselect' : isUsed ? 'Already assigned' : `Page ${img.pageNum} — click to select`}
                        />
                        <span className="absolute bottom-1 right-1 text-xs bg-black/50 text-white rounded px-1">p{img.pageNum}</span>
                        {isUsed && <span className="absolute top-1 left-1 text-xs bg-green-500 text-white rounded-full px-1.5 font-bold">✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              {extractedQuestions.map((q, i) => (
                <div key={i}
                  className={`border-2 rounded-2xl p-4 transition-all ${
                    selectedImageUrl
                      ? 'cursor-pointer hover:border-amber-400 hover:shadow-md ' + (extractedApproved[i] ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50 opacity-60')
                      : extractedApproved[i] ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-slate-50 opacity-60'
                  }`}
                  onClick={() => selectedImageUrl && handleExtractQuestionImageAssign(i)}
                  title={selectedImageUrl ? `Click to assign selected image to Q${i+1}` : undefined}
                >
                  <div className="flex items-start gap-3 mb-3">
                    {/* Tick / untick */}
                    <button onClick={e => { e.stopPropagation(); setExtractedApproved(a => ({ ...a, [i]: !a[i] })); }}
                      className={`w-6 h-6 rounded flex-shrink-0 mt-0.5 flex items-center justify-center font-bold text-sm transition-colors ${extractedApproved[i] ? 'bg-orange-500 text-white' : 'bg-slate-300 text-slate-500'}`}>
                      {extractedApproved[i] ? '✓' : ''}
                    </button>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-400">Q{i + 1}</span>
                        {q.passageHint != null && <span className="text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">📖 Passage {q.passageHint + 1}</span>}
                        {q.imageUrl && <span className="text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">🖼️ Diagram</span>}
                        <select value={q.questionType}
                          onChange={e => updateExtractedQ(i, 'questionType', e.target.value)}
                          className="text-xs border border-slate-300 rounded-lg px-2 py-1 font-bold">
                          <option value="mcq">MCQ</option>
                          <option value="free_text">Free Text</option>
                        </select>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-slate-500">Marks:</span>
                          <input type="number" min={1} max={10} value={q.marks}
                            onChange={e => updateExtractedQ(i, 'marks', parseInt(e.target.value) || 1)}
                            className="w-12 text-xs border border-slate-300 rounded-lg px-2 py-1 text-center" />
                        </div>
                      </div>

                      {/* Diagram preview above question text */}
                      {q.imageUrl && (
                        <div className="relative inline-block" onClick={e => e.stopPropagation()}>
                          <img src={`http://localhost:5000${q.imageUrl}`} alt="diagram"
                            className="max-h-32 rounded-xl border-2 border-amber-400 bg-white object-contain cursor-zoom-in"
                            onClick={() => window.open(`http://localhost:5000${q.imageUrl}`, '_blank')} />
                          <button onClick={() => removeExtractQuestionImage(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center hover:bg-red-600"
                            title="Remove image">✕</button>
                        </div>
                      )}

                      {/* Editable question text */}
                      <textarea
                        value={q.questionText}
                        onChange={e => updateExtractedQ(i, 'questionText', e.target.value)}
                        onClick={e => e.stopPropagation()}
                        rows={2}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 font-semibold text-slate-800 bg-white resize-none focus:outline-none focus:border-orange-400"
                      />

                      {/* MCQ options */}
                      {q.questionType === 'mcq' && q.options.length > 0 && (
                        <div className="space-y-2 mt-1" onClick={e => e.stopPropagation()}>
                          <p className="text-xs font-bold text-slate-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                            👇 Select the correct answer using the radio button
                          </p>
                          {q.options.map((o, j) => (
                            <label key={j}
                              className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-all
                                ${o.isCorrect
                                  ? 'border-green-500 bg-green-50'
                                  : 'border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50'
                                }`}>
                              {/* Radio button for correct answer */}
                              <input
                                type="radio"
                                name={`correct-${i}`}
                                checked={o.isCorrect}
                                onChange={() => setExtractedCorrect(i, j)}
                                className="w-4 h-4 accent-green-500 flex-shrink-0 cursor-pointer"
                              />
                              <span className={`font-black text-sm w-5 flex-shrink-0 ${o.isCorrect ? 'text-green-700' : 'text-slate-500'}`}>
                                {o.optionLabel}.
                              </span>
                              <span className={`flex-1 text-sm font-semibold ${o.isCorrect ? 'text-green-800' : 'text-slate-700'}`}>
                                {o.optionText}
                              </span>
                              {o.isCorrect && (
                                <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                                  ✅ Correct
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button onClick={saveExtracted} disabled={savingExtracted || !Object.values(extractedApproved).some(Boolean)}
                className="btn-primary flex-1">
                {savingExtracted ? 'Saving...' : `✅ Save ${Object.values(extractedApproved).filter(Boolean).length} Questions`}
              </button>
              <button onClick={() => setShowPdfExtract(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Image Bank Modal — assign diagram to a saved question */}
      <Modal open={showImageBank} onClose={() => { setShowImageBank(false); setImageBankTarget(null); }} title="🖼️ Assign Diagram Image" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Click an image to assign it to the selected question. These are diagram images extracted from your PDFs.
          </p>
          {imageBankImages.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">🖼️</div>
              <p className="font-bold text-slate-500">No images available</p>
              <p className="text-slate-400 text-sm mt-1">Extract a Maths or NVR paper PDF first — diagrams will appear here.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {imageBankImages.map((img, i) => (
                <div key={i} className="relative cursor-pointer group" onClick={() => assignImageToSavedQuestion(img.imageUrl)}>
                  <img src={`http://localhost:5000${img.imageUrl}`} alt={img.filename}
                    className="h-28 rounded-xl border-2 border-slate-200 bg-white object-contain group-hover:border-amber-400 group-hover:scale-105 transition-all" />
                  <div className="absolute inset-0 rounded-xl bg-amber-500/0 group-hover:bg-amber-500/10 transition-all flex items-end justify-center pb-1">
                    <span className="text-xs bg-black/60 text-white rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Assign</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button onClick={() => { setShowImageBank(false); setImageBankTarget(null); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Diagram Editor — full-screen overlay */}
      {showDiagramEditor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: '100%', maxWidth: 1040, height: '90vh', borderRadius: 12, overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
            <DiagramEditor
              questionId={diagramEditorTarget}
              onSave={handleDiagramSave}
              onClose={() => { setShowDiagramEditor(false); setDiagramEditorTarget(null); }}
            />
          </div>
        </div>
      )}

      {/* Single-question AI Answer Modal */}
      <Modal open={showSingleAi} onClose={() => setShowSingleAi(false)} title="🤖 Ask Claude for the Correct Answer" wide>
        {singleAiQuestion && (
          <div className="space-y-4">
            {/* Question preview */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-slate-400 mb-1">Question</p>
              <p className="font-semibold text-slate-800 text-sm">{singleAiQuestion.question_text}</p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                {singleAiQuestion.options.map(o => (
                  <div key={o.id} className={`text-xs px-2 py-1.5 rounded-lg ${o.isCorrect ? 'bg-green-50 text-green-700 font-bold' : 'bg-white border border-slate-200 text-slate-600'}`}>
                    <span className="font-bold mr-1">{o.optionLabel}.</span>{o.optionText}
                    {o.isCorrect && <span className="ml-1 text-green-500">✓</span>}
                  </div>
                ))}
              </div>
              {singleAiQuestion.options.some(o => o.isCorrect) && (
                <p className="mt-2 text-xs text-amber-600 font-semibold">⚠️ This question already has a correct answer marked. Applying a new one will replace it.</p>
              )}
            </div>

            {/* Step 1 — Copy prompt */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-violet-700">Step 1 — Copy this prompt</p>
              <div className="relative">
                <textarea
                  readOnly
                  value={singleAiPrompt}
                  rows={6}
                  className="w-full text-xs font-mono bg-white border border-violet-200 rounded-xl px-3 py-2 resize-none text-slate-700 focus:outline-none"
                />
                <button onClick={copySinglePrompt}
                  className={`absolute top-2 right-2 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${singleAiCopied ? 'bg-green-500 text-white' : 'bg-violet-100 hover:bg-violet-200 text-violet-700'}`}>
                  {singleAiCopied ? '✓ Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Step 2 — Go to Claude */}
            <div className="bg-violet-50 border border-violet-200 rounded-xl px-3 py-2.5 text-xs text-violet-700 font-semibold flex items-center gap-2">
              <span className="text-base">👆</span>
              <span>Step 2 — Open <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline font-black">claude.ai</a>, paste the prompt, send it, then copy Claude's reply.</span>
            </div>

            {/* Step 3 — Paste response */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-violet-700">Step 3 — Paste Claude's response here</p>
              <textarea
                value={singleAiResponse}
                onChange={e => { setSingleAiResponse(e.target.value); setSingleAiError(''); }}
                rows={2}
                placeholder={'Paste Claude\'s reply here, e.g.  {"correct":"B"}  or just  B'}
                className="w-full text-xs font-mono bg-white border border-violet-200 rounded-xl px-3 py-2 resize-none text-slate-700 focus:outline-none focus:border-violet-400"
              />
              {singleAiError && (
                <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{singleAiError}</p>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={applySingleAiAnswer}
                disabled={savingSingleAi || !singleAiResponse.trim()}
                className="btn-primary flex-1 !bg-violet-600 hover:!bg-violet-700 disabled:opacity-40">
                {savingSingleAi ? 'Saving...' : '✅ Apply & Save'}
              </button>
              <button onClick={() => setShowSingleAi(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Question Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="✏️ Edit Question" wide>
        {editingQuestion && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Question Text *</label>
              <textarea className="input" rows={3}
                value={editQForm.questionText}
                onChange={e => setEditQForm(f => ({ ...f, questionText: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Marks</label>
                <input className="input" type="number" min={1} max={10}
                  value={editQForm.marks}
                  onChange={e => setEditQForm(f => ({ ...f, marks: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Hint</label>
                <input className="input" value={editQForm.hint}
                  onChange={e => setEditQForm(f => ({ ...f, hint: e.target.value }))} placeholder="Optional" />
              </div>
              <div className="col-span-1">
                <label className="block text-sm font-bold text-slate-600 mb-1">Type</label>
                <div className={`input !cursor-default text-sm font-semibold ${editingQuestion.question_type === 'mcq' ? 'text-blue-700 bg-blue-50' : 'text-purple-700 bg-purple-50'}`}>
                  {editingQuestion.question_type === 'mcq' ? '🔵 Multiple Choice' : '🟣 Free Text'}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Explanation (shown after answer)</label>
              <textarea className="input" rows={2}
                value={editQForm.explanation}
                onChange={e => setEditQForm(f => ({ ...f, explanation: e.target.value }))}
                placeholder="Why is this the correct answer?" />
            </div>

            {/* MCQ correct answer selector */}
            {editingQuestion.question_type === 'mcq' && editingQuestion.options && editingQuestion.options.length > 0 && (
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">
                  Correct Answer <span className="text-slate-400 font-normal">(select the correct option)</span>
                </label>
                <div className="space-y-2">
                  {editingQuestion.options.map((o) => {
                    const isSelected = editQForm.correctOptionId === o.id;
                    return (
                      <label key={o.id}
                        className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 cursor-pointer transition-all
                          ${isSelected
                            ? 'border-green-500 bg-green-50'
                            : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50'
                          }`}>
                        <input
                          type="radio"
                          name="edit-correct-option"
                          checked={isSelected}
                          onChange={() => setEditQForm(f => ({ ...f, correctOptionId: o.id }))}
                          className="w-4 h-4 accent-green-500 flex-shrink-0 cursor-pointer"
                        />
                        <span className={`font-black text-sm w-5 flex-shrink-0 ${isSelected ? 'text-green-700' : 'text-slate-500'}`}>
                          {o.optionLabel}.
                        </span>
                        <span className={`flex-1 text-sm font-semibold ${isSelected ? 'text-green-800' : 'text-slate-700'}`}>
                          {o.optionText}
                        </span>
                        {isSelected && (
                          <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                            ✅ Correct
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
                {!editQForm.correctOptionId && (
                  <p className="text-xs text-amber-600 font-semibold mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    ⚠️ No correct answer selected — please pick one before saving
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={saveEditQuestion}
                disabled={savingEdit || !editQForm.questionText.trim() || (editingQuestion.question_type === 'mcq' && !editQForm.correctOptionId)}
                className="btn-primary flex-1">
                {savingEdit ? 'Saving...' : '💾 Save Changes'}
              </button>
              <button onClick={() => setShowEditModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* AI Generator Modal */}
      <Modal open={showAI} onClose={() => setShowAI(false)} title="🤖 AI Question Generator" wide>
        {!generated ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
              Describe the questions you want, copy the prompt into{' '}
              <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline font-bold">claude.ai</a>
              {' '}(your Claude subscription), then paste Claude's JSON reply back here. No API key needed.
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Your prompt *</label>
              <textarea className="input" rows={3} value={aiForm.prompt}
                onChange={e => setAiForm(f => ({ ...f, prompt: e.target.value }))}
                placeholder="e.g. Generate questions about fractions and percentages for year 6 pupils, including word problems" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Subject</label>
                <select className="input" value={aiForm.subjectId} onChange={e => setAiForm(f => ({ ...f, subjectId: e.target.value }))}>
                  <option value="">— Select subject —</option>
                  {ref.subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Exam Type</label>
                <select className="input" value={aiForm.examTypeId} onChange={e => setAiForm(f => ({ ...f, examTypeId: e.target.value }))}>
                  <option value="">— Select exam type —</option>
                  {ref.examTypes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Number of Questions</label>
                <input className="input" type="number" min={1} max={20} value={aiForm.numQuestions} onChange={e => setAiForm(f => ({ ...f, numQuestions: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">Difficulty</label>
                <select className="input" value={aiForm.difficulty} onChange={e => setAiForm(f => ({ ...f, difficulty: e.target.value }))}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <button onClick={buildGeneratePrompt} disabled={!aiForm.prompt.trim()} className="btn-primary w-full text-lg">
              📋 Build Prompt for Claude.ai
            </button>

            {/* Clipboard workflow panel */}
            {aiGenPrompt && (
              <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-4 space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-violet-700">Step 1 — Copy this prompt</p>
                  <div className="relative">
                    <textarea readOnly value={aiGenPrompt} rows={5}
                      className="w-full text-xs font-mono bg-white border border-violet-200 rounded-xl px-3 py-2 resize-none text-slate-700 focus:outline-none" />
                    <button onClick={copyGenPrompt}
                      className={`absolute top-2 right-2 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${aiGenCopied ? 'bg-green-500 text-white' : 'bg-violet-100 hover:bg-violet-200 text-violet-700'}`}>
                      {aiGenCopied ? '✓ Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-violet-200 rounded-xl px-3 py-2.5 text-xs text-violet-700 font-semibold flex items-center gap-2">
                  <span className="text-base">👆</span>
                  <span>Step 2 — Open <a href="https://claude.ai" target="_blank" rel="noreferrer" className="underline font-black">claude.ai</a>, paste the prompt, and send it. Copy Claude's JSON reply.</span>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-violet-700">Step 3 — Paste Claude's response here</p>
                  <textarea value={aiGenResponse}
                    onChange={e => { setAiGenResponse(e.target.value); setAiGenError(''); }}
                    rows={4}
                    placeholder={'Paste the JSON response from Claude here, e.g.\n{"questions":[{"questionText":"...","questionType":"mcq",...}]}'}
                    className="w-full text-xs font-mono bg-white border border-violet-200 rounded-xl px-3 py-2 resize-none text-slate-700 focus:outline-none focus:border-violet-400" />
                  {aiGenError && (
                    <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">{aiGenError}</p>
                  )}
                  <button onClick={applyGenResponse} disabled={!aiGenResponse.trim()}
                    className="btn-primary w-full !bg-violet-600 hover:!bg-violet-700 disabled:opacity-40">
                    ✅ Review Questions
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-700">{generated.questions.length} questions generated — tick the ones to save:</p>
              <button onClick={() => setGenerated(null)} className="text-sm text-brand-600 hover:underline">← Regenerate</button>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {generated.questions.map((q, i) => (
                <div key={i} className={`card border-2 transition-colors cursor-pointer ${approved[i] ? 'border-green-300 bg-green-50' : 'border-slate-200'}`}
                  onClick={() => setApproved(a => ({ ...a, [i]: !a[i] }))}>
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded flex-shrink-0 mt-0.5 flex items-center justify-center font-bold text-sm ${approved[i] ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {approved[i] ? '✓' : ''}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge label={q.questionType === 'mcq' ? 'MCQ' : 'Free Text'} colour={q.questionType === 'mcq' ? 'blue' : 'purple'} />
                        <Badge label={`${q.marks || 1} mark`} colour="slate" />
                      </div>
                      <p className="font-semibold text-slate-800 text-sm">{q.questionText}</p>
                      {q.options && (
                        <div className="mt-2 space-y-1">
                          {q.options.map((o, j) => (
                            <div key={j} className={`text-xs px-2 py-1 rounded ${o.isCorrect ? 'bg-green-100 text-green-700 font-bold' : 'text-slate-500'}`}>
                              {o.optionLabel}. {o.optionText}
                            </div>
                          ))}
                        </div>
                      )}
                      {q.explanation && <p className="mt-1 text-xs text-slate-400 italic">💡 {q.explanation}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={approveGenerated} disabled={approving || !Object.values(approved).some(Boolean)} className="btn-primary flex-1">
                {approving ? 'Saving...' : `✅ Save ${Object.values(approved).filter(Boolean).length} Questions to Paper`}
              </button>
              <button onClick={() => setShowAI(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
