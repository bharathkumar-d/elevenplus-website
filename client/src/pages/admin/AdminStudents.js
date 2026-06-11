import React, { useEffect, useState } from 'react';
import api from '../../api/client';
import Modal from '../../components/Modal';

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'student' });
  const [resetPassword, setResetPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/admin/students');
    setStudents(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.fullName.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true); setError('');
    try {
      await api.post('/auth/register', form);
      setShowModal(false);
      setForm({ fullName: '', email: '', password: '', role: 'student' });
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account');
    } finally { setSaving(false); }
  };

  const openReset = (student) => {
    setSelectedStudent(student);
    setResetPassword('');
    setResetSuccess(false);
    setError('');
    setShowResetModal(true);
  };

  const doReset = async () => {
    if (!resetPassword.trim() || resetPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSaving(true); setError('');
    try {
      await api.post(`/admin/students/${selectedStudent.id}/reset-password`, { newPassword: resetPassword });
      setResetSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-800">Students</h1>
          <p className="text-slate-500 mt-1">Manage student accounts</p>
        </div>
        <button onClick={() => { setForm({ fullName: '', email: '', password: '', role: 'student' }); setError(''); setShowModal(true); }} className="btn-primary flex items-center gap-2">
          <span>➕</span> Add Student
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading students...</div>
      ) : students.length === 0 ? (
        <div className="card border-2 border-dashed border-slate-200 text-center py-16">
          <div className="text-5xl mb-3">👦</div>
          <p className="font-bold text-slate-500">No students yet</p>
          <p className="text-slate-400 mt-1">Add your first student account to get started</p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                {['Student', 'Email', 'School', 'Exam', 'Year', 'Joined', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-bold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{s.avatar_emoji || '⭐'}</span>
                      <span className="font-semibold text-slate-800">{s.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.email}</td>
                  <td className="px-4 py-3 text-slate-500">{s.school_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{s.exam_type_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{s.year_group ? `Y${s.year_group}` : '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(s.created_at).toLocaleDateString('en-GB')}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openReset(s)}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1.5 rounded-lg transition-all">
                      🔑 Reset PW
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Student Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Student Account">
        <div className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 font-semibold text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="student">Student</option>
              <option value="parent">Parent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Full Name *</label>
            <input className="input" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="e.g. Ayansh Devulapalli" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Email *</label>
            <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. ayansh@home.local" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">Password *</label>
            <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Minimum 8 characters" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={create} disabled={saving || !form.fullName || !form.email || !form.password} className="btn-primary flex-1">
              {saving ? 'Creating...' : 'Create Account'}
            </button>
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={showResetModal} onClose={() => setShowResetModal(false)} title={`Reset Password — ${selectedStudent?.full_name}`}>
        <div className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 font-semibold text-sm">{error}</div>}
          {resetSuccess ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 font-semibold text-center">
                ✅ Password reset successfully!
              </div>
              <button onClick={() => setShowResetModal(false)} className="btn-primary w-full">Done</button>
            </div>
          ) : (
            <>
              <p className="text-slate-600 text-sm">Enter a new password for <strong>{selectedStudent?.full_name}</strong>.</p>
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-1">New Password *</label>
                <input className="input" type="text" value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  placeholder="e.g. ayansh123" />
                <p className="text-xs text-slate-400 mt-1">Minimum 6 characters. Share this with the student.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={doReset} disabled={saving || !resetPassword} className="btn-primary flex-1">
                  {saving ? 'Resetting...' : '🔑 Reset Password'}
                </button>
                <button onClick={() => setShowResetModal(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
