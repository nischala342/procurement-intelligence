import type { PropsWithChildren, ReactNode } from 'react';
import { Logo } from '../../shared/ui/Logo';

const POINTS = [
  ['One source of truth', 'ERP purchase orders, invoices, Tally, Shopify, price sheets and bank statements in one ledger.'],
  ['Supplier & product intelligence', 'Scorecards on price, delivery, risk and ESG; price history, alternatives and reorder planning.'],
  ['Recommendations with evidence', 'Every saving is computed from your own lines and significance-tested. No invented numbers.'],
];

/**
 * Split-screen auth layout: brand + value (or the demo panel passed as `aside`) on the left, the form on the right.
 */
export function AuthLayout({ title, subtitle, aside, children }: PropsWithChildren<{ title: string; subtitle: string; aside?: ReactNode }>) {
  return (
    <div className={`auth-split${aside ? ' with-demo' : ''}`}>
      <aside className="auth-brand" aria-label="About quoteScout">
        <Logo size={44} tagline domain />
        <h2>See every supplier, every price, every saving.</h2>
        {aside ?? (
          <ul>
            {POINTS.map(([t, d]) => (
              <li key={t}>
                <strong>{t}</strong>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}
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
