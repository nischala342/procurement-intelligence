import { useState } from 'react';
import { Drawer } from '../../../shared/ui/Drawer';
import { EmptyState } from '../../../shared/ui/EmptyState';
import { Pill } from '../../../shared/ui/Pill';
import { useVendorIntelligence } from '../hooks';
import type { Granularity } from '../types';
import { CatalogTable } from './CatalogTable';
import { ComparisonTable } from './ComparisonTable';
import { HeroMetrics } from './HeroMetrics';
import { PaymentTermsPanel } from './PaymentTermsPanel';
import { PriceTrendChart } from './PriceTrendChart';
import { ChangePill } from '../display';

export function VendorIntelligenceDrawer({ vendor, onClose }: { vendor: { id: string; name: string } | null; onClose: () => void }) {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const q = useVendorIntelligence(vendor?.id ?? null, granularity);
  const data = q.data;

  return (
    <Drawer
      open={Boolean(vendor)}
      onClose={onClose}
      width={960}
      title={vendor?.name || data?.vendor.name || ''}
      subtitle={data ? `${data.vendor.taxId ? `Tax ID ${data.vendor.taxId} · ` : ''}All amounts in ${data.currency}, prices per base unit` : 'Vendor intelligence'}
    >
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof Error ? q.error.message : 'Failed to load vendor intelligence'}
        </p>
      )}
      {q.isPending && !data && (
        <div aria-busy="true" aria-label="Loading vendor intelligence" className="intel-loading">
          <div className="hero-grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="hero">
                <span className="skeleton" style={{ width: '50%' }} />
                <span className="skeleton" style={{ width: '80%', height: 22 }} />
                <span className="skeleton" style={{ width: '60%' }} />
              </div>
            ))}
          </div>
          <span className="skeleton" style={{ width: '100%', height: 220, marginTop: 16 }} />
        </div>
      )}

      {data && vendor && (
        <>
          <HeroMetrics data={data} />
          {data.summary.orderCount === 0 && (
            <p className="note-box">
              No purchase invoices are recorded for this vendor yet, so spend, cadence and payment metrics are empty. Price quotes (if any) still drive the price and comparison sections.
            </p>
          )}

          <h3 className="section">Payment terms</h3>
          <PaymentTermsPanel vendorId={vendor.id} terms={data.paymentTerms} />
          {data.dataQuality.duplicatePaymentsExcluded > 0 && (
            <p className="muted small">
              {data.dataQuality.duplicatePaymentsExcluded} payment record{data.dataQuality.duplicatePaymentsExcluded > 1 ? 's' : ''} that appear in two sources (e.g. a Tally voucher and the bank debit) were counted once.
            </p>
          )}

          <h3 className="section">
            Historical price trend
            <span className="section-actions">
              {data.priceHistory.inflationPct != null && (
                <span className="inflation" title="Average change between each product's first and latest period">
                  Avg price change <ChangePill pct={data.priceHistory.inflationPct} />
                </span>
              )}
              <span className="seg" role="group" aria-label="Group by">
                {(['month', 'quarter'] as const).map((g) => (
                  <button key={g} type="button" aria-pressed={granularity === g} className={granularity === g ? 'on' : ''} onClick={() => setGranularity(g)}>
                    {g === 'month' ? 'Monthly' : 'Quarterly'}
                  </button>
                ))}
              </span>
            </span>
          </h3>
          <PriceTrendChart key={`${vendor.id}-${granularity}-${data.priceHistory.series.length}`} series={data.priceHistory.series} granularity={granularity} />

          <h3 className="section">Catalog &amp; pricing</h3>
          {data.products.length === 0 ? (
            <EmptyState title="No products with prices yet" hint="Products appear once invoices or price lists with unit prices are ingested for this vendor." />
          ) : (
            <CatalogTable products={data.products} series={data.priceHistory.series} />
          )}

          <h3 className="section">
            Alternative suppliers
            <Pill tone="neutral">
              {data.alternatives.productsWithAlternatives} of {data.alternatives.comparedProducts} products
            </Pill>
          </h3>
          {data.alternatives.items.length === 0 ? (
            <EmptyState
              title="No alternative suppliers found"
              hint="Alternatives appear when other vendors have prices for the same or a similar product. Ingest more supplier price lists to compare."
            />
          ) : (
            data.alternatives.items.map((c) => (
              <div key={c.product.id} className="alt-block">
                <h4>
                  {c.product.name}
                  {c.product.sku && <span className="muted small tnum"> · {c.product.sku}</span>}
                </h4>
                <ComparisonTable comparison={c} />
              </div>
            ))
          )}
          <p className="muted small">
            Suppliers are ranked by latest price per base unit (converted to {data.currency}); price stability is the coefficient of variation of unit prices. Lead times are not captured by the ingestion sources yet.
          </p>
          {data.dataQuality.invoiceLinesWithoutBaseAmount > 0 && (
            <p className="warn-text small" role="note">
              {data.dataQuality.invoiceLinesWithoutBaseAmount} invoice line(s) have no {data.currency} amount (unknown currency or missing FX rate) and are not included in spend.
            </p>
          )}
        </>
      )}
    </Drawer>
  );
}
