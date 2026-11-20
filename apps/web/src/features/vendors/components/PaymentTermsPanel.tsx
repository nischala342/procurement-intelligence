import { useEffect, useId, useState, type FormEvent } from 'react';
import { formatMoney } from '../../../shared/lib/format';
import { useSavePaymentTerms } from '../hooks';
import type { VendorIntelligence } from '../types';

export function PaymentTermsPanel({ vendorId, terms }: { vendorId: string; terms: VendorIntelligence['paymentTerms'] }) {
  const id = useId();
  const [days, setDays] = useState(terms.termsDays == null ? '' : String(terms.termsDays));
  const [error, setError] = useState<string | null>(null);
  const save = useSavePaymentTerms(vendorId);
  useEffect(() => setDays(terms.termsDays == null ? '' : String(terms.termsDays)), [terms.termsDays]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(days);
    if (days.trim() === '' || !Number.isInteger(n) || n < 0 || n > 365) return setError('Enter whole days between 0 and 365.');
    setError(null);
    save.mutate(n);
  };

  return (
    <div className="terms">
      <dl className="kv wide">
        <dt>Payment terms</dt>
        <dd>
          {terms.label ?? <span className="muted">Not set. Terms are not available from the ingested files, so set them here.</span>}
          {terms.source === 'configured' && <span className="muted small"> (configured)</span>}
        </dd>
        <dt title="Estimated by applying each payment to the oldest open invoice (the source data does not link payments to invoices).">Avg days to pay (est.)</dt>
        <dd className="tnum">{terms.avgDaysToPay != null ? `${terms.avgDaysToPay} days across ${terms.invoicesPaid} paid invoice${terms.invoicesPaid === 1 ? '' : 's'}` : <span className="muted">No paid invoices matched yet</span>}</dd>
        {terms.onTimeRate != null && (
          <>
            <dt>Paid within terms</dt>
            <dd className="tnum">{Math.round(terms.onTimeRate * 100)}%</dd>
          </>
        )}
        <dt>Outstanding</dt>
        <dd className="tnum">
          {formatMoney(terms.outstandingAmount)} <span className="muted">({terms.invoicesOutstanding} invoice{terms.invoicesOutstanding === 1 ? '' : 's'})</span>
        </dd>
      </dl>
      <form className="terms-form" onSubmit={submit}>
        <label htmlFor={id}>Set terms (days)</label>
        <input id={id} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 30" aria-invalid={error ? true : undefined} />
        <button className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        {terms.termsDays != null && (
          <button type="button" className="btn btn-ghost" disabled={save.isPending} onClick={() => save.mutate(null)}>
            Clear
          </button>
        )}
      </form>
      {(error || save.isError) && (
        <p className="error" role="alert">
          {error ?? (save.error instanceof Error ? save.error.message : 'Could not save')}
        </p>
      )}
    </div>
  );
}
