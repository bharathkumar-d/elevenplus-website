import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/client';

function useTimer(limitMins, onExpire) {
  const [secondsLeft, setSecondsLeft] = useState(limitMins ? limitMins * 60 : null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!limitMins) return;
    const tick = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startRef.current) / 1000);
      const remaining = limitMins * 60 - elapsed;
      if (remaining <= 0) { clearInterval(tick); onExpire(); setSecondsLeft(0); }
      else setSecondsLeft(remaining);
    }, 1000);
    return () => clearInterval(tick);
  }, [limitMins, onExpire]);

  if (secondsLeft === null) return null;
  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return { display: `${m}:${s.toString().padStart(2, '0')}`, urgent: secondsLeft < 120, secondsLeft };
}

// Passage bottom-drawer component
function PassageDrawer({ passage, open, onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-30 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      {/* Drawer */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '60vh' }}>
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h3 className="font-black text-slate-800 text-base">{passage?.title || 'Reading Passage'}</h3>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-lg transition-colors">
            ✕
          </button>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: 'calc(60vh - 80px)' }}>
          <p className="text-slate-700 text-base leading-relaxed whitespace-pre-wrap font-medium">
            {passage?.content}
          </p>
        </div>
      </div>
    </>
  );
}

export default function StudentTest() {
  const { paperId } = useParams();
  const navigate = useNavigate();

  const [paper, setPaper] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [passages, setPassages] = useState({}); // id → passage
  const [attemptId, setAttemptId] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> { selectedOptionId?, freeText? }
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [startTime] = useState(Date.now());
  const [passageOpen, setPassageOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleExpire = useCallback(() => handleSubmit(true), []);
  const timer = useTimer(paper?.time_limit_mins, handleExpire);

  useEffect(() => {
    const init = async () => {
      const [pRes, qRes, passRes] = await Promise.all([
        api.get(`/papers/${paperId}`),
        api.get(`/questions?paperId=${paperId}`),
        api.get(`/passages?paperId=${paperId}`),
      ]);
      setPaper(pRes.data);
      setQuestions(qRes.data);
      // Build passage lookup map
      const map = {};
      (passRes.data || []).forEach(p => { map[p.id] = p; });
      setPassages(map);

      const { data } = await api.post('/attempts/start', { paperId });
      setAttemptId(data.attemptId);
      setLoading(false);
    };
    init();
  }, [paperId]);

  // Close passage drawer when navigating to a different question
  useEffect(() => { setPassageOpen(false); }, [current]);

  const saveAnswer = useCallback(async (questionId, selectedOptionId, freeTextAnswer) => {
    setAnswers(a => ({ ...a, [questionId]: { selectedOptionId, freeTextAnswer } }));
    if (attemptId) {
      await api.post(`/attempts/${attemptId}/answer`, { questionId, selectedOptionId, freeTextAnswer }).catch(() => {});
    }
  }, [attemptId]);

  async function handleSubmit(timedOut = false) {
    if (submitting || submitted) return;
    if (!timedOut) { setConfirmOpen(true); return; }
    await doSubmit();
  }

  async function doSubmit() {
    if (submitting || submitted) return;
    setConfirmOpen(false);
    setSubmitting(true);
    const timeTakenSecs = Math.floor((Date.now() - startTime) / 1000);
    await api.post(`/attempts/${attemptId}/submit`, { timeTakenSecs });
    setSubmitted(true);
    navigate(`/results/${attemptId}`);
  }

  // Jump to the first question that has no answer yet
  function goToFirstUnanswered() {
    const idx = questions.findIndex(q => {
      const a = answers[q.id] || {};
      return !a.selectedOptionId && !(a.freeTextAnswer && a.freeTextAnswer.trim());
    });
    setConfirmOpen(false);
    if (idx >= 0) setCurrent(idx);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50">
      <div className="text-center"><div className="text-5xl mb-4 animate-bounce">📖</div><p className="text-xl font-bold text-slate-600">Loading your paper...</p></div>
    </div>
  );

  if (!questions.length) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50">
      <div className="card text-center max-w-sm">
        <div className="text-5xl mb-3">🚧</div>
        <h2 className="text-xl font-bold text-slate-700">No questions yet!</h2>
        <p className="text-slate-500 mt-2">This paper doesn't have any questions added yet.</p>
        <button onClick={() => navigate(-1)} className="btn-primary mt-4 w-full">Go back</button>
      </div>
    </div>
  );

  const q = questions[current];
  const answer = answers[q.id] || {};
  const answeredCount = questions.filter(q => {
    const a = answers[q.id] || {};
    return a.selectedOptionId || (a.freeTextAnswer && a.freeTextAnswer.trim());
  }).length;

  // Passage for the current question (if any)
  const currentPassage = q.passage_id ? passages[q.passage_id] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex flex-col">
      {/* Top bar */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex-1 min-w-0 mr-3">
          <h1 className="font-black text-brand-700 text-base leading-tight truncate">{paper?.title}</h1>
          <p className="text-xs text-slate-500">{answeredCount}/{questions.length} answered</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {timer && (
            <div className={`font-black text-base px-2 py-1 rounded-xl ${timer.urgent ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-700'}`}>
              ⏱ {timer.display}
            </div>
          )}
          <button onClick={() => handleSubmit(false)} disabled={submitting}
            className="btn-primary text-sm py-2 px-3">
            {submitting ? '...' : 'Submit ✅'}
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="h-2 bg-slate-100">
        <div className="h-full bg-brand-500 transition-all duration-300" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
      </div>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-6">
        {/* Question counter */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-500">Question {current + 1} of {questions.length}</span>
          <div className="flex items-center gap-2">
            {currentPassage && (
              <button onClick={() => setPassageOpen(true)}
                className="flex items-center gap-1.5 text-sm font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl px-3 py-1.5 transition-colors">
                📖 Read Passage
              </button>
            )}
            <span className="text-sm font-semibold text-slate-400">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Question card */}
        <div className="card border-2 border-slate-100 space-y-6">
          {/* Diagram image */}
          {q.image_url && (
            <div className="rounded-2xl overflow-hidden bg-slate-50 border border-slate-200">
              <img
                src={`http://localhost:5000${q.image_url}`}
                alt="Diagram"
                className="w-full max-h-64 object-contain"
              />
            </div>
          )}

          <p className="text-xl font-bold text-slate-800 leading-relaxed">{q.question_text}</p>

          {q.hint && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-2 text-sm text-yellow-700 font-semibold">
              💡 Hint: {q.hint}
            </div>
          )}

          {/* MCQ options */}
          {q.question_type === 'mcq' && q.options && (
            <div className="space-y-3">
              {q.options.map(o => {
                const selected = answer.selectedOptionId === o.id;
                return (
                  <button key={o.id} onClick={() => saveAnswer(q.id, o.id, null)}
                    className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-semibold text-lg transition-all active:scale-[0.98] ${
                      selected
                        ? 'bg-brand-600 border-brand-600 text-white shadow-lg'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50'
                    }`}>
                    <span className={`inline-block w-8 h-8 rounded-full text-center leading-8 font-black mr-3 text-sm ${selected ? 'bg-white/20' : 'bg-slate-100'}`}>
                      {o.optionLabel}
                    </span>
                    {o.optionText}
                  </button>
                );
              })}
            </div>
          )}

          {/* Free text */}
          {q.question_type === 'free_text' && (
            <div>
              <label className="block text-sm font-bold text-slate-500 mb-2">Your answer:</label>
              <textarea
                rows={5}
                className="input text-lg"
                placeholder="Write your answer here..."
                value={answer.freeTextAnswer || ''}
                onChange={e => saveAnswer(q.id, null, e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
            className="btn-secondary flex-1 disabled:opacity-40">
            ← Previous
          </button>
          {current < questions.length - 1 ? (
            <button onClick={() => setCurrent(c => Math.min(questions.length - 1, c + 1))}
              className="btn-primary flex-1">
              Next →
            </button>
          ) : (
            <button onClick={() => handleSubmit(false)} disabled={submitting}
              className="btn-primary flex-1 bg-green-600 hover:bg-green-700">
              {submitting ? 'Submitting...' : '🎉 Finish & Submit'}
            </button>
          )}
        </div>

        {/* Question dots navigation */}
        <div className="flex flex-wrap gap-2 justify-center">
          {questions.map((q, i) => {
            const a = answers[q.id] || {};
            const done = a.selectedOptionId || (a.freeTextAnswer && a.freeTextAnswer.trim());
            return (
              <button key={i} onClick={() => setCurrent(i)}
                className={`w-9 h-9 rounded-full font-bold text-sm transition-all ${
                  i === current ? 'bg-brand-600 text-white scale-110 shadow-md'
                  : done ? 'bg-green-400 text-white'
                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                }`}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </main>

      {/* Passage bottom drawer */}
      <PassageDrawer passage={currentPassage} open={passageOpen} onClose={() => setPassageOpen(false)} />

      {/* Friendly submit confirmation */}
      {confirmOpen && (() => {
        const unanswered = questions.length - answeredCount;
        const allDone = unanswered === 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} />
            <div className="relative bg-white rounded-3xl shadow-2xl p-6 max-w-sm w-full text-center space-y-4">
              <div className="text-5xl">{allDone ? '🎉' : '🤔'}</div>
              {allDone ? (
                <>
                  <h2 className="text-xl font-black text-slate-800">All {questions.length} questions answered!</h2>
                  <p className="text-slate-500">Amazing work! Ready to see your score?</p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-black text-slate-800">
                    You still have <span className="text-orange-500">{unanswered} question{unanswered > 1 ? 's' : ''}</span> left!
                  </h2>
                  <p className="text-slate-500">Once you submit, you can't change your answers.</p>
                </>
              )}
              <div className="space-y-2 pt-1">
                {!allDone && (
                  <button onClick={goToFirstUnanswered} className="btn-primary w-full">
                    💪 Show Me What I Missed
                  </button>
                )}
                <button onClick={doSubmit} disabled={submitting}
                  className={`w-full font-bold py-3 px-4 rounded-2xl transition-all active:scale-95 ${
                    allDone ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}>
                  {submitting ? 'Submitting...' : allDone ? '🚀 Submit My Answers!' : 'Submit Anyway'}
                </button>
                <button onClick={() => setConfirmOpen(false)} className="w-full text-sm font-semibold text-slate-400 hover:text-slate-600 py-1">
                  ← Back to the test
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
