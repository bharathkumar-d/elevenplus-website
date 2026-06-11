import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';

const AVATARS = ['🚀','⭐','🦁','🐯','🦊','🐬','🦋','🌟','🎯','🏆','🧠','🎮'];

export default function StudentOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0); // 0=avatar, 1=school, 2=examType
  const [ref, setRef] = useState({ schools: [], examTypes: [] });
  const [form, setForm] = useState({ avatarEmoji: '⭐', schoolId: '', examTypeId: '', yearGroup: 5 });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/reference').then(r => setRef(r.data)); }, []);

  async function finish() {
    setSaving(true);
    await api.put('/student/profile', form);
    navigate('/home', { replace: true });
  }

  const steps = [
    {
      title: "Pick your avatar! 🎨",
      subtitle: "Choose a character that represents you",
      content: (
        <div className="grid grid-cols-4 gap-3">
          {AVATARS.map(a => (
            <button key={a} onClick={() => setForm(f => ({ ...f, avatarEmoji: a }))}
              className={`text-4xl p-4 rounded-2xl transition-all active:scale-90 ${
                form.avatarEmoji === a
                  ? 'bg-brand-100 border-4 border-brand-500 scale-110 shadow-lg'
                  : 'bg-slate-50 border-2 border-slate-200 hover:bg-brand-50'
              }`}>
              {a}
            </button>
          ))}
        </div>
      ),
      canNext: true,
    },
    {
      title: "Which school are you aiming for? 🏫",
      subtitle: "We'll show you papers tailored for your school",
      content: (
        <div className="space-y-3">
          {ref.schools.map(s => (
            <button key={s.id} onClick={() => setForm(f => ({
              ...f,
              schoolId: s.id,
              // Auto-select exam type if school has one linked
              examTypeId: s.exam_type_id ? s.exam_type_id : f.examTypeId,
            }))}
              className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-bold transition-all ${
                form.schoolId === s.id
                  ? 'bg-brand-600 border-brand-600 text-white shadow-lg'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50'
              }`}>
              <p className="text-lg">{s.name}</p>
              <p className={`text-sm font-normal mt-0.5 ${form.schoolId === s.id ? 'text-brand-100' : 'text-slate-400'}`}>
                {s.county}{s.exam_type_name ? ` · ${s.exam_type_name} format` : ''}
              </p>
            </button>
          ))}
          <button onClick={() => setForm(f => ({ ...f, schoolId: '', examTypeId: '' }))}
            className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-bold transition-all ${
              !form.schoolId
                ? 'bg-slate-600 border-slate-600 text-white shadow-lg'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
            }`}>
            Not sure yet / General practice
          </button>
        </div>
      ),
      canNext: true,
    },
    {
      title: "Which exam format? 📝",
      subtitle: "Different schools use different formats",
      content: (
        <div className="space-y-3">
          {ref.examTypes.map(et => (
            <button key={et.id} onClick={() => setForm(f => ({ ...f, examTypeId: et.id }))}
              className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-bold transition-all ${
                form.examTypeId === et.id
                  ? 'bg-brand-600 border-brand-600 text-white shadow-lg'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50'
              }`}>
              <p className="text-lg">{et.name}</p>
              <p className={`text-sm font-normal mt-0.5 ${form.examTypeId === et.id ? 'text-brand-100' : 'text-slate-400'}`}>{et.description}</p>
            </button>
          ))}
          <button onClick={() => setForm(f => ({ ...f, examTypeId: '' }))}
            className={`w-full text-left px-5 py-4 rounded-2xl border-2 font-bold transition-all ${
              !form.examTypeId
                ? 'bg-slate-600 border-slate-600 text-white shadow-lg'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'
            }`}>
            Not sure / Try all formats
          </button>
        </div>
      ),
      canNext: true,
    },
  ];

  const current = steps[step];

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div key={i} className={`h-2 rounded-full transition-all ${
              i === step ? 'w-8 bg-brand-500' : i < step ? 'w-2 bg-brand-300' : 'w-2 bg-slate-200'
            }`} />
          ))}
        </div>

        <div className="card border-2 border-brand-100 space-y-6">
          {/* Avatar preview */}
          <div className="text-center">
            <div className="text-7xl mb-3 animate-bounce">{form.avatarEmoji}</div>
            <h1 className="text-2xl font-black text-slate-800">{current.title}</h1>
            <p className="text-slate-500 mt-1">{current.subtitle}</p>
          </div>

          {current.content}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} className="btn-secondary flex-1">← Back</button>
            )}
            {step < steps.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={!current.canNext}
                className="btn-primary flex-1">
                Next →
              </button>
            ) : (
              <button onClick={finish} disabled={saving} className="btn-primary flex-1 bg-green-600 hover:bg-green-700">
                {saving ? 'Saving...' : "Let's go! 🚀"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
