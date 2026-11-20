# ROLE & OBJECTIVE
Act as a Principal Full-Stack Engineer. Build **Module 2: Vendor Intelligence** across the backend (`apps/api`), database aggregation pipelines, and frontend (`apps/web`).

This module computes and surfaces deep, data-driven supplier analytics and benchmarking for every vendor, derived from the normalized procurement database established in Module 1. All metrics must be strictly scoped by `tenantId`.

---

# 1. BACKEND & ANALYTICS ARCHITECTURE (`apps/api`)

### A. Vendor Intelligence Service (`/src/modules/vendors/intelligence.service.ts`)
Implement robust MongoDB Aggregation Pipelines to compute the following metrics on-demand or via cached pre-computations:
1. **Total Purchase Value:** Sum of `financials.grandTotal` across all completed transactions for the vendor.
2. **Average Product Price:** Mean unit price (`lineItems.unitPrice`) across all items supplied by this vendor.
3. **Historical Price Changes:** Time-series array of product unit prices over time (`lineItems.unitPrice` grouped by product and `issueDate` month/quarter) to detect price inflation.
4. **Purchase Frequency:** Average cadence (e.g., mean days between consecutive purchase orders or invoices).
5. **Payment Terms:** Extracted or configured terms (e.g., "Net 30") paired with average actual payment delay tracking.
6. **Price Consistency:** Variance or standard deviation coefficient of unit prices over time to flag supplier price volatility.
7. **Products Supplied:** Distinct list of canonical products linked to this vendor with last purchased price and total units supplied.
8. **Alternative Supplier Comparison:** Cross-vendor comparison engine matching identical/similar canonical products across different vendors to rank suppliers by unit price, historical stability, and lead times.

### B. API Endpoints (`/src/modules/vendors`)
- `GET /api/v1/vendors`: List vendors with high-level summary metrics (Total Spend, Order Count, Last Purchase Date).
- `GET /api/v1/vendors/:id/intelligence`: Retrieve the deep intelligence payload containing all 8 required metrics and charts data.
- `GET /api/v1/vendors/compare?productIds=...`: Cross-reference alternative suppliers for specific items.

---

# 2. FRONTEND & UI ARCHITECTURE (`apps/web`)

### A. Feature Structure (`src/features/vendors`)
- `components/` — Vendor Directory Table, Vendor Intelligence Dashboard, Price Trend Sparklines, and Supplier Comparison Matrix.
- `api/` — Typed API client fetching vendor analytics.
- `hooks/` — React Query hooks for fetching vendor profiles and cross-supplier comparison data.

### B. Clean UI Specifications
1. **Vendor Directory View:**
   - Searchable, sortable table displaying vendor names, total spend (`tabular-nums`), purchase frequency status pills, and active payment terms.
2. **Vendor Intelligence Deep-Dive Drawer / Page:**
   - **Hero Metric Cards:** Total Spend, Avg Order Value, Price Stability Index, and Purchase Cadence.
   - **Historical Price Trend Chart:** Interactive time-series line chart showing unit price fluctuations per product over time.
   - **Catalog & Pricing Table:** List of supplied products with latest vs. historical pricing.
   - **Alternative Supplier Comparison Widget:** Side-by-side comparison table showing alternative vendors supplying the same or substitute products, highlighting price deltas (e.g., *-12% cheaper*) to guide purchasing decisions.

---

# 3. DOCUMENTATION & CHANGELOG REQUIREMENT
Per our `CLAUDE.md` protocol:
1. Reframe this prompt into a Principal-level specification and append an entry to `docs/prompt-changelog.md`.
2. Update `docs/architecture.md` and `docs/api-reference.md` with the new vendor intelligence endpoints and data schemas.