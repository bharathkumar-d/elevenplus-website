import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-8">
      <div className="text-8xl mb-4">🤔</div>
      <h1 className="text-4xl font-black text-slate-700">Page not found!</h1>
      <p className="text-slate-500 mt-2 text-lg">That page doesn't exist.</p>
      <button onClick={() => navigate(-1)} className="btn-primary mt-6">Go back</button>
    </div>
  );
}
