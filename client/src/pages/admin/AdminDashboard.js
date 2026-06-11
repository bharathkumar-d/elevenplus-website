import React from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AdminOverview from './AdminOverview';
import AdminPapers from './AdminPapers';
import AdminQuestions from './AdminQuestions';
import AdminMarking from './AdminMarking';
import AdminStudents from './AdminStudents';

const NAV = [
  { to: '/admin',          label: 'Overview',    icon: '🏠', end: true },
  { to: '/admin/papers',   label: 'Papers',      icon: '📄' },
  { to: '/admin/questions',label: 'Questions',   icon: '❓' },
  { to: '/admin/marking',  label: 'Marking',     icon: '✅' },
  { to: '/admin/students', label: 'Students',    icon: '👦' },
];

export default function AdminDashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Sidebar */}
      <aside className="w-56 bg-brand-700 text-white flex flex-col py-6">
        <div className="px-6 mb-8">
          <div className="text-3xl mb-1">🎓</div>
          <div className="font-black text-xl">11+ Admin</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold transition-colors ${
                  isActive ? 'bg-white/20 text-white' : 'text-blue-100 hover:bg-white/10'
                }`
              }
            >
              <span>{n.icon}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6">
          <button onClick={handleLogout} className="text-sm text-blue-200 hover:text-white font-medium">
            ← Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-auto">
        <Routes>
          <Route index element={<AdminOverview />} />
          <Route path="papers"    element={<AdminPapers />} />
          <Route path="questions" element={<AdminQuestions />} />
          <Route path="marking"   element={<AdminMarking />} />
          <Route path="students"  element={<AdminStudents />} />
        </Routes>
      </main>
    </div>
  );
}

