import { ProductCatalog } from '../features/products';
import { clearHashQuery, useHashParam } from '../shared/hooks/useHashRoute';
import '../features/products/products.css';

export function ProductsPage() {
  const openId = useHashParam('open');
  return (
    <main className="layout wide">
      <header className="page-head">
        <p className="eyebrow">Catalogue</p>
        <h1>Product Intelligence</h1>
        <p className="subtitle">Cost economics per SKU: what you paid, who sells it best, how prices move, and when to reorder.</p>
      </header>
      <ProductCatalog openId={openId} onOpenConsumed={clearHashQuery} />
    </main>
  );
}
