import type { ReactNode } from 'react';

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <rect x="10" y="8" width="38" height="48" rx="5" stroke="#9ca3af" strokeWidth="2" />
        <path d="M18 22h22M18 30h22M18 38h12" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" />
        <circle cx="46" cy="46" r="11" fill="#fff" stroke="#6366f1" strokeWidth="2" />
        <path d="M46 41v10M41 46h10" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h3>{title}</h3>
      {hint && <p className="muted">{hint}</p>}
      {action}
    </div>
  );
}
