import type { PropsWithChildren } from 'react';

const POINTS = [
  ['One source of truth', 'Consolidate invoices, Tally, Shopify, price sheets and bank statements.'],
  ['Clean, normalised data', 'Vendors and products de-duplicated, units and currencies standardised.'],
  ['Private to your organization', 'Every record is isolated to your account. Nothing is shared across tenants.'],
];

/** Split-screen auth layout: value proposition on the left, form on the right. */
export function AuthLayout({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle: string }>) {
  return (
    <div className="auth-split">
      <aside className="auth-brand" aria-label="About Procurement Intelligence">
        <strong className="auth-logo">Procurement Intelligence</strong>
        <h2>Every supplier and purchase, in one place.</h2>
        <ul>
          {POINTS.map(([t, d]) => (
            <li key={t}>
              <strong>{t}</strong>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      </aside>
      <main className="auth-panel">
        <div className="auth-card">
          <h1>{title}</h1>
          <p className="muted">{subtitle}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
