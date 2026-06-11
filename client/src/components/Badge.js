import React from 'react';

const COLOURS = {
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue:   'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  red:    'bg-red-100 text-red-700',
  slate:  'bg-slate-100 text-slate-600',
  orange: 'bg-orange-100 text-orange-700',
};

export default function Badge({ label, colour = 'slate' }) {
  return (
    <span className={`badge ${COLOURS[colour] || COLOURS.slate}`}>{label}</span>
  );
}
