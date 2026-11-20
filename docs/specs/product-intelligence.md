# ROLE & OBJECTIVE
Act as a Principal Full-Stack Engineer. Build **Module 3: Product Intelligence** across the backend (`apps/api`), database aggregation pipelines, and frontend (`apps/web`).

While Module 2 analyzed suppliers, Module 3 focuses on **individual product economics**. It aggregates transaction and catalog data to provide deep cost analytics, supplier benchmarking, and intelligent reorder insights per SKU, strictly scoped by `tenantId`.

---

# 1. BACKEND & ANALYTICS ARCHITECTURE (`apps/api`)

### A. Product Intelligence Service (`/src/modules/products/intelligence.service.ts`)
Implement robust MongoDB Aggregation Pipelines to compute item-level economic metrics:
1. **Historical Purchase Price:** Chronological time-series of unit prices paid for the specific SKU across all past transactions.
2. **Lowest Recorded Purchase Price:** The absolute minimum unit price ever paid for this product, including the vendor and date.
3. **Average Purchase Price:** Weighted or arithmetic mean unit price across all historical purchases.
4. **Best-Performing Vendor:** Automated scoring of suppliers for this specific item based on a composite of lowest unit price, reliability, and price stability.
5. **Price Fluctuations:** Percentage variance and trend analysis (e.g., month-over-month inflation/deflation rate).
6. **Reorder Quantity Recommendations:** Dynamic calculation based on historical consumption velocity, lead times, and safety stock buffers.
7. **Alternative Products or Vendors:** Cross-reference matching for substitute products in the catalog or alternative approved vendors offering the same item cheaper.

### B. API Endpoints (`/src/modules/products`)
- `GET /api/v1/products`: List products with key summary metrics (Current Price, Spend Share, Primary Vendor).
- `GET /api/v1/products/:id/intelligence`: Retrieve the deep product intelligence payload containing all 7 economic metrics and price history charts.
- `GET /api/v1/products/:id/alternatives`: Fetch alternative products and competitive vendor pricing for substitution analysis.

---

# 2. FRONTEND & UI ARCHITECTURE (`apps/web`)

### A. Feature Structure (`src/features/products`)
- `components/` — Product Catalog Grid, Product Economics Dashboard, Price History Chart, Reorder Advisory Card, and Supplier Comparison Matrix.
- `api/` — Typed API client fetching product intelligence and catalog metrics.
- `hooks/` — React Query hooks managing product state and analytics caching.

### B. Clean UI Specifications
1. **Product Catalog & Directory View:**
   - Searchable, filterable table showing SKUs, product names, categories, average purchase prices (`tabular-nums`), and best-performing vendors.
2. **Product Intelligence Deep-Dive Modal / Page:**
   - **Economic KPI Cards:** Lowest Recorded Price vs. Current Price, Average Price, and Consumption Velocity.
   - **Price History Time-Series Chart:** Interactive line chart tracking unit price changes over time with supplier data points.
   - **Best-Performing Vendor Badge:** Highlights the optimal supplier for this item with cost-saving callouts.
   - **Reorder Recommendation Widget:** Actionable card suggesting optimal reorder quantities and timing based on historical usage.
   - **Alternative Products & Suppliers Table:** Side-by-side comparison of substitute items or alternate vendors ranked by price competitiveness.

---

# 3. DOCUMENTATION & CHANGELOG REQUIREMENT
Per our `CLAUDE.md` protocol:
1. Reframe this prompt into a Principal-level engineering specification and append an entry to `docs/prompt-changelog.md`.
2. Update `docs/architecture.md` and `docs/api-reference.md` with the new product intelligence endpoints and economic metrics schema.