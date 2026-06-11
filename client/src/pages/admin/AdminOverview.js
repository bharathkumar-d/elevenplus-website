import React, { useEffect, useState } from 'react';
import api from '../../api/client';

const STAT_CARDS = [
  { key: 'publishedPapers', label: 'Published Papers', icon: '📄', color: 'bg-blue-50 border-blue-200' },
  { key: 'totalQuestions',  label: 'Total Questions',  icon: '❓', color: 'bg-green-50 border-green-200' },
  { key: 'totalStudents',   label: 'Students',         icon: '👦', color: 'bg-purple-50 border-purple-200' },
  { key: 'pendingMarking',  label: 'Awaiting Marking', icon: '✅', color: 'bg-orange-50 border-orange-200' },
];

export default function AdminOverview() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/admin/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Welcome to the 11+ admin panel</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STAT_CARDS.map(s => (
          <div key={s.key} className={`card border-2 ${s.color}`}>
            <div className="text-3xl mb-2">{s.icon}</div>
            <div className="text-3xl font-black text-slate-800">
              {stats ? stats[s.key] : '—'}
            </div>
            <div className="text-sm font-semibold text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-xl font-bold text-slate-700 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <button className="btn-primary flex items-center gap-2 justify-center">
            <span>➕</span> New Paper
          </button>
          <button className="btn-secondary flex items-center gap-2 justify-center">
            <span>🤖</span> Generate Questions
          </button>
        </div>
      </div>

      {/* Getting started checklist */}
      <div className="card border-2 border-dashed border-slate-200 max-w-lg">
        <h3 className="font-bold text-slate-700 mb-3">Getting Started</h3>
        <ul className="space-y-2 text-sm text-slate-600">
          {[
            'Create a paper (choose subject, exam type, school)',
            'Add questions manually or use AI generator',
            'Upload a PDF version of the paper',
            'Publish — students can now attempt it',
            'Mark any free-text answers from the Marking Queue',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-brand-500 font-bold">{i + 1}.</span> {step}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
