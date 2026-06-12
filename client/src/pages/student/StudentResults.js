import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { API_BASE } from '../../api/client';

const GRADE_COLOURS = {
  'A+': 'text-green-600', A: 'text-green-500', B: 'text-blue-500',
  C: 'text-yellow-500', D: 'text-orange-500', F: 'text-red-500',
};

function grade(pct) {
  if (pct >= 90) return 'A+';
  if (pct >= 75) return 'A';
  if (pct >= 60) return 'B';
  if (pct >= 45) return 'C';
  if (pct >= 30) return 'D';
  return 'F';
}

const CONFETTI_COLOURS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'];

function Confetti({ count = 50 }) {
  // Generate pieces once so they don't re-randomise on re-render
  const [pieces] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2,
      colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    }))
  );
  return (
    <>
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece" style={{
          left: `${p.left}%`,
          backgroundColor: p.colour,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.duration}s`,
        }} />
      ))}
    </>
  );
}

function ScoreRing({ pct }) {
  const r = 54, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#6366f1" strokeWidth="12"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        transform="rotate(-90 70 70)" />
      <text x="70" y="68" textAnchor="middle" dominantBaseline="middle"
        className="font-black" style={{ fontSize: 28, fill: '#1e293b', fontWeight: 900 }}>
        {Math.round(pct)}%
      </text>
      <text x="70" y="92" textAnchor="middle" style={{ fontSize: 13, fill: '#64748b' }}>score</text>
    </svg>
  );
}

export default function StudentResults() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/attempts/${attemptId}/results`).then(r => { setData(r.data); setLoading(false); });
  }, [attemptId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50">
      <div className="text-center"><div className="text-5xl mb-4 animate-spin">⭐</div><p className="text-xl font-bold text-slate-600">Calculating results...</p></div>
    </div>
  );

  const { attempt, answers } = data;
  const isAnswered = a => !!(a.selected_option_id || (a.free_text_answer && a.free_text_answer.trim()));
  const maxPossible = answers.reduce((s, a) => s + (a.marks || 0), 0);
  const autoScore = attempt.auto_score || 0;
  const totalScore = attempt.total_score != null ? attempt.total_score : autoScore;
  const pendingMarking = answers.some(a => a.question_type === 'free_text' && isAnswered(a) && a.awarded_marks == null);
  const skippedCount = answers.filter(a => !isAnswered(a)).length;
  const pct = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;
  const g = grade(pct);
  const timeMins = attempt.time_taken_secs ? Math.floor(attempt.time_taken_secs / 60) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white">
      {pct >= 75 && <Confetti />}
      <header className="bg-white shadow-sm px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/papers')} className="text-brand-600 hover:text-brand-800 font-bold text-lg">← Papers</button>
        <h1 className="text-2xl font-black text-brand-700">Your Results 🎉</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Score card */}
        <div className="card border-2 border-brand-100 bg-gradient-to-br from-white to-brand-50 flex flex-col items-center gap-4 py-8">
          <ScoreRing pct={pct} />
          <div className="text-center">
            <div className={`text-4xl sm:text-6xl font-black ${GRADE_COLOURS[g] || 'text-slate-700'}`}>{g}</div>
            <p className="text-slate-600 font-bold mt-1">
              {totalScore} / {maxPossible} marks
            </p>
            {timeMins && <p className="text-sm text-slate-400 mt-1">⏱ Completed in {timeMins} min{timeMins !== 1 ? 's' : ''}</p>}
          </div>
          {pendingMarking && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-700 font-semibold text-center max-w-sm">
              ⏳ Some written answers are waiting for your teacher to mark them. Your score may increase!
            </div>
          )}
          {skippedCount > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 font-semibold text-center max-w-sm">
              ➖ You skipped {skippedCount} question{skippedCount > 1 ? 's' : ''} — try answering every question next time, even a guess is worth a go!
            </div>
          )}
          {pct >= 75 && <div className="text-4xl animate-bounce">🌟</div>}
          {pct < 75 && pct >= 50 && <div className="text-4xl">💪</div>}
          {pct < 50 && <div className="text-4xl">📚</div>}
          <p className="text-lg font-bold text-slate-600">
            {pct >= 90 ? "Outstanding! You're a star! ⭐" :
             pct >= 75 ? "Excellent work! Keep it up! 🚀" :
             pct >= 60 ? "Good job! A bit more practice will help 👍" :
             pct >= 50 ? "Not bad! Keep practising! 💪" :
             "Keep trying — you'll get there! 📚"}
          </p>
        </div>

        {/* Per-question review */}
        <h2 className="text-xl font-black text-slate-700">Question Review</h2>
        <div className="space-y-4">
          {answers.map((a, i) => {
            const isMcq = a.question_type === 'mcq';
            const answered = isAnswered(a);
            const skipped = !answered;
            const correct = isMcq && answered && a.is_correct;
            const wrong = isMcq && answered && !a.is_correct;
            const pending = !isMcq && answered && a.awarded_marks == null;
            const marked = !isMcq && answered && a.awarded_marks != null;

            return (
              <div key={a.id || a.question_id} className={`card border-2 ${
                correct ? 'border-green-200 bg-green-50'
                : wrong ? 'border-red-100 bg-red-50'
                : pending ? 'border-yellow-100 bg-yellow-50'
                : skipped ? 'border-slate-200 bg-slate-50'
                : 'border-slate-100 bg-white'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-bold text-slate-500 text-xs mb-1">Question {i + 1}</p>
                    {a.image_url && (
                      <img src={`${API_BASE}${a.image_url}`} alt="diagram"
                        className="mb-2 max-h-32 rounded-xl border border-slate-200 bg-white object-contain" />
                    )}
                    <p className="font-bold text-slate-800">{a.question_text}</p>
                  </div>
                  <span className="text-2xl flex-shrink-0">
                    {correct ? '✅' : wrong ? '❌' : pending ? '⏳' : skipped ? '➖' : '✍️'}
                  </span>
                </div>

                {skipped && (
                  <div className="mt-3 space-y-1 text-sm">
                    <p className="text-slate-500 font-semibold">➖ You didn't answer this one</p>
                    {isMcq && a.all_options && (() => {
                      const correctOpt = a.all_options.find(o => o.isCorrect);
                      return correctOpt ? (
                        <p className="text-green-700 font-semibold">Correct answer: {correctOpt.label}. {correctOpt.text}</p>
                      ) : null;
                    })()}
                  </div>
                )}

                {!skipped && isMcq && (
                  <div className="mt-3 space-y-1 text-sm">
                    {a.selected_option_label && (
                      <p className={`font-semibold ${correct ? 'text-green-700' : 'text-red-600'}`}>
                        Your answer: {a.selected_option_label}. {a.selected_option_text}
                      </p>
                    )}
                    {wrong && a.all_options && (() => {
                      const correctOpt = a.all_options.find(o => o.isCorrect);
                      return correctOpt ? (
                        <p className="text-green-700 font-semibold">Correct answer: {correctOpt.label}. {correctOpt.text}</p>
                      ) : null;
                    })()}
                  </div>
                )}

                {!skipped && !isMcq && (
                  <div className="mt-3 space-y-2 text-sm">
                    {a.free_text_answer && (
                      <div className="bg-white rounded-xl p-3 border border-slate-200">
                        <p className="text-xs font-bold text-slate-400 mb-1">Your answer:</p>
                        <p className="text-slate-700">{a.free_text_answer}</p>
                      </div>
                    )}
                    {pending && <p className="text-yellow-700 font-semibold">⏳ Waiting for teacher to mark</p>}
                    {marked && (
                      <p className="text-slate-700 font-semibold">
                        Marks: {a.awarded_marks} / {a.marks}
                        {a.admin_feedback && <span className="text-slate-500 font-normal ml-2">— {a.admin_feedback}</span>}
                      </p>
                    )}
                  </div>
                )}

                {a.explanation && (
                  <div className="mt-3 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-sm text-blue-700">
                    💡 <span className="font-semibold">Explanation:</span> {a.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 pb-8">
          <button onClick={() => navigate('/papers')} className="btn-secondary flex-1">Browse More Papers</button>
          <button onClick={() => navigate('/home')} className="btn-primary flex-1">🏠 Home</button>
        </div>
      </main>
    </div>
  );
}
