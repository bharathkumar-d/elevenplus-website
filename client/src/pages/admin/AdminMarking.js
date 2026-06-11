import React, { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminMarking() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marks, setMarks] = useState({});
  const [feedback, setFeedback] = useState({});
  const [submitting, setSubmitting] = useState({});

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/marking/queue');
    setQueue(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async (answerId, maxMarks) => {
    const awarded = parseInt(marks[answerId]);
    if (isNaN(awarded) || awarded < 0 || awarded > maxMarks) {
      alert(`Enter a mark between 0 and ${maxMarks}`);
      return;
    }
    setSubmitting(s => ({ ...s, [answerId]: true }));
    try {
      await api.post(`/marking/${answerId}`, { awardedMarks: awarded, adminFeedback: feedback[answerId] || '' });
      load();
    } finally {
      setSubmitting(s => ({ ...s, [answerId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Marking Queue</h1>
          <p className="text-slate-500 mt-1">Free-text answers waiting to be marked</p>
        </div>
        <button onClick={load} className="btn-secondary text-sm">🔄 Refresh</button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-lg">Loading queue...</div>
      ) : queue.length === 0 ? (
        <div className="card border-2 border-dashed border-green-200 text-center py-16">
          <div className="text-5xl mb-3">🎉</div>
          <p className="font-bold text-green-600 text-xl">All caught up!</p>
          <p className="text-slate-400 mt-1">No answers waiting to be marked</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm font-semibold text-slate-500 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            ⏳ {queue.length} answer{queue.length > 1 ? 's' : ''} waiting to be marked
          </div>
          {queue.map(item => (
            <div key={item.answer_id} className="card border border-slate-100 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-black text-brand-600">👦 {item.student_name}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600 font-semibold">{item.paper_title}</span>
                    {item.subject_name && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{item.subject_name}</span>}
                  </div>
                  <p className="font-bold text-slate-700 mt-2">Question:</p>
                  <p className="text-slate-800">{item.question_text}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs text-slate-400">Max marks</span>
                  <div className="text-2xl font-black text-slate-700">{item.max_marks}</div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-xs font-bold text-slate-500 mb-1">STUDENT'S ANSWER</p>
                <p className="text-slate-800 whitespace-pre-wrap">{item.free_text_answer || <span className="italic text-slate-400">No answer given</span>}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Award marks (0–{item.max_marks})</label>
                  <input
                    type="number" min={0} max={item.max_marks}
                    className="input"
                    value={marks[item.answer_id] ?? ''}
                    onChange={e => setMarks(m => ({ ...m, [item.answer_id]: e.target.value }))}
                    placeholder={`0 to ${item.max_marks}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-1">Feedback (optional)</label>
                  <input
                    className="input"
                    value={feedback[item.answer_id] ?? ''}
                    onChange={e => setFeedback(f => ({ ...f, [item.answer_id]: e.target.value }))}
                    placeholder="e.g. Good effort, but check your working"
                  />
                </div>
              </div>

              <button
                onClick={() => submit(item.answer_id, item.max_marks)}
                disabled={submitting[item.answer_id] || marks[item.answer_id] === undefined || marks[item.answer_id] === ''}
                className="btn-primary w-full"
              >
                {submitting[item.answer_id] ? 'Saving...' : '✅ Submit Mark'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
