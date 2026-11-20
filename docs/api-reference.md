# API Reference

Base URL: `http://localhost:4000/api/v1`

## Conventions
- JSON only. `Content-Type: application/json` on requests with bodies (limit 100 kb).
- Optional header `x-api-key: <API_KEY>`: required on `POST`/`PATCH`/`DELETE /items` (the reference CRUD) only when the server has `API_KEY` set; otherwise `401 UNAUTHORIZED`.
- Tenant endpoints (`/ingestion`, `/vendors`, `/products`, `/transactions`) require a session cookie (see Authentication). A record belonging to another tenant is indistinguishable from a missing one: **`404 NOT_FOUND`**, never `403`.
- Rate limit: per IP on `/api` (default 300/min). Exceeding returns `429 RATE_LIMITED`; `RateLimit-*` headers are sent.
- Every response uses the envelope:

```jsonc
// success
{ "success": true, "data": <T>, "meta": { /* optional */ } }
// failure
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ /* optional */ ] } }
```

## Health

### `GET /health`
Pings MongoDB.

`200`
```json
{ "success": true, "data": {
  "status": "ok", "uptimeSeconds": 42, "timestamp": "2025-01-01T00:00:00.000Z", "version": "0.1.0",
  "db": { "status": "connected", "name": "procurement_intelligence" } } }
```
`503` `SERVICE_UNAVAILABLE` when the database is unreachable (`error.details` holds the report).

## Items

Item object:

| Field | Type | Notes |
|---|---|---|
| `id` | string | 24-hex ObjectId |
| `name` | string | 1–120 chars |
| `slug` | string | unique, lowercase kebab-case; derived from `name` if omitted on create |
| `description` | string | ≤ 2000, default `""` |
| `category` | string | ≤ 60, default `general` |
| `price` | number | ≥ 0 |
| `quantity` | integer | ≥ 0, default 0 |
| `status` | `active` \| `draft` \| `archived` | default `active` |
| `createdAt`, `updatedAt` | ISO string | |

### `GET /items`
Query: `page` (default 1), `limit` (1–100, default 20), `search` (case-insensitive match on name/slug/description), `status`, `category`, `sort` (`createdAt`, `-createdAt` (default), `name`, `-name`, `price`, `-price`).

`200` → `data: Item[]`, `meta: { page, limit, total, totalPages }`.

### `GET /items/:id`
`200` → `data: Item`. `400 VALIDATION_ERROR` if `id` is not a 24-hex string; `404 NOT_FOUND`.

### `POST /items`
Body: `name` (required), `price` (required), optional `slug`, `description`, `category`, `quantity`, `status`. Unknown fields are stripped.

`201` → `data: Item`. `400 VALIDATION_ERROR` (`details: [{ path, message, code }]`); `409 CONFLICT` if the slug exists.

### `PATCH /items/:id`
Body: any subset of the create fields, at least one.

`200` → updated `Item`. `400`, `404 NOT_FOUND`, `409 CONFLICT` (slug taken by another item).

### `DELETE /items/:id`
`200` → `data: { "id": "…", "deleted": true }`. `400`, `404`.

## Authentication

Sessions use an **HTTP-only cookie** named `accessToken` (JWT, HS256, `SameSite=Lax`, `Secure` in production, lifetime `JWT_EXPIRES_DAYS`, default 7). Non-browser clients may send `Authorization: Bearer <token>` instead. `/ingestion`, `/vendors`, `/products`, `/transactions`, `/advisory` and `/analytics` require a session and are **tenant-scoped** (see architecture.md); `/health`, `/reference`, `/auth/*` and the reference `/items` CRUD do not.

All user responses use `{ "user": { "id", "email", "organizationName", "tenantId", "createdAt", "baseCurrency", "country" } }`; password hashes are never returned. `baseCurrency` is the organization's reporting currency: every money figure in the API is in it.

### `POST /auth/signup`
Body: `email` (valid email, normalised to lower-case), `password` (8–72 bytes, at least one letter and one number), `organizationName` (2–120 chars), optional `baseCurrency` (a supported ISO code, default `INR`) and `country`. Creates a new tenant (the organisation) and its first user, and signs the user in (sets the cookie).
`201` → `{ user }`. Errors: `400 VALIDATION_ERROR` (`details: [{ path, message }]`), `409 EMAIL_TAKEN`, `429 RATE_LIMITED`.

### `POST /auth/login`
Body: `{ email, password }`. `200` → `{ user }` and sets the cookie. Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` (same message for unknown email and wrong password), `429 RATE_LIMITED` (failed attempts are counted per IP: `AUTH_RATE_LIMIT_MAX` per 15 minutes).

### `POST /auth/logout`
Clears the cookie. `200` → `{ "loggedOut": true }`. Always succeeds, even without a session. Tokens are stateless: a copied token stays valid until it expires (see the limitation noted in architecture.md).

### `GET /auth/me`
Requires a session. `200` → `{ user }`. `401 UNAUTHORIZED` if the cookie is missing, expired, tampered with, or the account no longer exists.

## Ingestion & normalisation (Module 1)

Source types (`sourceType`) and accepted files:

| sourceType | Files | Emits |
|---|---|---|
| `price_sheet` | `.csv`, `.xlsx` | `price_quote` per row (header synonyms: supplier/vendor, GSTIN/PAN, SKU, item, UOM, unit price, currency, date) |
| `tally` | `.xml` | Purchase voucher -> `invoice_line` per stock item; Payment -> `payment`; Sales -> `sale`; other voucher types skipped |
| `shopify` | `.csv` (orders or products export), `.json` (Admin-API `orders`/`products`) | `sale` (orders) / `price_quote` (products) |
| `bank_statement` | `.csv`, `.xlsx` | Debits -> `payment` (counterparty extracted from narration); credits skipped |
| `purchase_orders` | `.csv`, `.xlsx` | ERP PO line export -> `invoice_line` per line with a `procurement` block (requested/actual delivery, days late, on-time, lead time, budget unit price, discount/tax, contract id/type, maverick, single-source, preferred, invoice/payment status, department, cost centre). Supplier master data (country, region, tier, approval status, risk, ESG, payment terms) updates the vendor `profile`; item category/sub-category update the product. Cancelled lines are skipped. Header synonyms cover common ERP names (PO Number, Supplier Name, Item Description, Unit Price, Line Net, …) |
| `pdf_invoice` | `.pdf` | **Not enabled**: returns `501 NOT_IMPLEMENTED` until an extraction strategy is chosen |

### `POST /ingestion/jobs`
`multipart/form-data`. Requires a session; everything created is stored under the caller's tenant. Processing is synchronous; the job is returned when finished. Max file size `MAX_UPLOAD_MB` (default 10); max 20,000 rows.

| Field | Required | Notes |
|---|---|---|
| `file` | yes | one file |
| `sourceType` | yes | see table |
| `dayFirst` | no | `true` (default) / `false`: how to read ambiguous dates like `03/04/2025` |
| `defaultCurrency` | no | ISO code used when a row has no currency (default: the organization's base currency) |
| `allowDuplicate` | no | `true` re-processes a file already ingested; transactions are still de-duplicated |

`201` → IngestionJob:
```jsonc
{ "id": "…", "sourceType": "price_sheet", "filename": "price-sheet.csv", "fileHash": "<sha256>",
  "status": "completed_with_errors",           // processing | completed | completed_with_errors | failed
  "stats": { "rowsParsed": 5, "rowsSkipped": 0, "rowsFailed": 1, "transactionsCreated": 5, "duplicatesIgnored": 0,
             "vendorsCreated": 3, "vendorsMatched": 2, "productsCreated": 3, "productsMatched": 2, "needsReview": 0 },
  "rowErrors": [ { "rowNumber": 7, "message": "Missing or unreadable unit price" } ] }   // capped at 200
```
Errors: `400 UNSUPPORTED_FILE_TYPE`, `400 FILE_REQUIRED`, `400 EMPTY_FILE`, `400 VALIDATION_ERROR`, `409 DUPLICATE_FILE` (`details.jobId` = prior job), `413 PAYLOAD_TOO_LARGE`, `422 PARSE_FAILED` (`details.jobId` = failed job), `501 NOT_IMPLEMENTED`.

Row-level failures never fail the job: they are listed in `rowErrors`, stored as raw records with `status: "error"`, and counted in `rowsFailed`.

### `GET /ingestion/jobs`
Query: `page`, `limit`. `data: IngestionJob[]` + pagination `meta`.

### `GET /ingestion/jobs/:id`
`200` IngestionJob; `404`.

### `GET /ingestion/records/:id`
One raw source row: `{ id, jobId, rowNumber, payload, status, error? }` (used to show a transaction's original source payload). `404` if unknown.

`reviewPending` (number) is included on every IngestionJob returned by `POST /ingestion/jobs`, `GET /ingestion/jobs` and `GET /ingestion/jobs/:id`: how many of the job's vendors/products are still `needs_review`.

### `GET /ingestion/jobs/:id/records`
Original source rows. Query: `page`, `limit`, `status` (`normalized` | `error`). Each: `{ id, jobId, rowNumber, payload, status, error? }`.

## Vendors

Vendor: `{ id, name, normalizedName, aliases[], taxId?, status: active | needs_review | merged, possibleDuplicateOf?, similarityScore?, mergedInto?, mergeHistory[] }`.

Matching order: tax id → exact normalised name/alias (legal suffixes such as Pvt/Private/Ltd/Limited/LLC/Corp removed) → fuzzy similarity: ≥ 0.90 attaches as alias; 0.75–0.90 creates a new vendor with `status: needs_review` and `possibleDuplicateOf`.

- `GET /vendors`: the vendor directory with headline metrics. Query: `page`, `limit`, `search` (name/alias/taxId), `status`, `hideMerged` (`true`/`false`, default `false`), `sort` (`name` (default), `-name`, `totalSpend`, `-totalSpend`, `orderCount`, `-orderCount`, `lastPurchaseDate`, `-lastPurchaseDate`). Each vendor additionally carries:

  ```jsonc
  { "paymentTermsDays": 30, "paymentTerms": "Net 30",          // null / null when not configured
    "summary": { "totalSpend": 76275, "totalPaid": 57400, "orderCount": 3,
                 "lastPurchaseDate": "2025-06-04T00:00:00.000Z",
                 "avgDaysBetweenOrders": 30, "frequencyStatus": "monthly" } }   // weekly|monthly|quarterly|occasional|insufficient_data
  ```
  Sorting and pagination happen in the database (`$lookup` + `$facet`); `avgDaysBetweenOrders` is computed for the returned page only.
- `GET /vendors/compare?productIds=<id,id,…>&baselineVendorId=<id>&includeSimilar=true`: cross-vendor comparison, see **Vendor intelligence** below. Declared before `/:id`.
- `GET /vendors/:id/intelligence?granularity=month|quarter`: the deep-dive payload, see below.
- `GET /vendors/:id`
- `PATCH /vendors/:id`: `{ name?, status?: "active", paymentTermsDays?: 0–365 | null }`. `status: "active"` confirms a flagged vendor is distinct; `paymentTermsDays` configures terms (`null` clears them, since terms cannot be extracted from the ingested files). `409` if merged.
- `POST /vendors/:id/merge`: `{ "targetId": "…" }`. Moves aliases, re-points transactions, marks the source `merged`. Response `{ vendor, transactionsMoved }`. `400` if same id; `409` if either vendor is already merged.

## Vendor intelligence (Module 2)

All metrics are computed **on demand** with MongoDB aggregation pipelines, strictly within the caller's tenant (another tenant's vendor/product is `404`). Money is in **INR** (`amountBase`, converted with the rate stored on each row); prices are **INR per base unit** (`unitPriceBase`), so different currencies and units compare directly.

**How the Module 1 data maps to the metrics** (one `Transaction` per source line):
- *Purchases* = `invoice_line` rows. An *order* = the lines sharing a `reference` (a lone line counts as one order).
- *Price points* = `invoice_line` + `price_quote` rows with a unit price (so supplier price lists feed trends and comparisons, marked `purchase` vs `quote`).
- *Payments* = `payment` rows (Tally payment vouchers, bank debits). The same payment recorded in two **different** sources (same amount within 7 days) is counted once; the bank record is kept (actual cash date). The number excluded is reported in `dataQuality.duplicatePaymentsExcluded`.
- **Not captured by any source (reported honestly, not invented):** lead times (`leadTimeDays` is `null`, `dataQuality.leadTimes = "not_captured"`), payment terms (configure with `PATCH`), and tax breakdowns.

### `GET /vendors/:id/intelligence`
Query: `granularity` = `month` (default) or `quarter`. `404` for unknown/other-tenant vendors, `400` for a bad granularity.

```jsonc
{ "vendor": { "id", "name", "taxId", "status" }, "currency": "INR", "generatedAt": "…",
  "summary": { "totalSpend", "totalPaid", "orderCount", "invoiceLineCount", "avgOrderValue",
               "firstPurchaseDate", "lastPurchaseDate", "daysSinceLastPurchase",
               "avgUnitPrice", "productCount" },
  "frequency": { "avgDaysBetweenOrders", "status", "ordersConsidered" },
  "paymentTerms": { "termsDays", "label", "source": "configured|not_set", "avgDaysToPay", "onTimeRate",
                    "invoicesPaid", "invoicesOutstanding", "outstandingAmount", "unappliedCredit", "method": "fifo-estimate" },
  "priceConsistency": { "volatilityCv", "stabilityIndex", "rating": "stable|moderate|volatile|insufficient_data", "productsAssessed" },
  "priceHistory": { "granularity", "inflationPct",
                    "series": [ { "productId", "name", "baseUnit", "changePct",
                                  "points": [ { "period": "2025-04", "avgPrice", "minPrice", "maxPrice", "samples" } ] } ] },
  "products": [ { "productId", "name", "sku", "baseUnit", "unitsSupplied", "totalSpend", "firstPrice", "lastPrice",
                  "lastPriceKind": "purchase|quote", "lastDate", "avgPrice", "minPrice", "maxPrice",
                  "priceChangePct", "pricePoints", "volatilityCv" } ],
  "alternatives": { "comparedProducts", "productsWithAlternatives", "items": [ /* ProductComparison, see below */ ] },
  "dataQuality": { "invoiceLinesWithoutBaseAmount", "leadTimes": "not_captured", "duplicatePaymentsExcluded" } }
```

**Metric definitions**
| Metric | Definition |
|---|---|
| Total purchase value | Sum of `amountBase` over the vendor's `invoice_line` rows (INR). Lines without a base amount (unknown currency) are excluded and counted in `dataQuality`. |
| Average product price | Mean `unitPriceBase` over all the vendor's price points, weighted by point count. Mixes base units across products, so use the per-product figures for decisions. |
| Historical price changes | Per product, average `unitPriceBase` per month/quarter; `changePct` = first→last period; `inflationPct` = mean of those per-product changes. |
| Purchase frequency | Mean days between consecutive orders = (last − first) / (orders − 1). Status: ≤10d weekly, ≤45d monthly, ≤135d quarterly, else occasional; fewer than 2 dated orders → `insufficient_data`. |
| Payment delay | **Estimate.** Invoices (by order date) and payments are replayed in date order; each payment settles the oldest open invoice first (FIFO), early payments are held as credit. `avgDaysToPay` is the mean days from invoice to settling payment; `onTimeRate` is the share paid within the configured terms. Payments are not linked to invoices in the source data. |
| Price consistency | Coefficient of variation (population std-dev ÷ mean) of unit prices per product (2+ points); vendor CV = mean across products. `stabilityIndex` = 100 − 200×CV (clamped 0–100). CV < 5% stable, < 15% moderate, else volatile. |
| Products supplied | One row per canonical product: units supplied (sum of `baseQuantity` on invoice lines, in the base unit), spend, first/last/avg/min/max price, and the latest price with its kind (purchase or quote). |

### `GET /vendors/compare`
Query: `productIds` (required, comma-separated, 1–20 ids), `baselineVendorId` (optional), `includeSimilar` (default `true`). `400` on missing/malformed ids, `404` if none of the products exist in the tenant.
`200` → `data: ProductComparison[]`, `meta: { productCount, currency, priceBasis }`.

```jsonc
{ "product": { "id", "name", "sku", "baseUnit" },
  "alternativeCount": 1,
  "suppliers": [ { "rank": 1, "vendorId", "vendorName", "productId", "productName",
                   "matchType": "identical|similar", "similarity": 1, "isBaseline": false,
                   "lastPrice": 71.2, "lastPriceKind": "quote", "lastDate", "avgPrice", "minPrice", "maxPrice", "pricePoints",
                   "volatilityCv": 0.0164, "stability": "stable", "leadTimeDays": null,
                   "isCheapest": true, "deltaVsCheapestPct": 0, "deltaVsBaselinePct": -5.69 } ] }
```
- *identical* = the same canonical product; *similar* = another product in the tenant with the same base unit and name similarity ≥ 0.75 (a plausible substitute, labelled with its own name and score).
- Suppliers are **ranked by latest INR price per base unit**, ties broken by price stability. `deltaVsBaselinePct` is negative when cheaper than the baseline vendor (`null` without a baseline); `deltaVsCheapestPct` is relative to rank 1.

## Products

Product: `{ id, name, normalizedName, sku?, aliases[], baseUnit, dimension, status: active | needs_review, possibleDuplicateOf? }`. Matching: SKU → exact name/alias → fuzzy (≥ 0.92 attach; 0.80–0.92 `needs_review`).

- `GET /products`: the catalog with headline economics. Query: `page`, `limit`, `search` (name/alias/SKU), `status` (`active` | `needs_review` | `merged`), `dimension` (`count` | `mass` | `volume` | `length` | `area` | `time` | `data` | `service`), `category`, `hideMerged` (default `false`), `sort` (`name` (default), `-name`, `totalSpend`, `-totalSpend`, `currentPrice`, `-currentPrice`, `avgPurchasePrice`, `-avgPurchasePrice`). Each product additionally carries `leadTimeDays`, `safetyStockDays` (nullable) and:

  ```jsonc
  "summary": { "totalSpend": 70175, "spendSharePct": 82.29, "unitsPurchased": 950, "purchaseCount": 3,
               "avgPurchasePrice": 73.8684,                       // quantity-weighted, INR per base unit
               "currentPrice": 75.5, "currentPriceKind": "purchase", "currentPriceDate": "…",   // latest purchase, else latest quote
               "primaryVendor": { "id", "name" },                 // highest purchase spend
               "bestVendor":    { "id", "name", "score": 93.1 },  // composite score, see below
               "vendorCount": 2 }
  ```
  Sorting/pagination run in the database; `spendSharePct` and `bestVendor` are computed for the returned page. Products carry `category`/`subCategory` when a purchase-order export supplies them; filter with `category` or by unit type (`dimension`).
- `GET /products/:id`
- `GET /products/:id/intelligence?asOf=<ISO date>`: the economics deep-dive (below). `asOf` evaluates stock/reorder status as of a date (default now).
- `GET /products/:id/alternatives?includeSimilar=true`: same-product alternative suppliers plus substitute products (below).
- `PATCH /products/:id`: `{ status?: "active", leadTimeDays?: 0–365 | null, safetyStockDays?: 0–365 | null }`. `status: "active"` confirms a flagged product is distinct; the two settings configure reorder inputs (`null` clears them). `409` if merged.
- `POST /products/:id/merge`: `{ "targetId": "…" }`. Moves aliases, re-points transactions, marks the source `merged`. Response `{ product, transactionsMoved }`. `400` same id; `409` if either is already merged.

## Product intelligence (Module 3)

Computed **on demand** with tenant-matched aggregation pipelines (another tenant's product is `404`). Money is **INR**; prices are **INR per base unit** (`unitPriceBase`); quantities are in the product's base unit. A *purchase* is an `invoice_line` (what was paid); a *quote* is a `price_quote` (what a supplier offered). **Not captured by any source and therefore never invented:** lead times (configurable per product; a default of 14 days is used and flagged), stock on hand (estimated from purchase velocity) and supplier delivery performance (reliability is a proxy).

### `GET /products/:id/intelligence`
```jsonc
{ "product": { "id", "name", "sku", "baseUnit", "dimension", "status", "leadTimeDays", "safetyStockDays" },
  "currency": "INR", "asOf": "…", "generatedAt": "…",
  "summary": { "totalSpend", "spendSharePct", "unitsPurchased", "purchaseLines", "orderCount", "vendorCount",
               "weightedAvgPurchasePrice", "meanPurchasePrice", "currentPrice": PricePoint|null,
               "firstPurchaseDate", "lastPurchaseDate" },
  "priceComparison": { "currentVsLowestPct", "currentVsAveragePct" },          // + = paying more
  "lowestPurchase": PricePoint|null, "highestPurchase": PricePoint|null, "lowestQuote": PricePoint|null,
  "history": { "points": [PricePoint], "truncated": false },                   // chronological, last 500
  "fluctuation": { "basis": "purchases|all_observations", "changePct", "avgMonthOverMonthPct", "trendPctPerMonth",
                   "trend": "rising|falling|flat|insufficient_data", "rangePct", "volatilityCv",
                   "stability": { "index", "rating" }, "monthly": [ { "period": "2025-04", "avgPrice", "changePct" } ] },
  "bestVendor": { …VendorScore, "onlySupplier", "savings": { "cheapestVendorId", "cheapestVendorName", "perUnit", "pct", "onHistoricalVolume" } | null, "method" } | null,
  "vendors": [VendorScore],
  "consumption": { "unit", "velocityPerDay", "velocityPerMonth", "avgOrderQty", "avgDaysBetweenOrders", "ordersConsidered", "basis": "purchase_volume" } | null,
  "reorder": { "status": "order_now|order_soon|ok|insufficient_data", "leadTimeDays", "leadTimeSource": "configured|assumed_default",
               "safetyStock", "safetyStockMethod": "configured_days|statistical|fallback_percentage", "reorderPoint",
               "recommendedOrderQty", "coverDays", "estimatedStockOnHand", "daysOfCoverRemaining", "orderByDate",
               "estimatedOrderCost", "assumptions": [..] },
  "alternatives": { "baselineVendor", "cheaperVendorCount", "vendors": [SupplierRow], "substitutes": [Substitute] },
  "dataQuality": { "leadTimes", "stockOnHand": "not_tracked", "reliability": "proxy", "purchaseLinesWithoutQuantity" } }
```
`PricePoint` = `{ date, price, kind: "purchase|quote", vendorId, vendorName, quantity, reference }`. `VendorScore` = `{ rank, vendorId, vendorName, score, breakdown: { price, stability, reliability }, lastPrice, lastPriceKind, lastDate, avgPrice, minPrice, maxPrice, pricePoints, purchaseCount, volatilityCv, stability, isCurrentSupplier }`.

**Metric definitions**
| Metric | Definition |
|---|---|
| Historical purchase price | Chronological purchase and quote points (`history.points`); quotes are marked so charts can distinguish what was paid from what was offered. |
| Lowest recorded purchase price | Minimum `unitPriceBase` over purchases, with vendor, date and reference (earliest wins a tie). `lowestQuote` is reported separately. |
| Average purchase price | `weightedAvgPurchasePrice` = Σ(unit price × base quantity) / Σ base quantity over purchases; `meanPurchasePrice` is the simple mean. |
| Current price | The latest purchase price; the latest quote when there are no purchases (`kind` says which). |
| Best-performing vendor | Composite 0–100 over each supplier's price points for this product: **50% price** (100 × lowest latest price ÷ vendor latest price) + **25% stability** (price-stability index; 50 when too few points) + **25% reliability proxy** (60% history depth: purchases count fully, quotes half, saturating at 5; 40% recency: 100 at the product's newest observation falling to 0 over 180 days behind it). Delivery performance is not captured, so reliability is a proxy. `savings` compares the cheapest supplier's latest price with the current price (and what past volume would have saved). |
| Price fluctuation | Monthly average price (purchases when 2+ purchase months exist, else all observations). `monthly[].changePct` is month-over-month (gaps between recorded months are converted to a per-month rate); `avgMonthOverMonthPct` their mean; `trendPctPerMonth` a least-squares slope as % of the mean (rising > +0.5, falling < −0.5); `rangePct` = (max − min) ÷ min; `volatilityCv` and `stability` as in Module 2. |
| Consumption velocity | Purchase volume as a consumption proxy: units bought at order *i* are assumed consumed until order *i+1*, so velocity = Σ quantities except the last ÷ days between first and last order (same-day orders merged; needs 2+ dates). |
| Reorder plan | Reorder point = velocity × lead time + safety stock. Safety stock = configured days × velocity; else z (1.65, ≈95%) × σ(interval demand) × √lead time with 3+ orders; else 25% of lead-time demand. Recommended quantity = ⌈velocity × typical cycle (mean days between orders)⌉. Estimated stock = last order quantity − velocity × days since (assumes it was received in full). Status: `order_now` when stock ≤ reorder point, `order_soon` within 14 days of consumption above it, else `ok`; `orderByDate` is when stock is expected to reach the reorder point. |

### `GET /products/:id/alternatives`
Query: `includeSimilar` (default `true`). `404` for unknown/other-tenant products.
```jsonc
{ "currency": "INR", "priceBasis": "latest INR price per base unit", "product": {…},
  "baselineVendor": { "id", "name", "lastPrice" } | null,   // the primary vendor (highest purchase spend)
  "cheaperVendorCount": 1,
  "vendors": [ SupplierRow ],                                // same canonical product, ranked by latest price; deltaVsBaselinePct < 0 = cheaper
  "substitutes": [ { "product": { "id", "name", "baseUnit", "similarity" }, "suppliers": [SupplierRow],
                     "cheapestPrice", "cheapestVendor", "deltaVsCurrentPct" } ] }
```
Substitutes are other catalog products with the same base unit and name similarity ≥ 0.75. `SupplierRow` is the shape documented under vendor comparison (`leadTimeDays` is always `null`).

## Advisory (Module 5)

Deterministic detectors find conditions in the tenant's own lines; each becomes an **insight** with a severity, a confidence, a quantified impact with its formula (`impact.basis`), the full evidence packet, and plain-language text. Text comes from built-in templates, or from Claude when `ANTHROPIC_API_KEY` is set; every number in AI text must exist in the evidence (or be a rounding of one), otherwise the template is used (`fallbackReason`). Money is in the organization's base currency (`impact.amountInr` keeps its historical name).

| Type | Fires when | Impact |
|---|---|---|
| `COST_CREEP` | average price paid in the recent 30/60/90 days is >= 2% above the window before (per product, plus one spend-weighted portfolio signal). Noisy products need 8+ lines per window and a one-sided Mann–Whitney p < 0.01; the portfolio signal needs the pooled price-index test to pass too | extra cost at recent volumes |
| `SUPPLIER_VARIANCE` | a supplier we buy from is >= 4% above the cheapest peer and consistently higher month by month (noisy products: 8+ lines each side, p < 0.01) | Σ qty × gap |
| `CONSOLIDATION` | a product bought from >= `minVendors` suppliers (per product), or, for noisy items, one signal per **category** using supplier median prices (confidence LOW, indicative) | Σ qty × (price − best price) |
| `REORDER_ALERT` | estimated stock is at/below the reorder point (needs 3+ orders; skipped when buying has gone quiet). Lead time: configured, else **measured** P75 of PO lead times (5+ lines, 12 months), else a flagged 14-day default. HIGH only with a configured lead time | order value at stake |
| `MARKET_SAVINGS` | a verified, sourced, fresh benchmark is >= 3% below the price paid | gross difference |
| `SOURCING_SHIFT` | in a category, a supplier with 8+ lines has a significantly lower price index than the incumbent (one-sided Mann–Whitney, p < 0.05) and a higher composite score (price 40 / delivery 30 / risk 15 / ESG & compliance 15) | incumbent's 12-month spend × index gap |
| `DELIVERY_RISK` | portfolio on-time rate < 85%, or a supplier whose Wilson 95% upper bound is below the portfolio rate | spend delivered late / supplier spend |
| `MAVERICK_SPEND` | off-contract (maverick) share of a category's PO spend >= 10% | premium paid if significant, else maverick spend |
| `BUDGET_OVERRUN` | lines priced above the budget unit price cost >= 3% of the category's spend | Σ (price − budget) × qty |
| `SUPPLY_RISK` | >= 25% of a category's spend is with high-risk suppliers | spend at risk |

**Price index** = line unit price ÷ the item's median price over 24 months, so items of very different value can be pooled per category; thin samples are shrunk toward 1 (`(n·median + 5)/(n + 5)`). **Noise guard:** a product is "noisy" when the pooled within-supplier coefficient of variation exceeds 10% (or, with < 3 repeat prices, the product-wide CV does), or it has 20+ purchases; single-price comparisons are then replaced by significance tests. At most 8 insights per type are kept per scan (the rest counted in `suppressedByCap`).

| Method & path | Body / query | Returns |
|---|---|---|
| `GET /advisory/summary` | — | `activeTotal`, `byType{count, potentialSavings}`, `bySeverity`, `byStatus`, `lastScan`, `llmEnabled` |
| `GET /advisory/insights` | `page`, `limit` (≤100), `type`, `severity`, `status` (`ACTIVE` default, `ACTIONED`, `SNOOZED`, `DISMISSED`, `ALL`), `includeStale` | paged insights |
| `GET /advisory/insights/:id` | — | insight + `evidence`, `rfq` hint, `statusHistory` |
| `POST /advisory/generate` | `{ asOf?, windowDays? (30/60/90), minVendors? (2–10, default 3) }` | scan result (`asOf`, `asOfReason` = `requested`/`now`/`latest_data`, `byType`, created/updated/unchanged/reopened/markedStale, narration counts). `409 SCAN_IN_PROGRESS` if one is running |
| `PATCH /advisory/insights/:id/status` | `{ status, snoozeDays? (1–180), note? }` | updated insight |
| `POST /advisory/insights/:id/rfq-draft` | `{ vendorIds?, targetQuantity?, notes? }` | RFQ subject, body, checklist (units and currency stated) |
| `GET /advisory/benchmarks` | `productId?` | benchmarks |
| `POST /advisory/benchmarks` | `{ productId, priceBase, sourceName, sourceUrl?, observedAt, verified?, notes? }` (`verified` requires `sourceUrl`) | `201` benchmark |
| `DELETE /advisory/benchmarks/:id` | — | success envelope |

All ids are tenant-scoped: another organization's insight or product returns `404`.

## Analytics overview

### `GET /analytics/overview`
Query: `months` (3–36, default 12). Unknown parameters are rejected (`400 VALIDATION_ERROR`).

Dashboard aggregate for the signed-in organization over the trailing `months` calendar months ending at the analysis date (today, or the latest data when it is more than 45 days old, as in Advisory). Spend is **what was paid** (`invoice_line`, `amountBase`, in the organization's base currency). KPIs whose source fields are absent are `null`, never estimated.

```jsonc
{ "currency": "GBP", "country": "United Kingdom", "asOf": "2024-09-30", "asOfReason": "latest_data",
  "window": { "from": "2023-10-01", "to": "2024-09-30", "months": 12 },
  "kpis": { "spend": 129195024.83, "priorSpend": 145839887.46, "spendChangePct": -11.4, "purchaseLines": 762,
            "activeSuppliers": 15, "productsBought": 51, "totalSuppliers": 16, "totalProducts": 51,
            "onTimePct": 65.5, "deliveriesMeasured": 762,      // PO lines with an on-time flag
            "maverickPct": 12.4,                               // share of PO spend flagged maverick
            "contractCoveragePct": 59.1,                       // share of PO spend with a contract id (NO-CONTRACT excluded)
            "budgetVariancePct": -8 },                         // Σ price×qty vs Σ budget price×qty, lines with a budget
  "monthly": [ { "month": "2024-09", "spend": 14534881.89, "lines": 69, "onTimePct": 72.5, "maverickSpend": 1935732.34 } ],
  "byCategory": [ { "category": "IT Software", "spend": 41739713.06, "sharePct": 32.3, "categories": 1 } ],  // top 7 + "Other"
  "topSuppliers": [ { "vendorId": "…", "name": "Quantum Electronics", "country": "Taiwan", "spend": 15918450.11, "sharePct": 12.3, "lines": 58, "onTimePct": 67.2 } ],
  "insights": { "active": 31, "byType": { "SOURCING_SHIFT": 5 }, "bySeverity": { "HIGH": 3, "MEDIUM": 20, "LOW": 8 }, "potentialSavings": 5369906.31, "costIncrease": 0 },
  "sources": [ { "sourceType": "purchase_orders", "transactions": 2126 } ] }
```

## Transactions

Unified record for every source. Always traceable: `jobId`, `rawRecordId`, `sourceType`, `reference`.

| Field | Notes |
|---|---|
| `kind` | `invoice_line` \| `price_quote` \| `payment` \| `sale` |
| `vendorId`, `productId` | populated on read: vendor `{ id, name, status, taxId }`, product `{ id, name, sku, status, baseUnit }` |
| `date` | UTC date, or absent if unparseable (see `warnings`) |
| `quantity`, `unit`, `baseQuantity`, `baseUnit` | unit normalised (e.g. `dozen` → `pcs` ×12, `Kgs` → `kg`) |
| `unitPrice`, `amount`, `currency` | as reported; currency normalised to ISO |
| `fxRate`, `amountBase`, `unitPriceBase` | in the organization's base currency (`Tenant.baseCurrency`, default INR); rate exactly 1 when the row is already in it; `unitPriceBase` is per base unit |
| `procurement` | purchase-order context (present for `purchase_orders` rows only), see Ingestion |
| `warnings[]` | `UNKNOWN_UNIT:x`, `UNKNOWN_CURRENCY:XYZ`, `NO_FX_RATE:XYZ`, `INVALID_DATE`, `MISSING_DATE`, `MISSING_VENDOR`, `ASSUMED_UNIT_PCS` |

Idempotency: each row has a fingerprint (source, kind, vendor, reference, date, SKU/product, quantity, price/amount); identical rows across different files never create duplicates.

- `GET /transactions`: query `page`, `limit`, `kind`, `sourceType`, `vendorId`, `productId`, `jobId`, `reference` (exact), `search` (reference/description), `from`, `to`, `sort` (`date`, `-date` (default), `amountBase`, `-amountBase`).
- `GET /transactions/:id`

## Reference data

`GET /reference` → `{ units: [{ unit, dimension, factorToBase, baseUnit, aliases }], currency: { baseCurrency: "INR", ratesToBase } }`. FX rates are static defaults (see `modules/reference/currency.ts`); cross rates between any two supported currencies are derived from them. Unit dimensions: `count`, `mass`, `volume`, `length`, `area`, `time`, `data`, `service` (count-like units such as box, shipment, campaign and job are their own base).

## Error codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod/Mongoose validation failed; see `details` |
| 400 | `INVALID_JSON` | Malformed JSON body |
| 400 | `INVALID_ID` | Mongoose cast failure |
| 400 | `BAD_REQUEST` | Other client error (e.g. un-derivable slug) |
| 401 | `UNAUTHORIZED` | No/invalid/expired session, or invalid `x-api-key` on `/items` |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password at login |
| 409 | `EMAIL_TAKEN` | Signup with an email that already has an account |
| 400 | `UNSUPPORTED_FILE_TYPE` / `FILE_REQUIRED` / `EMPTY_FILE` / `UPLOAD_ERROR` | Ingestion upload problems |
| 404 | `NOT_FOUND` | Unknown resource or route |
| 409 | `CONFLICT` / `DUPLICATE_KEY` | Unique constraint violated |
| 409 | `DUPLICATE_FILE` | Identical file already ingested |
| 413 | `PAYLOAD_TOO_LARGE` | JSON body > 100 kb, or upload > `MAX_UPLOAD_MB` |
| 422 | `PARSE_FAILED` | File unreadable/invalid for the source type |
| 429 | `RATE_LIMITED` | Rate limit exceeded |
| 500 | `INTERNAL_ERROR` | Unexpected failure |
| 501 | `NOT_IMPLEMENTED` | Capability not enabled (PDF ingestion) |
| 503 | `SERVICE_UNAVAILABLE` | Database unreachable |

## Seed data (after `npm run db:seed`)
- Reference items: `fixture-laptop` (`000000000000000000000001`, active), `fixture-software-license` (`…0002`, draft), `fixture-legacy-printer` (`…0003`, archived), plus `generated-item-001…025`.
- Five demo organizations built from `datasets/Dataset_Procurement.xlsx` (password `Demo@12345`): `demo@procurement.test` (UK, GBP), `demo.de@procurement.test` (Germany, EUR), `demo.us@procurement.test` (US, USD), `demo.jp@procurement.test` (Japan, JPY), `demo.au@procurement.test` (Australia, AUD). See [demo-walkthrough.md](demo-walkthrough.md).
