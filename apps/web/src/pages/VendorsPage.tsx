import { useRef, useState, type KeyboardEvent } from 'react';
import { SupplierComparisonMatrix, VendorDirectory } from '../features/vendors';
import { clearHashQuery, useHashParam } from '../shared/hooks/useHashRoute';
import '../features/vendors/vendors.css';

const TABS = [
  { key: 'directory', label: 'Vendor Directory' },
  { key: 'compare', label: 'Compare Suppliers' },
] as const;

export function VendorsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('directory');
  const openId = useHashParam('open');
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKey = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next]!.key);
    refs.current[TABS[next]!.key]?.focus();
  };

  return (
    <main className="layout wide">
      <header className="page-head">
        <p className="eyebrow">Suppliers</p>
        <h1>Vendor Intelligence</h1>
        <p className="subtitle">Spend, pricing trends, payment behaviour and alternative suppliers, computed from your normalised procurement data.</p>
      </header>
      <div role="tablist" aria-label="Vendor views" className="tabs">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            role="tab"
            id={`vtab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`vpanel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? 'tab active' : 'tab'}
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`vpanel-${tab}`} aria-labelledby={`vtab-${tab}`}>
        {tab === 'directory' ? <VendorDirectory openId={openId} onOpenConsumed={clearHashQuery} /> : <SupplierComparisonMatrix />}
      </div>
    </main>
  );
}
