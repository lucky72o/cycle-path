// app/src/cycle-tracking/interpretation/components/FailedAttemptsSection.tsx
import { useState } from 'react';
import type { FailedAttempt } from '../types';

type Props = { attempts: FailedAttempt[] };

export function FailedAttemptsSection({ attempts }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || attempts.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          {expanded ? '▼' : '▶'} {attempts.length} earlier pattern{attempts.length > 1 ? 's were' : ' was'} considered and rejected{' '}
          <span className="text-gray-400">(educational)</span>
        </button>
        <button onClick={() => setDismissed(true)} className="text-gray-300 hover:text-gray-500 text-sm">✕</button>
      </div>
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-3 space-y-2">
          {attempts.map((a, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded-md text-xs text-gray-600 leading-relaxed">
              <div className="font-medium text-gray-700 mb-1">Day {a.attemptedShiftDay} — Rejected</div>
              <div>Coverline would have been {a.coverlineTemp.toFixed(2)}°C (Days {a.referenceDays.join(', ')}). {a.failureReason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
