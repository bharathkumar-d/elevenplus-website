import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';

const SUBJECTS = [
  { name: 'Maths',                icon: '🔢', slug: 'maths',               color: 'bg-blue-100 border-blue-300 hover:bg-blue-200' },
  { name: 'English',              icon: '📖', slug: 'english',             color: 'bg-green-100 border-green-300 hover:bg-green-200' },
  { name: 'Verbal Reasoning',     icon: '💬', slug: 'verbal-reasoning',    color: 'bg-purple-100 border-purple-300 hover:bg-purple-200' },
  { name: 'Non-Verbal Reasoning', icon: '🔷', slug: 'non-verbal-reasoning',color: 'bg-orange-100 border-orange-300 hover:bg-orange-200' },
];

function gradeColour(p) {
  if (p == null) return 'text-slate-400';
  if (p >= 80) return 'text-green-600';
  if (p >= 60) return 'text-blue-500';
  if (p >= 45) return 'text-yellow-500';
  return 'text-red-500';
}

export default function StudentHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [recentAttempts, setRecentAttempts] = useState([]);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    api.get('/student/profile').then(r => setProfile(r.data)).catch(() => {});
    api.get('/attempts/my').then(r => setRecentAttempts(r.data.slice(0, 3))).catch(() => {});
    api.get('/student/progress').then(r => setProgress(r.data)).catch(() => {});
  }, []);

  const avatar = profile?.avatar_emoji || '⭐';
  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const overall = progress?.overall;

  // Find weakest subject for a tip
  const weakest = progress?.subjectStats?.length
    ? [...progress.subjectStats].sort((a, b) => parseFloat(a.avg_pct) - parseFloat(b.avg_pct))[0]
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white">
      {/* Top bar */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{avatar}</span>
          <div>
            <h1 className="text-xl font-black text-brand-700">11+ Prep</h1>
            {profile?.school_name && (
              <p className="text-xs text-slate-400 font-semibold">🏫 {profile.school_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/progress')}
            className="text-sm font-bold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-xl transition-all">
            📊 My Progress
          </button>
          <button onClick={logout} className="text-sm text-slate-400 hover:text-slate-600 font-medium">
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Welcome + stats row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-800">Hi {firstName}! 👋</h2>
            <p className="text-slate-500 mt-1">What do you want to practise today?</p>
          </div>

          {/* Mini stat chips */}
          {overall && overall.totalAttempts > 0 && (
            <div className="flex gap-3 flex-wrap">
              <div className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-2 text-center shadow-sm">
                <div className="text-2xl font-black text-brand-600">{overall.totalAttempts}</div>
                <div className="text-xs text-slate-400 font-bold">Papers done</div>
              </div>
              {overall.avgScore != null && (
                <div className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-2 text-center shadow-sm">
                  <div className={`text-2xl font-black ${gradeColour(overall.avgScore)}`}>{overall.avgScore}%</div>
                  <div className="text-xs text-slate-400 font-bold">Avg score</div>
                </div>
              )}
              {overall.activeDays > 0 && (
                <div className="bg-white border-2 border-slate-100 rounded-2xl px-4 py-2 text-center shadow-sm">
                  <div className="text-2xl font-black text-orange-500">🔥 {overall.activeDays}</div>
                  <div className="text-xs text-slate-400 font-bold">Active days</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tip banner — only if they have data */}
        {weakest && parseFloat(weakest.avg_pct) < 65 && (
          <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-5 py-3 flex items-center gap-3">
            <span className="text-2xl">💡</span>
            <p className="font-bold text-yellow-800">
              Try practising more <span className="text-yellow-600">{weakest.icon} {weakest.name}</span> — your average is {weakest.avg_pct}% and there's room to improve!
            </p>
          </div>
        )}

        {/* Subjects */}
        <section>
          <h3 className="text-xl font-bold text-slate-700 mb-4">📚 Practise by Subject</h3>
          <div className="grid grid-cols-2 gap-4">
            {SUBJECTS.map(s => {
              const stat = progress?.subjectStats?.find(st => st.slug === s.slug);
              return (
                <button key={s.slug}
                  onClick={() => navigate(`/papers?subject=${s.slug}`)}
                  className={`card border-2 ${s.color} flex items-center gap-4 text-left transition-all duration-150 active:scale-95`}>
                  <span className="text-4xl">{s.icon}</span>
                  <div className="flex-1">
                    <span className="text-xl font-bold text-slate-700">{s.name}</span>
                    {stat && (
                      <p className={`text-sm font-bold mt-0.5 ${gradeColour(parseFloat(stat.avg_pct))}`}>
                        Avg: {stat.avg_pct}%
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Personalised quick links */}
        {(profile?.exam_type_slug || profile?.school_slug) && (
          <section>
            <h3 className="text-xl font-bold text-slate-700 mb-4">🎯 Your Exam Papers</h3>
            <div className="flex flex-wrap gap-3">
              {profile.exam_type_slug && (
                <button onClick={() => navigate(`/papers?examType=${profile.exam_type_slug}`)}
                  className="btn-primary px-6">
                  {profile.exam_type_name} Papers →
                </button>
              )}
              {profile.school_slug && (
                <button onClick={() => navigate(`/papers?school=${profile.school_slug}`)}
                  className="btn-secondary px-6">
                  🏫 {profile.school_name?.split(' ').slice(0, 2).join(' ')} Papers →
                </button>
              )}
              <button onClick={() => navigate('/papers')} className="btn-secondary px-6">
                All Papers
              </button>
            </div>
          </section>
        )}

        {/* Recent results */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-slate-700">📋 Recent Results</h3>
            {recentAttempts.length > 0 && (
              <button onClick={() => navigate('/progress')} className="text-sm font-semibold text-brand-600 hover:underline">
                View all →
              </button>
            )}
          </div>

          {recentAttempts.length === 0 ? (
            <div className="card border-2 border-dashed border-slate-200 text-center py-8 text-slate-400">
              <div className="text-4xl mb-2">📋</div>
              <p className="font-semibold">No attempts yet — start a practice paper!</p>
              <button onClick={() => navigate('/papers')} className="btn-primary mt-4 mx-auto">Browse Papers 📚</button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAttempts.map(a => {
                const p = a.max_score > 0 ? Math.round((a.auto_score / a.max_score) * 100) : null;
                return (
                  <button key={a.id} onClick={() => navigate(`/results/${a.id}`)}
                    className="card border-2 border-slate-100 w-full text-left flex items-center gap-4 hover:border-brand-200 transition-all">
                    <span className="text-3xl">{a.subject_icon || '📝'}</span>
                    <div className="flex-1">
                      <p className="font-bold text-slate-800">{a.paper_title}</p>
                      <p className="text-sm text-slate-500">
                        {a.subject_name && `${a.subject_name} · `}
                        {new Date(a.submitted_at || a.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="text-right">
                      {p != null ? (
                        <span className={`font-black text-xl ${gradeColour(p)}`}>{p}%</span>
                      ) : (
                        <span className="text-sm font-semibold text-yellow-600">In progress</span>
                      )}
                    </div>
                  </button>
                );
              })}
              <button onClick={() => navigate('/papers')} className="btn-primary w-full mt-2">
                Practice More 🚀
              </button>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
