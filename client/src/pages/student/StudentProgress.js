import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

function pct(score, max) {
  if (!max || max === 0) return null;
  return Math.round((score / max) * 100);
}

function gradeColour(p) {
  if (p == null) return 'text-slate-400';
  if (p >= 80) return 'text-green-600';
  if (p >= 60) return 'text-blue-600';
  if (p >= 45) return 'text-yellow-600';
  return 'text-red-500';
}

function BarFill({ value, max = 100, colour = 'bg-brand-500' }) {
  return (
    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${colour} rounded-full transition-all duration-700`}
        style={{ width: `${Math.min(100, value || 0)}%` }} />
    </div>
  );
}

const SUBJECT_COLOURS = {
  maths: 'bg-blue-500', english: 'bg-green-500',
  'verbal-reasoning': 'bg-purple-500', 'non-verbal-reasoning': 'bg-orange-500',
};

export default function StudentProgress() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/student/progress').then(r => { setData(r.data); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50">
      <div className="text-center">
        <div className="text-5xl mb-4 animate-spin">📊</div>
        <p className="text-xl font-bold text-slate-600">Loading your progress...</p>
      </div>
    </div>
  );

  const { attempts, subjectStats, overall } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white">
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/home')} className="text-brand-600 hover:text-brand-800 font-bold text-lg">← Home</button>
        <h1 className="text-2xl font-black text-brand-700">My Progress 📊</h1>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Overall stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Papers Done', value: overall.totalAttempts, icon: '📝', colour: 'text-brand-600' },
            { label: 'Avg Score',   value: overall.avgScore != null ? `${overall.avgScore}%` : '—', icon: '🎯', colour: gradeColour(overall.avgScore) },
            { label: 'Best Score',  value: overall.bestScore != null ? `${overall.bestScore}%` : '—', icon: '🏆', colour: 'text-yellow-500' },
            { label: 'Active Days', value: overall.activeDays, icon: '🔥', colour: 'text-orange-500' },
          ].map(stat => (
            <div key={stat.label} className="card border-2 border-slate-100 text-center">
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className={`text-2xl font-black ${stat.colour}`}>{stat.value}</div>
              <div className="text-xs font-bold text-slate-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Subject breakdown */}
        {subjectStats.length > 0 && (
          <section>
            <h2 className="text-xl font-black text-slate-700 mb-4">📚 Subject Breakdown</h2>
            <div className="card border-2 border-slate-100 space-y-5">
              {subjectStats.map(s => (
                <div key={s.slug}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-700">{s.icon} {s.name}</span>
                    <div className="text-right">
                      <span className={`font-black text-lg ${gradeColour(parseFloat(s.avg_pct))}`}>
                        {s.avg_pct != null ? `${s.avg_pct}%` : '—'}
                      </span>
                      <span className="text-xs text-slate-400 ml-2">{s.attempts} attempt{s.attempts !== '1' ? 's' : ''}</span>
                    </div>
                  </div>
                  <BarFill value={parseFloat(s.avg_pct)} colour={SUBJECT_COLOURS[s.slug] || 'bg-brand-500'} />
                  {s.avg_pct != null && parseFloat(s.avg_pct) < 60 && (
                    <p className="text-xs text-orange-600 font-semibold mt-1">💪 Needs more practice</p>
                  )}
                  {s.avg_pct != null && parseFloat(s.avg_pct) >= 80 && (
                    <p className="text-xs text-green-600 font-semibold mt-1">🌟 Excellent work!</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Attempt history */}
        <section>
          <h2 className="text-xl font-black text-slate-700 mb-4">📋 All Attempts</h2>
          {attempts.length === 0 ? (
            <div className="card border-2 border-dashed border-slate-200 text-center py-12">
              <div className="text-5xl mb-3">📭</div>
              <p className="font-bold text-slate-500 text-lg">No attempts yet!</p>
              <p className="text-slate-400 mt-1">Complete a practice paper to see your history here.</p>
              <button onClick={() => navigate('/papers')} className="btn-primary mt-4 mx-auto">Browse Papers 📚</button>
            </div>
          ) : (
            <div className="space-y-3">
              {attempts.map(a => {
                const p = pct(a.total_score, a.max_score);
                const timeMins = a.time_taken_secs ? Math.floor(a.time_taken_secs / 60) : null;
                return (
                  <button key={a.id} onClick={() => navigate(`/results/${a.id}`)}
                    className="card border-2 border-slate-100 w-full text-left flex items-center gap-4 hover:border-brand-200 hover:shadow-md transition-all">
                    <span className="text-3xl flex-shrink-0">{a.subject_icon || '📄'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{a.paper_title}</p>
                      <p className="text-sm text-slate-500">
                        {a.subject_name && <span>{a.subject_name} · </span>}
                        {a.exam_type_name && <span>{a.exam_type_name} · </span>}
                        {a.submitted_at && new Date(a.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {timeMins && <span> · ⏱ {timeMins}m</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {p != null ? (
                        <>
                          <span className={`font-black text-2xl ${gradeColour(p)}`}>{p}%</span>
                          <p className="text-xs text-slate-400">{a.total_score}/{a.max_score} marks</p>
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-yellow-600">Pending mark</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <div className="pb-8">
          <button onClick={() => navigate('/papers')} className="btn-primary w-full">
            Practice More Papers 🚀
          </button>
        </div>
      </main>
    </div>
  );
}
