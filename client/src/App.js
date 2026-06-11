import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import api from './api/client';
import ErrorBoundary from './components/ErrorBoundary';

import LoginPage from './pages/LoginPage';
import StudentHome from './pages/student/StudentHome';
import StudentPapers from './pages/student/StudentPapers';
import StudentTest from './pages/student/StudentTest';
import StudentResults from './pages/student/StudentResults';
import StudentProgress from './pages/student/StudentProgress';
import StudentOnboarding from './pages/student/StudentOnboarding';
import AdminDashboard from './pages/admin/AdminDashboard';
import NotFound from './pages/NotFound';

function RequireAuth({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-2xl">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

// Wraps student routes — redirects to /onboarding if not yet onboarded
function RequireOnboarded({ children }) {
  const { user, loading } = useAuth();
  const [checked, setChecked] = useState(false);
  const [onboarded, setOnboarded] = useState(true);

  useEffect(() => {
    if (!user || user.role !== 'student') { setChecked(true); return; }
    api.get('/student/profile').then(r => {
      setOnboarded(r.data.onboarded === true);
      setChecked(true);
    }).catch(() => setChecked(true));
  }, [user]);

  if (loading || !checked) return null;
  if (!onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/home" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          {/* Onboarding — student only, no onboarded check */}
          <Route path="/onboarding" element={
            <RequireAuth role="student"><StudentOnboarding /></RequireAuth>
          } />

          {/* Student routes — all require onboarding first */}
          <Route path="/home" element={
            <RequireAuth role="student"><RequireOnboarded><StudentHome /></RequireOnboarded></RequireAuth>
          } />
          <Route path="/papers" element={
            <RequireAuth role="student"><RequireOnboarded><StudentPapers /></RequireOnboarded></RequireAuth>
          } />
          <Route path="/test/:paperId" element={
            <RequireAuth role="student"><RequireOnboarded><StudentTest /></RequireOnboarded></RequireAuth>
          } />
          <Route path="/results/:attemptId" element={
            <RequireAuth role="student"><RequireOnboarded><StudentResults /></RequireOnboarded></RequireAuth>
          } />
          <Route path="/progress" element={
            <RequireAuth role="student"><RequireOnboarded><StudentProgress /></RequireOnboarded></RequireAuth>
          } />

          {/* Admin routes */}
          <Route path="/admin/*" element={
            <RequireAuth role="admin"><AdminDashboard /></RequireAuth>
          } />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}
