import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI crash caught by ErrorBoundary:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white border-2 border-red-100 rounded-3xl shadow-lg p-8 max-w-md text-center space-y-4">
          <div className="text-5xl">😵</div>
          <h1 className="text-xl font-black text-slate-800">Something went wrong</h1>
          <p className="text-slate-500 text-sm">
            This page hit an unexpected error. Try going back home — if it keeps happening, tell the admin what you clicked.
          </p>
          <p className="text-xs font-mono bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-red-600 break-words">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { this.setState({ error: null }); window.history.back(); }}
              className="px-4 py-2 rounded-xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-700">
              ← Go Back
            </button>
            <button onClick={() => { window.location.href = '/'; }}
              className="px-4 py-2 rounded-xl font-bold text-sm bg-brand-600 hover:bg-brand-700 text-white">
              🏠 Home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
