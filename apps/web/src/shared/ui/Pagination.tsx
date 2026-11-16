import type { PageMeta } from '../api';

export function Pagination({ meta, onPage }: { meta: PageMeta; onPage: (p: number) => void }) {
  if (meta.total === 0) return null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="muted tnum">
        {from}–{to} of {meta.total}
      </span>
      <button className="btn btn-ghost" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Previous
      </button>
      <button className="btn btn-ghost" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
        Next
      </button>
    </nav>
  );
}
