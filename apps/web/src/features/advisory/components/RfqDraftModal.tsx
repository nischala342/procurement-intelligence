import { useEffect, useId, useRef, useState } from 'react';
import { formatDate, formatMoney, formatNumber } from '../../../shared/lib/format';
import { Drawer } from '../../../shared/ui/Drawer';
import { Pill } from '../../../shared/ui/Pill';
import { useRfqDraft } from '../hooks';
import type { RfqDraft } from '../types';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const checklistText = (d: RfqDraft) =>
  [
    `RFQ checklist: ${d.items[0]?.name ?? ''}`,
    '',
    `Item: ${d.items[0]?.name ?? ''}${d.items[0]?.sku ? ` (SKU ${d.items[0].sku})` : ''}`,
    `Unit of measure: ${d.items[0]?.baseUnit ?? ''}`,
    d.items[0]?.targetQuantity != null ? `Target quantity: ${formatNumber(d.items[0].targetQuantity)} ${d.items[0].baseUnit}` : 'Target quantity: to be confirmed',
    '',
    'Suppliers to invite:',
    ...d.suppliers.map((s) => `[ ] ${s.name} (${s.relationship})`),
    '',
    'Information to request from each supplier:',
    ...d.checklist.map((c) => `[ ] ${c}`),
    '',
    'Internal notes (do not share):',
    ...d.internalNotes.map((n) => `- ${n}`),
  ].join('\n');

/** Drawer that drafts an RFQ from an insight: pick suppliers, adjust quantity, then copy or download the checklist and email text. */
export function RfqDraftModal({ insightId, headline, onClose }: { insightId: string | null; headline?: string; onClose: () => void }) {
  const draft = useRfqDraft(insightId ?? '');
  const [pool, setPool] = useState<RfqDraft['suppliers']>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState('');
  const [notes, setNotes] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const qtyId = useId();
  const notesId = useId();
  const initial = useRef<string | null>(null);

  // first draft uses the engine's suggested suppliers; that list becomes the pool to choose from
  useEffect(() => {
    if (!insightId || initial.current === insightId) return;
    initial.current = insightId;
    setPool([]);
    setSelected(new Set());
    setQty('');
    setNotes('');
    draft.mutate({}, { onSuccess: (d) => (setPool(d.suppliers), setSelected(new Set(d.suppliers.map((s) => s.vendorId))), setQty(d.items[0]?.targetQuantity != null ? String(d.items[0].targetQuantity) : '')) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insightId]);
  useEffect(() => {
    if (!insightId) initial.current = null;
  }, [insightId]);

  const regenerate = () => {
    const n = Number(qty);
    draft.mutate({
      ...(selected.size ? { vendorIds: [...selected] } : {}),
      ...(qty.trim() !== '' && Number.isFinite(n) && n > 0 ? { targetQuantity: n } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
  };
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const flash = async (label: string, text: string) => {
    setCopied((await copy(text)) ? label : 'Copy failed. Select the text manually.');
    setTimeout(() => setCopied(null), 2500);
  };

  const d = draft.data;
  return (
    <Drawer open={Boolean(insightId)} onClose={onClose} width={780} title="RFQ draft" subtitle={headline}>
      {draft.isError && (
        <p className="error" role="alert">
          {draft.error instanceof Error ? draft.error.message : 'Could not draft the RFQ'}
        </p>
      )}
      {draft.isPending && !d && <p className="muted" role="status">Drafting from the evidence…</p>}

      {pool.length > 0 && (
        <section aria-label="RFQ options" className="rfq-options">
          <h4 className="subhead">Suppliers to invite</h4>
          <ul className="rfq-suppliers">
            {pool.map((s) => (
              <li key={s.vendorId}>
                <label className="check">
                  <input type="checkbox" checked={selected.has(s.vendorId)} onChange={() => toggle(s.vendorId)} />
                  <span>
                    <strong>{s.name}</strong>{' '}
                    <Pill tone={s.relationship === 'current' ? 'neutral' : 'info'}>{s.relationship === 'current' ? 'Current supplier' : 'Alternative'}</Pill>
                    {s.lastKnownPrice != null && (
                      <span className="muted small tnum">
                        {' '}
                        last {s.lastKnownPriceKind === 'purchase' ? 'paid' : 'quoted'} {formatMoney(s.lastKnownPrice)} on {formatDate(s.lastKnownPriceDate)}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="rfq-form">
            <label htmlFor={qtyId}>Target quantity</label>
            <input id={qtyId} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            <label htmlFor={notesId}>Notes to suppliers</label>
            <input id={notesId} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            <button className="btn btn-primary" onClick={regenerate} disabled={draft.isPending || selected.size === 0}>
              {draft.isPending ? 'Updating…' : 'Update draft'}
            </button>
          </div>
        </section>
      )}

      {d && (
        <>
          <h3 className="section">Item</h3>
          <div className="table-wrap">
            <table className="grid compact">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Specification</th>
                  <th scope="col" className="num">
                    Target quantity
                  </th>
                  <th scope="col">Quantity basis</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((i) => (
                  <tr key={i.productId}>
                    <td>
                      <strong>{i.name}</strong>
                      {i.sku && <span className="muted block small tnum">SKU {i.sku}</span>}
                    </td>
                    <td>Unit: {i.baseUnit}{i.knownAs.length > 0 && <span className="muted block small">Also known as: {i.knownAs.join(', ')}</span>}</td>
                    <td className="num tnum">{i.targetQuantity != null ? `${formatNumber(i.targetQuantity)} ${i.baseUnit}` : 'To be confirmed'}</td>
                    <td className="muted small">{i.quantityBasis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="section">Quotation checklist</h3>
          <ul className="checklist">
            {d.checklist.map((c) => (
              <li key={c}>
                <span aria-hidden="true">☐</span> {c}
              </li>
            ))}
          </ul>

          <h3 className="section">Email to suppliers</h3>
          <textarea className="rfq-body" readOnly rows={14} value={d.bodyText} aria-label="RFQ email text" />
          <p className="muted small">
            Fill in the placeholders before sending: {d.placeholders.join(', ')}. The internal reference price is deliberately not included.
          </p>

          <h3 className="section">Internal notes (do not share)</h3>
          <ul className="issues">
            {d.internalNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>

          <div className="rfq-actions">
            <button className="btn btn-primary" onClick={() => void flash('Email text copied', d.bodyText)}>
              Copy email text
            </button>
            <button className="btn btn-ghost" onClick={() => void flash('Checklist copied', checklistText(d))}>
              Copy checklist
            </button>
            <button className="btn btn-ghost" onClick={() => download(`rfq-${d.items[0]?.name.replace(/\W+/g, '-').toLowerCase() ?? 'draft'}.txt`, `${d.bodyText}\n\n----- CHECKLIST -----\n${checklistText(d)}`)}>
              Download .txt
            </button>
            <span role="status" className="muted small">
              {copied}
            </span>
          </div>
        </>
      )}
    </Drawer>
  );
}
