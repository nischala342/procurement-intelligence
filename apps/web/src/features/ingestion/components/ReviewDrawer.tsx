import { Drawer } from '../../../shared/ui/Drawer';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pill } from '../../../shared/ui/Pill';
import { useReview, type ReviewEntity } from '../hooks/useReview';
import type { IngestionJob } from '../types';

function Side({ label, name, lines }: { label: string; name: string; lines: string[] }) {
  return (
    <div className="side">
      <span className="side-label">{label}</span>
      <strong className="side-name">{name}</strong>
      {lines.map((l) => (
        <span key={l} className="muted">
          {l}
        </span>
      ))}
    </div>
  );
}

function Card({ item, busy, onMerge, onCreate }: { item: ReviewEntity; busy: boolean; onMerge: () => void; onCreate: () => void }) {
  const { entity, candidate } = item;
  const score = entity.similarityScore != null ? Math.round(entity.similarityScore * 100) : null;
  const isVendor = item.kind === 'vendor';
  const rawLines = isVendor ? [item.entity.taxId ? `Tax ID ${item.entity.taxId}` : ''] : [item.entity.sku ? `SKU ${item.entity.sku}` : '', `Unit ${item.entity.baseUnit}`];
  const candLines = candidate
    ? isVendor
      ? [(candidate as typeof item.entity).taxId ? `Tax ID ${(candidate as typeof item.entity).taxId}` : '', `${candidate.aliases.length} known aliases`]
      : [(candidate as { sku?: string }).sku ? `SKU ${(candidate as { sku?: string }).sku}` : '', `${candidate.aliases.length} known aliases`]
    : [];

  return (
    <li className="review-card">
      <div className="review-head">
        <Pill tone="neutral">{isVendor ? 'Vendor' : 'Product / SKU'}</Pill>
        {score != null && (
          <span className="confidence" title="Similarity of the extracted name to the suggested match">
            <span className="bar" role="meter" aria-label="Match confidence" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
              <span style={{ width: `${score}%` }} />
            </span>
            <span className="tnum">{score}% match</span>
          </span>
        )}
      </div>
      <div className="compare">
        <Side label="Extracted from file" name={entity.name} lines={rawLines.filter(Boolean)} />
        <span className="arrow" aria-hidden="true">
          ⇄
        </span>
        {candidate ? (
          <Side label="Suggested canonical match" name={candidate.name} lines={candLines.filter(Boolean)} />
        ) : (
          <Side label="Suggested canonical match" name="No suggestion available" lines={[]} />
        )}
      </div>
      <div className="review-actions">
        <button className="btn btn-primary" disabled={busy || !candidate} onClick={onMerge}>
          Merge as alias
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={onCreate}>
          Create new entity
        </button>
        {busy && <span className="muted">Saving…</span>}
      </div>
    </li>
  );
}

export function ReviewDrawer({ job, onClose, onResolved }: { job: IngestionJob | null; onClose: () => void; onResolved: () => void }) {
  const review = useReview(job?.id ?? null, onResolved);
  return (
    <Drawer open={Boolean(job)} onClose={onClose} width={680} title="Review entity matches" subtitle={job ? `${job.filename} · resolve ambiguous vendors and SKUs` : undefined}>
      {review.error && (
        <p className="error" role="alert">
          {review.error}
        </p>
      )}
      {review.loading && review.items.length === 0 ? (
        <p className="muted">Loading matches…</p>
      ) : review.items.length === 0 ? (
        <EmptyState title="Nothing left to review" hint="All flagged vendors and SKUs from this file have been resolved." action={<button className="btn btn-primary" onClick={onClose}>Done</button>} />
      ) : (
        <ul className="review-list">
          {review.items.map((item) => (
            <Card
              key={`${item.kind}-${item.entity.id}`}
              item={item}
              busy={review.busyId === item.entity.id}
              onMerge={() => void review.merge(item)}
              onCreate={() => void review.createNew(item)}
            />
          ))}
        </ul>
      )}
    </Drawer>
  );
}
