import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/client';

const SUBJECT_COLOURS = {
  'maths':               { bg: 'bg-blue-50',   border: 'border-blue-200',   btn: 'bg-blue-500 hover:bg-blue-600' },
  'english':             { bg: 'bg-green-50',  border: 'border-green-200',  btn: 'bg-green-500 hover:bg-green-600' },
  'verbal-reasoning':    { bg: 'bg-purple-50', border: 'border-purple-200', btn: 'bg-purple-500 hover:bg-purple-600' },
  'non-verbal-reasoning':{ bg: 'bg-orange-50', border: 'border-orange-200', btn: 'bg-orange-500 hover:bg-orange-600' },
};

const TYPE_LABELS = { full_paper: 'Full Paper 📋', worksheet: 'Worksheet 📝', mini_test: 'Mini Test ⚡' };
const TYPE_COLOURS = { full_paper: 'bg-blue-100 text-blue-700', worksheet: 'bg-purple-100 text-purple-700', mini_test: 'bg-orange-100 text-orange-700' };

export default function StudentPapers() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    subject: searchParams.get('subject') || '',
    examType: searchParams.get('examType') || '',
    school: searchParams.get('school') || '',
  });
  const [ref, setRef] = useState({ subjects: [], examTypes: [], schools: [] });

  useEffect(() => {
    api.get('/reference').then(r => setRef(r.data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.subject) params.set('subject', filters.subject);
    if (filters.examType) params.set('examType', filters.examType);
    if (filters.school) params.set('school', filters.school);
    api.get(`/papers?${params}`).then(r => {
      setPapers(r.data.filter(p => p.status === 'published'));
      setLoading(false);
    });
  }, [filters]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3 flex items-center gap-4">
        <button onClick={() => navigate('/home')} className="text-brand-600 hover:text-brand-800 font-bold text-lg">← Back</button>
        <h1 className="text-2xl font-black text-brand-700">Choose a Paper</h1>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">Subject</label>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setFilters(f => ({ ...f, subject: '' }))}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${!filters.subject ? 'bg-brand-600 text-white shadow-md' : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-brand-300'}`}>
                All
              </button>
              {ref.subjects.map(s => (
                <button key={s.slug} onClick={() => setFilters(f => ({ ...f, subject: f.subject === s.slug ? '' : s.slug }))}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filters.subject === s.slug ? 'bg-brand-600 text-white shadow-md' : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-brand-300'}`}>
                  {s.icon} {s.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilters(f => ({ ...f, examType: '' }))}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${!filters.examType ? 'bg-slate-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-400'}`}>
            All Exam Types
          </button>
          {ref.examTypes.map(et => (
            <button key={et.slug} onClick={() => setFilters(f => ({ ...f, examType: f.examType === et.slug ? '' : et.slug }))}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filters.examType === et.slug ? 'bg-slate-700 text-white' : 'bg-white border-2 border-slate-200 text-slate-600 hover:border-slate-400'}`}>
              {et.name}
            </button>
          ))}
        </div>

        {/* Papers grid */}
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-xl">Loading papers... 🔍</div>
        ) : papers.length === 0 ? (
          <div className="card border-2 border-dashed border-slate-200 text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-xl font-bold text-slate-500">No papers here yet</p>
            <p className="text-slate-400 mt-1">Ask your teacher to add some papers!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {papers.map(p => {
              const colours = SUBJECT_COLOURS[p.subject_slug] || { bg: 'bg-slate-50', border: 'border-slate-200', btn: 'bg-slate-500 hover:bg-slate-600' };
              return (
                <div key={p.id} className={`card border-2 ${colours.bg} ${colours.border} flex flex-col gap-3`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${TYPE_COLOURS[p.paper_type]}`}>
                          {TYPE_LABELS[p.paper_type]}
                        </span>
                        {p.exam_type_name && <span className="text-xs font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-600">{p.exam_type_name}</span>}
                      </div>
                      <h3 className="font-black text-slate-800 text-lg leading-tight">{p.title}</h3>
                      {p.school_name && <p className="text-sm text-slate-500 mt-0.5">🏫 {p.school_name}</p>}
                    </div>
                    <span className="text-3xl flex-shrink-0">{p.subject_icon || '📄'}</span>
                  </div>
                  {p.description && <p className="text-sm text-slate-600">{p.description}</p>}
                  <div className="flex items-center gap-3 text-sm text-slate-500 mt-auto">
                    <span>❓ {p.question_count} questions</span>
                    {p.time_limit_mins && <span>⏱ {p.time_limit_mins} mins</span>}
                    {p.pdf_url && <span>📥 PDF available</span>}
                  </div>
                  <button onClick={() => navigate(`/test/${p.id}`)}
                    className={`${colours.btn} text-white font-bold py-3 px-4 rounded-2xl transition-all active:scale-95 shadow-sm text-center`}>
                    Start Practice! 🚀
                  </button>
                  {p.pdf_url && (
                    <a href={`http://localhost:5000${p.pdf_url}`} target="_blank" rel="noreferrer"
                      className="text-center text-sm font-semibold text-slate-500 hover:text-brand-600 transition-colors">
                      📥 Download PDF version
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
