import { useRef, useState, type KeyboardEvent } from 'react';
import { Card } from '../../../shared/ui/Card';
import { ProductsTab } from './ProductsTab';
import { TransactionsTab } from './TransactionsTab';
import { VendorsTab } from './VendorsTab';

const TABS = [
  { key: 'transactions', label: 'Transactions Ledger' },
  { key: 'vendors', label: 'Vendors Directory' },
  { key: 'products', label: 'Product Catalog' },
] as const;

/** Tabbed canonical data grid with arrow-key tab navigation (WAI-ARIA tabs pattern). */
export function DataExplorer() {
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('transactions');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    const t = TABS[next]!;
    setActive(t.key);
    refs.current[t.key]?.focus();
  };

  return (
    <Card title="Data Explorer">
      <div role="tablist" aria-label="Canonical data" className="tabs">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={active === t.key ? 0 : -1}
            className={active === t.key ? 'tab active' : 'tab'}
            onClick={() => setActive(t.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'transactions' && <TransactionsTab />}
        {active === 'vendors' && <VendorsTab />}
        {active === 'products' && <ProductsTab />}
      </div>
    </Card>
  );
}
