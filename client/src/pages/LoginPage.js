import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'admin' ? '/admin' : '/home');
    } catch {
      setError('Wrong email or password. Please try again!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-kid-purple/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo / header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🎓</div>
          <h1 className="text-4xl font-black text-brand-700">11+ Prep</h1>
          <p className="text-slate-500 mt-1 text-lg">Your path to grammar school</p>
        </div>

        <div className="card">
          <h2 className="text-2xl font-bold mb-6 text-center text-slate-700">Welcome back!</h2>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 mb-4 text-red-700 font-semibold text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full text-lg mt-2"
            >
              {loading ? 'Logging in...' : 'Let\'s go! 🚀'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-400 mt-6">
          Need an account? Ask your teacher or parent.
        </p>
      </div>
    </div>
  );
}
