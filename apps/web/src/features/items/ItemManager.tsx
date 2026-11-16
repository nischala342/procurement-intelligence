import { Card } from '../../shared/ui/Card';
import { ItemForm } from './ItemForm';
import { useItems } from './useItems';

export function ItemManager() {
  const { items, meta, page, setPage, search, updateSearch, loading, error, add, remove } = useItems();

  return (
    <Card title={`Item Manager (${meta.total})`}>
      <ItemForm onSubmit={add} />
      <div className="toolbar">
        <input placeholder="Search name, slug, description…" value={search} onChange={(e) => updateSearch(e.target.value)} />
      </div>
      {error && <p className="error">{error}</p>}
      {loading && items.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No items found. Run <code>npm run db:seed</code> or add one above.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Category</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td className="muted">{i.slug}</td>
                <td>{i.category}</td>
                <td>${i.price.toFixed(2)}</td>
                <td>{i.quantity}</td>
                <td>
                  <span className={`badge ${i.status}`}>{i.status}</span>
                </td>
                <td>
                  <button className="danger" onClick={() => void remove(i.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="pager">
        <button className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Prev
        </button>
        <span className="muted">
          Page {meta.page} / {meta.totalPages}
        </span>
        <button className="secondary" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </Card>
  );
}
