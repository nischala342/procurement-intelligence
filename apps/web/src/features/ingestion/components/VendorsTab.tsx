import { useState } from 'react';
import { usePagedQuery } from '../../../shared/hooks/usePagedQuery';
import { formatDate } from '../../../shared/lib/format';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pagination } from '../../../shared/ui/Pagination';
import { Pill, type Tone } from '../../../shared/ui/Pill';
import { SkeletonRows } from '../../../shared/ui/Skeleton';
import { listVendors } from '../api';
import type { EntityStatus, Vendor } from '../types';

export const ENTITY_STATUS: Record<EntityStatus, { tone: Tone; glyph: string; label: string }> = {
  active: { tone: 'ok', glyph: '✓', label: 'Active' },
  needs_review: { tone: 'warn', glyph: '⚠', label: 'Needs review' },
  merged: { tone: 'neutral', glyph: '⇢', label: 'Merged' },
};

function Aliases({ aliases }: { aliases: string[] }) {
  const [open, setOpen] = useState(false);
  if (!aliases.length) return <span className="muted">—</span>;
  const shown = open ? aliases : aliases.slice(0, 2);
  return (
    <span className="chips">
      {shown.map((a) => (
        <span key={a} className="chip">
          {a}
        </span>
      ))}
      {aliases.length > 2 && (
        <button className="link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : `+${aliases.length - 2} more`}
        </button>
      )}
    </span>
  );
}

export function VendorsTab() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = usePagedQuery<Vendor>((p) => listVendors(p, { search, status }), [search, status]);

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Search name, alias or tax ID…" aria-label="Search vendors" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="needs_review">Needs review</option>
          <option value="merged">Merged</option>
        </select>
      </div>
      {q.error && (
        <p className="error" role="alert">
          {q.error}
        </p>
      )}
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Vendor</th>
              <th scope="col">Tax ID (GSTIN/PAN)</th>
              <th scope="col">Aliases</th>
              <th scope="col">Status</th>
              <th scope="col">First seen</th>
            </tr>
          </thead>
          <tbody>
            {q.loading ? (
              <SkeletonRows cols={5} />
            ) : q.data.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="No vendors yet" hint="Vendors are created automatically as files are ingested." />
                </td>
              </tr>
            ) : (
              q.data.map((v) => {
                const m = ENTITY_STATUS[v.status];
                return (
                  <tr key={v.id}>
                    <td>
                      <strong>{v.name}</strong>
                    </td>
                    <td className="tnum">{v.taxId ?? <span className="muted">—</span>}</td>
                    <td>
                      <Aliases aliases={v.aliases} />
                    </td>
                    <td>
                      <Pill tone={m.tone} glyph={m.glyph}>
                        {m.label}
                      </Pill>
                    </td>
                    <td className="muted">{formatDate(v.createdAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <Pagination meta={q.meta} onPage={q.setPage} />
      <p className="muted note">Payment terms are not captured by the current vendor schema.</p>
    </>
  );
}
