import { useState, type FormEvent } from 'react';
import type { ItemInput, ItemStatus } from './types';

interface Props {
  onSubmit: (input: ItemInput) => Promise<void>;
}

export function ItemForm({ onSubmit }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [status, setStatus] = useState<ItemStatus>('active');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name, category, price: Number(price), quantity: Number(quantity), status });
      setName('');
      setPrice('');
      setQuantity('0');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handle}>
      <div className="form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label>
          Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label>
          Price
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </label>
        <label>
          Quantity
          <input type="number" min="0" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
            <option value="active">active</option>
            <option value="draft">draft</option>
            <option value="archived">archived</option>
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add item'}
      </button>
    </form>
  );
}
