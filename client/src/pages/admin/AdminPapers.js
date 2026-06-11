import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import Modal from '../../components/Modal';
import Badge from '../../components/Badge';

const EMPTY_FORM = {
  title: '', description: '', paperType: 'full_paper',
  subjectId: '', examTypeId: '', schoolId: '', timeLimitMins: '',
  pdfFile: null,
};

export default function AdminPapers() {
  const navigate = useNavigate();
  const [papers, setPapers] = useState([]);
  const [ref, setRef] = useState({ examTypes: [], schools: [], subjects: [] });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filters, setFilters] = useState({ subject: '', examType: '', school: '', status: '' });

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.subject) params.set('subject', filters.subject);
    if (filters.examType) params.set('examType', filters.examType);
    if (filters.school) params.set('school', filters.school);
    const [p, r] = await Promise.all([
      api.get(`/papers?${params}`),
      api.get('/admin/reference'),
    ]);
    setPapers(p.data);
    setRef(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filters]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditId(null); setShowModal(true); };
  const openEdit = (p) => {
    setForm({
      title: p.title, description: p.description || '', paperType: p.paper_type,
      subjectId: p.subject_id || '', examTypeId: p.exam_type_id || '',
      schoolId: p.school_id || '', timeLimitMins: p.time_limit_mins || '',
      pdfFile: null, existingPdfUrl: p.pdf_url || null,
    });
    setEditId(p.id);
    setShowModal(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      // Use FormData so we can send the PDF file alongside the fields
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description || '');
      fd.append('paperType', form.paperType);
      if (form.subjectId)    fd.append('subjectId', form.subjectId);
      if (form.examTypeId)   fd.append('examTypeId', form.examTypeId);
      if (form.schoolId)     fd.append('schoolId', form.schoolId);
      if (form.timeLimitMins) fd.append('timeLimitMins', form.timeLimitMins);
      if (form.pdfFile)      fd.append('pdf', form.pdfFile);

      if (editId) {
        await api.patch(`/papers/${editId}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/papers', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setShowModal(false);
      load();
    } finally { setSaving(false); }
  };

  const toggleStatus = async (p) => {
    await api.patch(`/papers/${p.id}`, { status: p.status === 'published' ? 'draft' : 'published' });
    load();
  };

  const deletePaper = async (id) => {
    if (!window.confirm('Delete this paper and all its questions?')) return;
    await api.delete(`/papers/${id}`);
    load();
  };

  const paperTypeLabel = { full_paper: 'Full Paper', worksheet: 'Worksheet', mini_test: 'Mini Test' };
  const paperTypeColour = { full_paper: 'blue', worksheet: 'purple', mini_test: 'orange' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Papers</h1>
          <p className="text-slate-500 mt-1">Manage all exam papers and worksheets</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <span>➕</span> New Paper
        </button>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap gap-3">
        <select className="input !w-auto" value={filters.subject} onChange={e => setFilters(f => ({ ...f, subject: e.target.value }))}>
          <option value="">All Subjects</option>
          {ref.subjects.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
        <select className="input !w-auto" value={filters.examType} onChange={e => setFilters(f => ({ ...f, examType: e.target.value }))}>
          <option value="">All Exam Types</option>
          {ref.examTypes.map(e => <option key={e.id} value={e.slug}>{e.name}</option>)}
        </select>
        <select className="input !w-auto" value={filters.school} onChange={e => setFilters(f => ({ ...f, school: e.target.value }))}>
          <option value="">All Schools</option>
          {ref.schools.map(s => <option key={s.id} value={s.slug}>{s.name}</option>)}
        </select>
        <select className="input !w-auto" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-lg">Loading papers...</div>
      ) : papers.length === 0 ? (
        <div className="card border-2 border-dashed border-slate-200 text-center py-16">
          <div className="text-5xl mb-3">📄</div>
          <p className="font-bold text-slate-500">No papers yet</p>
          <p className="text-slate-400 mt-1">Click "New Paper" to create your first one</p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Title', 'Type', 'Subject', 'Exam Type', 'School', 'Questions', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-bold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {papers.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-800 max-w-[200px] truncate">{p.title}</td>
                  <td className="px-4 py-3"><Badge label={paperTypeLabel[p.paper_type]} colour={paperTypeColour[p.paper_type]} /></td>
                  <td className="px-4 py-3 text-slate-600">{p.subject_icon} {p.subject_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.exam_type_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-[140px] truncate">{p.school_name || 'All schools'}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-700">{p.question_count}</td>
                  <td className="px-4 py-3">
                    <Badge label={p.status} colour={p.status === 'published' ? 'green' : 'yellow'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/admin/questions?paperId=${p.id}&paperTitle=${encodeURIComponent(p.title)}`)}
                        className="px-2 py-1 text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors" title="Manage Questions">❓</button>
                      <button onClick={() => openEdit(p)}
                        className="px-2 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors" title="Edit">✏️</button>
                      <button onClick={() => toggleStatus(p)}
                        className={`px-2 py-1 text-xs font-bold rounded-lg transition-colors ${p.status === 'published' ? 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700' : 'bg-green-50 hover:bg-green-100 text-green-700'}`}
                        title={p.status === 'published' ? 'Unpublish' : 'Publish'}>
                        {p.status === 'published' ? '⏸' : '▶️'}
                      </button>
                      <button onClick={() => deletePaper(p.id)}
                        className="px-2 py-1 text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors" title="Delete">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? 'Edit Paper' : 'New Paper'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Title *</label>
            <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. QE Barnet Maths Paper 1" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Paper Type</label>
              <select className="input" value={form.paperType} onChange={e => setForm(f => ({ ...f, paperType: e.target.value }))}>
                <option value="full_paper">Full Paper</option>
                <option value="worksheet">Worksheet</option>
                <option value="mini_test">Mini Test</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Time Limit (mins)</label>
              <input className="input" type="number" value={form.timeLimitMins} onChange={e => setForm(f => ({ ...f, timeLimitMins: e.target.value }))} placeholder="Leave blank = untimed" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Subject</label>
              <select className="input" value={form.subjectId} onChange={e => setForm(f => ({ ...f, subjectId: e.target.value }))}>
                <option value="">— Select subject —</option>
                {ref.subjects.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Exam Type</label>
              <select className="input" value={form.examTypeId} onChange={e => setForm(f => ({ ...f, examTypeId: e.target.value }))}>
                <option value="">— Select exam type —</option>
                {ref.examTypes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">School (leave blank for all schools)</label>
            <select className="input" value={form.schoolId} onChange={e => setForm(f => ({ ...f, schoolId: e.target.value }))}>
              <option value="">All schools</option>
              {ref.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* PDF Upload */}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">PDF File (optional)</label>
            {form.existingPdfUrl && !form.pdfFile && (
              <div className="flex items-center gap-2 mb-2 text-sm text-green-700 font-semibold bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <span>📎</span>
                <span>PDF already uploaded</span>
                <a href={`http://localhost:5000${form.existingPdfUrl}`} target="_blank" rel="noreferrer"
                  className="underline text-green-600 ml-auto">View</a>
              </div>
            )}
            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-all">
              <span className="text-2xl mb-1">{form.pdfFile ? '✅' : '📄'}</span>
              <span className="text-sm font-semibold text-slate-500">
                {form.pdfFile ? form.pdfFile.name : 'Click to choose a PDF file'}
              </span>
              <input type="file" accept="application/pdf" className="hidden"
                onChange={e => setForm(f => ({ ...f, pdfFile: e.target.files[0] || null }))} />
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={save} disabled={saving || !form.title.trim()} className="btn-primary flex-1">
              {saving ? 'Saving...' : editId ? 'Save Changes' : 'Create Paper'}
            </button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
