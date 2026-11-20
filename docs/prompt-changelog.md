# Prompt Changelog

Append-only log of reframed commands and the architectural context behind each change. Newest entries at the bottom. Format is mandated by [CLAUDE.md](../CLAUDE.md). Briefs quoted below (e.g. `project-init.md`, `module-1-ui.md`) now live in [specs/](specs/README.md); entries keep the original wording.

---

## v0.1.0 — 2026-11-16 — Repository baseline

### Raw Prompt
> Follow `project-init.md` and initialise a repository with the mentioned setup.
> (`project-init.md`: scaffold a production-grade monorepo — Node/Express/TypeScript API, React/Vite/TypeScript web, MongoDB/Mongoose, Newman tests, deterministic seeding, living docs + prompt-history system.)

### Reframed Command
Create a production-grade npm-workspaces monorepo with:
1. **API** (`apps/api`): strict `Routes → Zod validation → Controller → Service → Model` layering; standard response envelope; helmet/cors/compression/pino-http; global error handler normalising Zod/Mongoose/duplicate-key/JSON errors; Zod-validated env; graceful shutdown; `health` module (DB ping) and reference `items` CRUD module.
2. **Web** (`apps/web`): feature-based structure with one-way `shared → features → pages` flow; typed Axios client whose interceptors enforce the envelope; System Status + Item Manager UI.
3. **Seeding** (`scripts/seed`): `faker.seed(42)`, explicit fixtures with known IDs/slugs, idempotent upserts, guarded reset; root `db:seed` / `db:reset`.
4. **Tests**: Postman Collection v2.1 + environment (health; create→read→update→delete→404; 400 validation) with `pm.test` assertions and variable chaining; Newman + htmlextra via `npm run test:api`.
5. **Infra/docs**: `docker-compose.yml` (Mongo replica set + healthcheck, Mongo Express), `.env.example`, root `CLAUDE.md` with the reframe/log/sync workflow rule, and four docs files.

**Acceptance criteria:** `npm install` succeeds; `npm run typecheck` and builds pass; `db:seed` is idempotent and reproducible; Newman suite passes against a seeded or empty DB; web shows live health and item CRUD.

### Architectural Context & Decisions
- npm workspaces (`@pi/api`, `@pi/web`, `@pi/seed`); shared `tsconfig.base.json` (strict).
- API is CommonJS + `tsx` for dev and `tsc` for build to avoid ESM import-extension friction; Express 4 with `asyncHandler`.
- Single root `.env` shared by API, seeders and Vite.
- MongoDB as a single-node replica set; connection requires `directConnection=true` from the host.
- Seeder imports the API `ItemModel` to prevent schema drift; upserts by slug with fixed `_id` set on insert.
- Optional `x-api-key` guard as the auth seam (no-op when `API_KEY` unset).
- Postman collection is generated from `build-collection.js` to keep assertions reviewable.

### Files / Features Added
- Root: `package.json`, `tsconfig.base.json`, `.env.example`, `.gitignore`, `docker-compose.yml`, `CLAUDE.md`
- `apps/api/**` (config, middleware, utils, `health` and `items` modules, `app.ts`, `server.ts`, `tests/postman/*`)
- `apps/web/**` (shared API client + UI, `health` and `items` features, dashboard page)
- `scripts/seed/**` (`seed.ts`, `reset.ts`, `data/items.ts`, `env.ts`)
- `docs/` (`architecture.md`, `setup-and-ops.md`, `api-reference.md`, `prompt-changelog.md`)

---

## v0.2.0 — 2026-11-16 — Module 1: Business Data Ingestion & Normalisation

### Raw Prompt
> We are building an intelligent, unified procurement platform designed for businesses to consolidate all their disparate supplier and purchasing data into a single source of truth. Right now, we are defining Module 1: Business Data Ingestion & Normalisation. In a typical enterprise, procurement data is scattered across messy, disconnected formats — scanned PDF invoices from local vendors, accounting ledgers from Tally, e-commerce syncs from Shopify, pricing spreadsheets in Excel, and payment entries in bank statements. Our objective with this module is to ingest all these disparate inputs, parse them reliably, resolve and deduplicate entities (vendors and products), normalize units and currencies, and store everything in a clean, unified MongoDB schema. This sets up a solid foundation for automated inventory tracking, expense analytics, and smart purchasing workflows.

Scope answers given by the user: implement **everything** (all five sources); **defer** the PDF parsing strategy decision.

### Reframed Command
Implement Module 1 as a source-agnostic ingestion pipeline: `upload → IngestionJob → parser adapter → normaliser → entity resolver → canonical Transaction`, with raw rows retained for traceability.

- **Sources:** price sheets (CSV/XLSX), Tally XML, Shopify (orders/products CSV, Admin-API JSON), bank statements (CSV/XLSX). PDF: define the adapter and API contract; return `501 NOT_IMPLEMENTED` until a strategy is chosen.
- **Normalisation:** amounts (Indian/EU formats, negatives), dates (ISO, YYYYMMDD, D/M/Y with `dayFirst`, textual months, Excel serials), units to dimension base units, currency to ISO + INR conversion with stored rate.
- **Entity resolution:** vendors (tax id, normalised name without legal suffixes, aliases, fuzzy matching with auto-attach and `needs_review` bands, merge with history) and products (SKU, name, fuzzy).
- **Edge cases:** whole-file re-upload (sha256), overlapping exports (row fingerprints), row-level failures not failing the job, unknown unit/currency flagged as warnings, malformed files (422), wrong extension (400), oversize (413), row cap.
- **Acceptance:** each parser tested against fixtures; re-ingest creates zero duplicates; "ACME Pvt Ltd"/"Acme Private Limited" resolve to one vendor; `1 dozen` = `12 pcs` base quantity; USD→INR converted; every transaction links to its raw record; docs, Postman and seeds updated.

### Architectural Context & Decisions
- Synchronous processing inside the request, bounded by `MAX_UPLOAD_MB` and a 20,000-row cap; queue/worker deferred.
- Pure parsers/normalisers (unit-tested without DB) separated from DB-touching resolver/service.
- Idempotency at two levels: file hash and per-row unique fingerprint (`$setOnInsert` upserts).
- Static FX table (documented, replaceable); the applied rate is persisted per transaction.
- Shopify supported via export files/API-shaped JSON; live API sync (credentials, pagination, webhooks) not included.
- PDF deferred by decision; `501` keeps the contract stable.
- Fuzzy matching is an in-memory scan per job; acceptable for current scale, noted for revisit.
- Seeds ingest the sample files through the real pipeline; samples are shared by seeds, unit tests and Newman (`workingDir`).

### Files / Features Added or Modified
- New API modules: `ingestion` (model, schema, service, controller, routes, `resolver.ts`, `normalise/*`, `parsers/*`), `vendors`, `products`, `transactions`, `reference`; `utils/mongooseJson.ts`.
- Modified: `app.ts` (routes), `config/env.ts` + `.env.example` (`MAX_UPLOAD_MB`), `middleware/errorHandler.ts` (Multer errors), `package.json` (multer, csv-parse, exceljs, fast-xml-parser; `test:unit`).
- Seeds: `scripts/seed/seed.ts` (ingest samples, clean ingestion collections), `scripts/seed/data/samples/*`.
- Tests: `apps/api/tests/unit/ingestion.test.ts`; Postman folder "4. Ingestion & normalisation", multipart support in `build-collection.js`, `workingDir` in `run-newman.js`.
- Docs: `api-reference.md`, `architecture.md`, `setup-and-ops.md`.

---

## v0.3.0 — 2026-11-16 — Module 1 UI: Ingestion Hub, Pipeline Tracker, Review Drawer, Data Explorer

### Raw Prompt
> Act as a Principal Frontend Engineer. Build a clean, enterprise-grade UI in `apps/web` for Module 1: Business Data Ingestion & Normalisation. (Full text in `module-1-ui.md`.) Feature architecture under `apps/web/src/features/ingestion` (`components/`, `hooks/`, `api/`, `types/`). A. Multi-source ingestion hub: 5 source cards, smart dropzone with client-side validation, file sizes, batch progress. B. Live pipeline tracker: PENDING / PARSING / NEEDS_REVIEW / PROCESSED / FAILED with expandable errors and Retry. C. Entity-resolution review drawer: raw vs suggested canonical match with confidence, Merge as Alias / Create New Entity. D. Tabbed canonical data explorer (Transactions, Vendors, Product Catalog) with line-item drilldown and raw payload link. UX: Linear/Stripe-style, tabular numbers, skeletons, empty states, accessibility. Docs per CLAUDE.md.

### Reframed Command
Build the Module 1 UI as a feature module that consumes the existing ingestion API without changing its contract, adding only the small backend capabilities the UI strictly needs.

- **Hub:** five source cards; extension + size validation per source mirrored from the backend; auto-starting upload queue (concurrency 2) with per-file and batch progress, retry, and "process again" for already-ingested files; `dayFirst` and default-currency options.
- **Tracker:** unified rows from the client queue (PENDING/PARSING/FAILED-before-job) and server jobs; `NEEDS_REVIEW` derived from live `reviewPending`; expandable row issues; Retry re-uploads the retained `File`.
- **Review:** per-job drawer of flagged vendors/SKUs with similarity score; *Merge as alias* (merge into suggested match) or *Create new entity* (confirm as distinct); tracker state updates immediately.
- **Explorer:** server-paginated, filterable grids; transaction drawer with all lines of the same document (reference + vendor), INR grand total, normalisation details/warnings and raw source payload; product drawer with cross-vendor price history and lowest-price highlight.
- **Edge cases:** empty/skeleton/error states; unsupported, oversize, empty or duplicate-in-queue files; server 409/501/422 errors surfaced per file; polling only while work is in flight; jobs from earlier sessions not retryable.
- **Acceptance:** web typecheck/build pass; review flow verified end-to-end against the API (flag, merge/confirm, `reviewPending` back to 0); keyboard/ARIA behaviours as listed in `architecture.md`.

### Architectural Context & Decisions
- **API contract deviation (deliberate):** the brief names `POST /api/v1/ingest/:source`; the implemented, tested contract is `POST /api/v1/ingestion/jobs` + `sourceType`. The UI follows the real API.
- **Status model:** backend processing is synchronous, so `PENDING`/`PARSING` are derived client-side; `NEEDS_REVIEW` comes from a new server-computed `reviewPending`.
- **Not implemented because the backend does not support it** (shown disabled/omitted, not faked): PDF/image invoice extraction (`501`), Tally JSON/CSV, bank PDFs, Shopify store-API connect, vendor payment terms, tax breakdowns.
- **Backend additions:** `GET /ingestion/records/:id`; `reviewPending` on jobs; `PATCH`/`merge` for products (`merged` status, resolver follows merges); `reference` and `search` filters on transactions; richer populate (vendor `taxId`/`status`, product `status`/`baseUnit`).
- **State:** a feature-level context owns the upload queue, polled jobs and review drawer (no global state library); `usePagedQuery` is shared infrastructure.
- No router/UI library added: minimal hash routing and hand-rolled accessible primitives.

### Files / Features Added or Modified
- Web `shared/`: `ui/{Drawer,Pill,EmptyState,Skeleton,Pagination,AppShell,components.css}`, `hooks/{usePagedQuery,useHashRoute}`, `lib/format.ts`, `api` (PageMeta).
- Web `features/ingestion/`: `types`, `api`, `sources.ts`, `status.ts`, `hooks/*`, `components/*`, `ingestion.css`, `index.ts`; `pages/IngestionPage.tsx`; `main.tsx` (shell + hash routes).
- API: `ingestion` (record lookup, `reviewPending`), `products` (confirm/merge, `merged` status), `ingestion/resolver.ts` (follows product merges), `transactions` (filters, populate).
- Samples: `scripts/seed/data/samples/price-sheet-needs-review.csv`.
- Docs: `architecture.md`, `api-reference.md`, `setup-and-ops.md`.

---

## v0.4.0 — 2026-11-16 — User authentication & multi-tenant ingestion

### Raw Prompt
> Act as a Principal Full-Stack Engineer. Implement User Authentication (Signup / Login / Logout) and secure Multi-Tenant Data Ingestion across the backend (`apps/api`), database (MongoDB), and frontend (`apps/web`). Every ingestion record, vendor, product, and transaction must be strictly isolated by `tenantId` (linked to the authenticated user/organization). (Full text in `user-setup.md`.) Backend: auth module with user model (email unique+indexed, passwordHash argon2/bcrypt, organizationName, timestamps), `POST /auth/signup` (Zod, hash, create user, default tenant profile), `POST /auth/login` (HTTP-only JWT cookie `accessToken`), `POST /auth/logout`, `GET /auth/me`, auth guard attaching `req.user = { userId, email, tenantId }` or 401; required `tenantId` on Vendors/Products/Transactions/RawStagingLogs with compound indexes `[tenantId, ...uniqueKeys]`; ingestion injects `req.user.tenantId` into every staged and canonical document. Frontend: `features/auth` with Signup/Login forms (Zod), global auth context, `RequireAuth` redirecting to `/login`; split-screen auth screens; navigation shell with organization name, tenant indicator, notification bell and avatar menu with Logout; the Ingestion Hub/Tracker/Explorer bound to the logged-in tenant with an empty-state for first uploads and zero cross-tenant leakage.

### Reframed Command
Add session-based authentication and make tenant isolation a hard, enforced property of every tenant-owned collection and every code path that reads or writes it.

- **Auth:** signup creates a Tenant + User and signs in; login/logout/me; bcrypt hashing; JWT in an HTTP-only, SameSite=Lax cookie (Bearer accepted for API clients); Zod validation; generic login errors; per-IP brute-force limits.
- **Isolation invariant:** `tenantId` comes only from the verified session, is required on every tenant model, is part of every unique/lookup index, and is part of every query (read, update, merge, delete, aggregate-like lookups). Another tenant's id behaves exactly like a non-existent id (`404`).
- **Edge cases:** duplicate email (incl. race: compensating tenant cleanup), weak/over-long passwords (bcrypt 72-byte limit), unknown-email timing, expired/tampered/`alg:none`/foreign-secret tokens, logout without session, token for a deleted user, same vendor/SKU/file in two tenants, merge/confirm across tenants, review counts across tenants, dev data created before tenancy.
- **Acceptance:** Newman proves the auth lifecycle and that a second tenant cannot read, modify, count or collide with the first one's data (and can ingest the same file); unit tests cover schemas and token verification; typecheck/build pass; UI gates all pages behind login.

### Architectural Context & Decisions
- **Tenant entity** separate from User (signup creates both) so multiple users per organization can be added without migrating data; `tenantId` is the isolation key.
- **bcryptjs** over argon2 to avoid native builds on Windows/CI; cost 12.
- **Stateless JWT**; logout clears the cookie only (documented limitation: no server-side revocation).
- **Services take `tenantId` explicitly**; entity resolver is per-tenant; `findOne({_id, tenantId})` replaces `findById` everywhere.
- **Scope:** `items` CRUD (global demo/reference resource), `reference` and `health` stay public; the legacy `API_KEY` guard now only protects `items` writes.
- **Convention deviation (deliberate):** auth files follow the repo layout (`modules/auth/{model,service,controller,guard,...}.ts`) instead of dotted names; the ingest endpoint remains `POST /ingestion/jobs` (see v0.3.0).
- **Frontend state:** React context (no Zustand dependency); hash routes `#/login`, `#/signup`; 401s sign the user out via a window event; page tree keyed by `tenantId`.
- **Notification bell** is a placeholder menu (no notification backend exists).
- Dev start-up syncs indexes to drop the pre-tenancy global unique indexes; production needs an explicit migration.

### Files / Features Added or Modified
- API new: `modules/auth/*`, `types/express.d.ts`; modified: `config/env.ts` (JWT/auth vars), `config/db.ts` (dev index sync), `middleware/rateLimiter.ts` (login/signup limiters), `app.ts` (cookie-parser, auth routes, `requireAuth` on tenant routers).
- API tenant scoping: models (`vendors`, `products`, `transactions`, `ingestion`), `ingestion/{service,controller,resolver,routes}.ts`, `vendors|products|transactions/{service,controller,routes}.ts`.
- Seed: demo tenant + user, samples ingested into it (`scripts/seed/seed.ts`).
- Tests: `tests/unit/auth.test.ts`; Postman folders "0. Authentication" and "5. Tenant isolation".
- Web new: `features/auth/*`, `pages/{LoginPage,SignupPage}.tsx`, `shared/ui/auth.css`; modified: `shared/api/client.ts` (credentials + 401 event), `shared/ui/AppShell.tsx` (tenant indicator, bell, user menu), `main.tsx` (providers, guarded routes).
- Config/docs: `.env.example`, `CLAUDE.md`, `docs/{architecture,api-reference,setup-and-ops,prompt-changelog}.md`.

---

## v0.5.0 — 2026-11-16 — Module 2: Vendor Intelligence

### Raw Prompt
> Act as a Principal Full-Stack Engineer. Build Module 2: Vendor Intelligence across the backend (`apps/api`), database aggregation pipelines, and frontend (`apps/web`). Compute and surface supplier analytics and benchmarking for every vendor from the normalized procurement database, strictly scoped by `tenantId`. (Full text in `vendor-intelligence.md`.) Backend `vendors/intelligence.service.ts` with aggregation pipelines for: total purchase value, average product price, historical price changes (month/quarter time series), purchase frequency (mean days between orders), payment terms with actual payment delay, price consistency (variance/CV), products supplied (last price, units), and alternative supplier comparison (rank by price, stability, lead time). Endpoints: `GET /vendors` (with Total Spend, Order Count, Last Purchase Date), `GET /vendors/:id/intelligence`, `GET /vendors/compare?productIds=`. Frontend `features/vendors`: Vendor Directory (searchable, sortable, spend in tabular-nums, frequency pills, payment terms), Intelligence deep-dive (hero metric cards: Total Spend, Avg Order Value, Price Stability Index, Purchase Cadence; interactive price trend chart; catalog & pricing table; alternative supplier comparison with price deltas such as "-12% cheaper"), sparklines, supplier comparison matrix, React Query hooks. Docs per CLAUDE.md.

### Reframed Command
Add an analytics layer over the tenant-scoped Module 1 data that answers, per vendor: how much do we spend, how often, at what and how stable prices, how fast do we pay, what do they supply, and who could supply it cheaper, and present it in a directory, a deep-dive and a comparison matrix.

- **Data-model reconciliation:** the brief assumes invoice documents with `financials.grandTotal`, `lineItems` and `issueDate`; the real model is one `Transaction` per line. Orders are rebuilt by grouping `invoice_line` rows on `reference`; price points combine `invoice_line` and `price_quote`; everything is compared in INR per base unit.
- **Metrics:** as defined in `docs/api-reference.md` (spend, average price, month/quarter price history with inflation, cadence, FIFO-estimated payment delay and on-time rate, coefficient-of-variation stability index, catalog with latest-vs-historical price, ranked alternatives with deltas vs a baseline vendor).
- **Edge cases:** vendors with only quotes (no spend); one order (cadence undefined); products with a single price point (CV undefined); unknown currency lines (excluded and counted); payments recorded in two sources (de-duplicated and reported); payments before invoices (credit); unpaid invoices (outstanding); merged vendors/products; similar-but-not-identical substitutes (similarity ≥ 0.75, same base unit); cross-tenant ids (404); malformed `productIds`/`granularity`/`sort` (400).
- **Acceptance:** pure math unit-tested; Newman verifies exact figures on a deterministic dataset (spend 76,275, 3 monthly orders, 17.5-day estimated payment delay, 18,875 outstanding, +% steel inflation, Bharat cheaper than Acme), validation errors and cross-tenant 404s; UI typechecks/builds; tenant switch clears client cache.

### Architectural Context & Decisions
- **On-demand aggregation, no cache** (spec allowed either): every pipeline is tenant-matched and index-backed; a materialised summary is the documented next step.
- **Directory sorts/paginates in the database** via `vendors → $lookup(transactions) → $addFields → $sort → $facet`; cadence is computed for the returned page only (so it is not a sort key).
- **Payment terms cannot be extracted**: added `paymentTermsDays` on vendors, set via `PATCH`; actual delay is a transparent FIFO estimate. **Lead time is not in any source**: returned as `null` and labelled, never fabricated.
- **Cross-source payment de-duplication** (same amount, different source, within 7 days; bank record kept) prevents Tally+bank double counting; the exclusion count is surfaced in the payload and the UI.
- **Rank = latest INR price per base unit**, tie-break by stability; similar-product matching reuses the Module 1 similarity function (threshold 0.75, same base unit).
- **Frontend:** React Query adopted (spec); chart is hand-written SVG (no chart dependency) with colour + marker shape + keyboard + data-table accessibility; query cache cleared on tenant change.
- Naming follows the spec for the new service (`intelligence.service.ts`) alongside the existing `service.ts`.

### Files / Features Added or Modified
- API new: `modules/vendors/intelligence.service.ts`, `modules/vendors/intelligence.math.ts`, `utils/regex.ts`; modified: `vendors/{model,schema,service,controller,routes}.ts` (payment terms, list via aggregation, `/compare`, `/:id/intelligence`).
- Tests: `tests/unit/intelligence.test.ts`; Postman folder "6. Vendor intelligence" plus a cross-tenant intelligence check in folder 5.
- Seed samples: `price-sheet-alternatives.csv`, `tally-purchases-q2.xml`, adjusted `bank-statement.csv` dates (cross-source payment), seeded for the demo tenant.
- Web new: `features/vendors/*` (types, api, hooks, display, components, css), `shared/ui/Sparkline.tsx`, `shared/hooks/useDebounced.ts`, `pages/VendorsPage.tsx`; modified: `main.tsx` (React Query provider, `#/vendors` route + nav, cache clear on tenant change), shared tab styles moved to `components.css`; dependency `@tanstack/react-query`.
- Docs: `api-reference.md`, `architecture.md`, `setup-and-ops.md`, `CLAUDE.md`, `prompt-changelog.md`.

---

## v0.6.0 — 2026-11-16 — Module 3: Product Intelligence

### Raw Prompt
> Act as a Principal Full-Stack Engineer. Build Module 3: Product Intelligence across the backend (`apps/api`), database aggregation pipelines, and frontend (`apps/web`). While Module 2 analyzed suppliers, Module 3 focuses on individual product economics: item-level cost analytics, supplier benchmarking and reorder insights per SKU, strictly scoped by `tenantId`. (Full text in `product-intelligence.md`.) Backend `products/intelligence.service.ts` with aggregation pipelines for: historical purchase price time series, lowest recorded purchase price (with vendor and date), average purchase price (weighted or arithmetic), best-performing vendor (composite of lowest unit price, reliability and price stability), price fluctuations (percentage variance, month-over-month trend), reorder quantity recommendations (consumption velocity, lead times, safety stock), alternative products or vendors. Endpoints: `GET /products` (Current Price, Spend Share, Primary Vendor), `GET /products/:id/intelligence`, `GET /products/:id/alternatives`. Frontend `features/products`: catalog grid (SKU, name, category, average purchase price, best vendor), economics deep-dive (KPI cards for lowest vs current price, average price, consumption velocity; interactive price history chart with supplier data points; best-performing vendor badge with savings callout; reorder recommendation widget; alternative products/suppliers table), supplier comparison matrix, React Query hooks. Docs per CLAUDE.md.

### Reframed Command
Add per-SKU economics on top of the tenant-scoped transaction data: what we paid (history, lowest, average, current), who supplies it best (scored), how the price moves, how fast we consume it and when/how much to reorder, and who or what could replace it cheaper; surface it in a catalog and a deep-dive.

- **Data reconciliation:** "purchase" = `invoice_line` rows; "quote" = `price_quote` rows (offers). Prices are INR per base unit. Products have no category field (filter by unit type). No source records lead time, stock on hand or delivery performance, so: lead time is a configurable product setting with a flagged default, stock is estimated from purchase velocity, and reliability is a transparent proxy. None of these is presented as measured.
- **Algorithms:** documented in `docs/api-reference.md` (weighted average, composite vendor score 50/25/25, month-over-month with gap annualisation and trend slope, consumption velocity from purchase volume, reorder point/quantity with statistical or configured safety stock, savings on historical volume).
- **Edge cases:** products with only quotes (no spend, average or consumption), a single purchase (velocity undefined → `insufficient_data`), same-day orders merged, undated points excluded from the chart but counted, purchase lines without quantity excluded from weighted metrics, one supplier only, suppliers with no purchases scored from quotes, merged vendors/products excluded, unknown product / other tenant → 404, invalid sort/asOf/lead-time → 400, stale data (everything "order now" unless `asOf` is supplied).
- **Acceptance:** pure math unit-tested; Newman verifies exact figures on the deterministic dataset (spend 70,175, 950 units, weighted average 73.8684, lowest paid 73, current 75.5, +1.70%/month rising, best vendor Acme with a 5.7% Bharat saving callout, 350 kg/month velocity, reorder point 204 and quantity 350, configured settings changing the plan), validation errors and cross-tenant 404s; UI typechecks/builds; analytics caches cleared on tenant change.

### Architectural Context & Decisions
- **On-demand aggregation** (tenant-matched, index-backed), consistent with Module 2; catalog sort/pagination in the database, enrichment (share, best vendor) per page.
- **Reuse over duplication:** alternatives call Module 2's `compareSuppliers`; shared math helpers; generic pills and chart markers promoted to `shared/ui` (features must not import each other).
- **Scoring weights are explicit constants and echoed in the response**; reliability is labelled a proxy in the payload and the UI.
- **`PATCH /products/:id` extended** with `leadTimeDays` / `safetyStockDays` (nullable to clear); the existing `{status:"active"}` review flow is unchanged.
- **`asOf` query parameter** makes the reorder plan reproducible and testable against historical demo data.
- Naming follows the spec for the new service (`intelligence.service.ts`).

### Files / Features Added or Modified
- API new: `modules/products/intelligence.service.ts`, `modules/products/intelligence.math.ts`; modified: `products/{model,schema,service,controller,routes}.ts` (reorder settings, list via aggregation, `/:id/intelligence`, `/:id/alternatives`).
- Tests: `tests/unit/product-intelligence.test.ts`; Postman folder "7. Product intelligence".
- Web new: `features/products/*` (types, api, hooks, components, css), `pages/ProductsPage.tsx`, `shared/ui/{Indicators,ChartMarker}.tsx`; modified: `main.tsx` (`#/products` route + nav), `features/vendors/display.tsx` (re-exports shared pills), shared analytics styles moved to `components.css`.
- Docs: `api-reference.md`, `architecture.md`, `setup-and-ops.md`, `CLAUDE.md`, `prompt-changelog.md`.

---

## v0.7.0 — 2026-11-17 — Module 5: Advisory (evidence-backed recommendations)

### Raw Prompt
> @recomendations.md implement this feature, you have full liberty to write own algorithms for recomendations
> (`recomendations.md`: an AI advisory layer that turns procurement data into plain-language, actionable recommendations: cost creep, supplier price variance, spend consolidation, reorder/stock-out alerts and market savings, with quantified impact, a command-center UI, insight lifecycle and RFQ drafting.)

### Reframed Command
Build a tenant-scoped advisory engine in which **numbers are computed deterministically and only the wording may come from an LLM**:
1. Pure detectors (`signals.math.ts`) over a tenant's priced lines: cost creep (30/60/90-day windows + spend-weighted portfolio), supplier variance (consistently pricier than a peer), consolidation (≥ N suppliers), reorder runway (estimated stock vs reorder point, skips products whose buying went quiet), market savings (verified, sourced, fresh benchmarks only). Each signal carries severity, confidence, quantified impact with its formula, the evidence packet and an RFQ hint.
2. Persistence with a stable fingerprint per condition: re-scans update instead of duplicating; insight lifecycle ACTIVE / ACTIONED / SNOOZED / DISMISSED with history; conditions no longer detected become stale; snoozed insights reopen when due.
3. Narration: templates by default; with `ANTHROPIC_API_KEY`, Claude rewrites from the evidence only and a **grounding guard** rejects any output containing a number not present in the evidence (fallback to template, reason recorded).
4. API: summary, paged/filterable insights, detail with evidence, scan (`asOf`, window, minVendors), status changes, RFQ draft, benchmarks CRUD. Cross-tenant ids 404.
5. Web: Advisory command center (category strip with counts and potential savings, scan control, filters, prioritised feed), evidence drawer per type, consolidation simulator, RFQ draft modal.
Acceptance: unit tests per detector and for grounding; Newman folder "8. Advisory" with exact counts and a grounding check; isolation tests.

### Architectural Context & Decisions
- **LLM is optional and never the source of numbers**; sending data externally only happens when the key is set (documented in `.env.example`).
- **`asOf` defaults to the latest data** when it is more than 45 days old, so historical datasets produce meaningful scans.
- Benchmarks must be verified **and** sourced to count; the impact is labelled *gross*.

### Files / Features Added or Modified
- API: `modules/advisory/{types,model,schema,signals.math,signals.service,grounding,narrator,advisory.service,rfq.service,controller,routes}.ts`; `app.ts`; env (`ANTHROPIC_API_KEY`, `ADVISORY_MODEL`, `ADVISORY_LLM_TIMEOUT_MS`, `ADVISORY_LLM_MAX_PER_RUN`).
- Tests: `tests/unit/advisory.test.ts`; Postman folder "8. Advisory".
- Web: `features/advisory/*`, `pages/AdvisoryPage.tsx`.
- Docs: `api-reference.md` (Advisory section), `architecture.md`, `setup-and-ops.md`, `.env.example`.

---

## v0.8.0 — 2026-11-19 — Reference dataset, sourcing algorithm, per-country demo businesses

### Raw Prompt
> Please look into the datasets here and use it to create a procurement algorithm for better recommendations. Also please update the demo data relevant to this dataset and show each and every functionality clearly.
> Follow-ups: currency: "create sample data on basis of the given countries itself. do not change the currency values, show the user in that country with sample business"; KPI CSV: skip; demo data: replace with the dataset; showcase: in-app guided tour, walkthrough document, pre-seeded review states.

### Reframed Command
1. **Ingest ERP purchase-order exports** as a first-class source (`purchase_orders`, CSV/XLSX): PO lines become purchases carrying procurement context (requested/actual delivery, days late, on-time, lead time, budget price, contract, maverick, single-source, invoice/payment status, department) and supplier/item master data (country, region, tier, approval status, risk, ESG; category/sub-category); cancelled lines are skipped; payment terms are *extracted* unless configured.
2. **Per-organization base currency** (`Tenant.baseCurrency`, `country`): amounts already in that currency are stored unchanged (rate exactly 1); the UI formats money in it.
3. **Sourcing algorithm** robust to the dataset's noise (within-supplier price CV ≈ 34% vs ≈ 5% true supplier differences): price index pooled per category with shrinkage, one-sided Mann–Whitney tests, Wilson intervals, a composite supplier score (price 40 / delivery 30 / risk 15 / ESG & compliance 15). New insight types: SOURCING_SHIFT, DELIVERY_RISK, MAVERICK_SPEND, BUDGET_OVERRUN, SUPPLY_RISK. Existing detectors gain a noise guard (significance tests on noisy items, category-level consolidation, measured lead times, per-type cap).
4. **Demo data:** five businesses (UK/GBP, DE/EUR, US/USD, JP/JPY, AU/AUD) from the dataset through the real pipeline, Q4 2024 held back as downloadable sample uploads; labelled demo benchmark, a supplier-name variant for review, one actioned and one snoozed insight.
Acceptance: no insight text contains an ungrounded number; sparse tenants stay quiet; unit + Newman suites green.

### Architectural Context & Decisions
- The dataset's currency labels are nominal (every supplier uses all five at the same scale), so splitting by currency and **not converting** is the only faithful option.
- Statistical guards were tuned against the real data: with 51 items × 3 windows tested, per-item creep/variance require 8+ lines per side and p < 0.01; the portfolio creep signal also needs the pooled index test; HIGH reorder severity needs a buyer-confirmed lead time, because stock is an estimate.
- Unit dimensions extended (`area`, `time`, `data`, `service`) with per-unit bases (box, shipment, campaign, job) so service lines are not forced into pieces.

### Files / Features Added or Modified
- API: `ingestion/parsers/purchaseOrders.ts`, `ingestion/normalise/procurement.ts`, `ingestion/{service,resolver}.ts`, `parsers/{types,index}.ts`, `transactions/model.ts`, `vendors/{model,service,intelligence.service}.ts`, `products/{model,schema,intelligence.service}.ts`, `reference/{currency,units}.ts`, `auth/{model,schema,service,controller,tenantSettings}.ts`, `advisory/{stats,signals.sourcing}.ts`, `advisory/{signals.math,signals.service,narrator,rfq.service,types,advisory.service}.ts`.
- Seed: `scripts/seed/{seed,demo,build-samples,inspect-insights}.ts`, `data/dataset.ts`; `apps/web/public/samples/*` (generated).
- Web: currency-aware formatting (`shared/lib/format.ts`), deep links (`useHashParam`), purchase-order source card, new insight types in Advisory, product categories/dimensions.
- Tests: ingestion/advisory unit tests updated; Postman expectations updated.

---

## v0.9.0 — 2026-11-20 — quoteScout.info: judges' demo access, overview dashboard, rebrand

### Raw Prompt
> This is to be viewed by judges, so near the login show the sample creds directly along with passwords, so that they can view and understand the demo. Also make some sample upload documents available there itself so they can download and upload into the analysis part. Also make a nice logo and cool name (short and neat). Remove the system and items tab. And beautify the whole website, add analysis graphs etc, make it more colorful.
> Follow-up: "name of the website is going to be quoteScout.info, make an animated logo for this".

### Reframed Command
1. **Sign-in demo panel:** every demo business with email and password (copy buttons), one-click sign-in, and that business's Q4 2024 sample file(s) to download; other-format examples listed. Toggle with `VITE_DEMO_MODE` (default on).
2. **Sample uploads in Ingestion:** the signed-in business's held-back quarter highlighted, *Upload this* (fetches the file, selects the Purchase Orders source, queues it) or *Download*; finished uploads invalidate all cached analytics.
3. **Overview dashboard** (`#/overview`, new default route) backed by a new tenant-scoped endpoint `GET /analytics/overview?months=` (3–36): KPI tiles (spend + change vs prior period, active suppliers, on-time %, maverick %, price vs budget, savings identified), monthly spend columns, on-time delivery line with the 85% target, spend by category, top suppliers with on-time status, recommendation mix (severity + type, deep-linking into Advisory), data sources. Absent fields → null, never estimated. A dismissible six-step guided tour card.
4. **Remove** the "System & Items" tab (unused web features `items`, `health` and `DashboardPage` deleted; the API endpoints remain).
5. **Brand: quoteScout.info.** An animated SVG mark (magnifying glass forming a "Q", scanning three quote bars, the lowest one "found"; glint sweep; respects `prefers-reduced-motion`), gradient wordmark, favicon, a standalone animated logo file. Colourful theme: dark gradient chrome, brand-gradient accents, coloured KPI tiles; chart colours from a validated categorical palette, ink-only text, hover tooltips and data-table fallbacks.
Acceptance: web typecheck + build; unit tests for the overview math, stats, cross rates, PO parser and noise guard; Newman folder "9. Analytics overview" (isolation, reconciliation of KPIs with series, nulls for absent fields, validation); screenshots of every page reviewed; end-to-end sample upload moves the overview to the new quarter.

### Architectural Context & Decisions
- New `modules/analytics` (routes → validate → controller → service; pure helpers in `overview.math.ts`). One aggregation pass per window grouped by month × product × vendor; categories and supplier names joined in memory (≤ 51 products / tens of suppliers per tenant). Analysis date reuses Advisory's `resolveAsOf` so both screens agree.
- Charts are hand-written SVG/HTML (no chart dependency), single-axis only, with the KPI tile, hero figure, segmented bar and bar list following the dataviz rules. Status colours carry an icon and a label.
- Features stay decoupled: Overview imports Advisory's public barrel only (`TYPE_META`, `TYPE_ORDER`); sample manifest access lives in `shared/lib/samples.ts`; demo accounts in `features/auth/demoAccounts.ts` (mirrors the seed).
- Seed is now idempotent for review states (it no longer actions/snoozes more insights on every run).
- Contract coverage excludes `NO-CONTRACT` placeholders (same rule as the supplier scorecard).

### Files / Features Added or Modified
- API new: `modules/analytics/{schema,overview.math,service,controller,routes}.ts`; modified `app.ts`, `advisory/signals.math.ts` (noise guard: pooled CV, NOISY_TEST, portfolio significance, reorder severity).
- Tests: `tests/unit/sourcing.test.ts` (new, in `test:unit`); Postman folder "9. Analytics overview" and the scan `byType` expectation (10 types).
- Web new: `shared/ui/{Logo.tsx,logo.css}`, `shared/lib/samples.ts`, `features/auth/{DemoAccess.tsx,demoAccounts.ts}`, `features/overview/*`, `features/ingestion/components/SampleFiles.tsx`, `pages/OverviewPage.tsx`, `public/favicon.svg`, `public/brand/quotescout-logo-animated.svg`; modified `main.tsx` (routes/nav), `AppShell`, `AuthLayout`, `LoginPage`, `AuthContext` (display currency), `IngestionHub`, `IngestionContext`, Advisory page/command center (deep link `?type=`), evidence panels for the new types, CSS theme files, `index.html`; deleted `features/items`, `features/health`, `pages/DashboardPage.tsx`.
- Seed: `demo.ts` (idempotent review states).
- Docs: `api-reference.md` (Advisory + Analytics, purchase orders, currency), `architecture.md`, `setup-and-ops.md`, new `demo-walkthrough.md`, `CLAUDE.md`, `.env.example` (`VITE_DEMO_MODE`).

---

## v0.9.1 — 2026-11-20 — Ingestion: market price pointers (ONDC, IndiaMART, …) marked to-do

### Raw Prompt
> also add some open source price pointers like ONDC, Indiamart in the ingest feature as yet to do

### Reframed Command
Show open/public price references in the Ingestion Hub as **planned, non-functional** entries so reviewers see the roadmap: ONDC, IndiaMART, GeM and Agmarknet, each labelled "To do" with what it will provide and a link to the official site.
- No importer, no upload, no fetched or invented prices. They are not `SourceType`s and cannot be selected.
- Stated design intent: imported market prices will arrive as *unverified* benchmarks and need buyer verification with a source link before driving a Market savings insight (existing Module 5 rule). Today a verified benchmark can only be recorded via `POST /advisory/benchmarks` (no web form yet).
- Acceptance: visible in Ingestion, clearly marked not built, web typecheck passes, no API/contract change.

### Architectural Context & Decisions
- Kept separate from `SOURCES` (uploadable sources, mirrored by the backend's `SOURCE_TYPES`) so the UI cannot offer an upload the API would reject.
- Terms of use and API availability of each marketplace are unverified, so the entries promise no specific integration method.

### Files / Features Added or Modified
- Web new: `features/ingestion/components/MarketSources.tsx`; modified `IngestionHub.tsx`, `ingestion.css`.
- Docs: `architecture.md`, `setup-and-ops.md` (note). No API, env or Postman change.

---

## v0.9.2 — 2026-11-20 — Docs structure: feature briefs moved to docs/specs

### Raw Prompt
> some .md files of the features are not as per expected file structure, please update that

### Reframed Command
Make the markdown layout match the structure mandated by `project-init.md` (root holds only `CLAUDE.md`; everything else under `docs/`). The six feature briefs left loose in the repository root are the offenders: move them under `docs/specs/`, index them, and repair every pointer. No content changes; no code touched.
- Interpretation note: "expected file structure" was read as the layout in `project-init.md`. `docs/demo-walkthrough.md` stays in `docs/` (it is a living doc and is listed in architecture.md).
- Acceptance: root contains only `CLAUDE.md` among `.md` files; links resolve; tracked files keep git history (`git mv`).

### Architectural Context & Decisions
- Briefs are *inputs*, the four `docs/*.md` files are the *living* docs, so they get their own subfolder instead of mixing.
- The changelog is append-only: historical entries keep their original wording and a single note at the top explains the new location.

### Files / Features Added or Modified
- Moved: `project-init.md`, `module-1-ui.md`, `user-setup.md`, `vendor-intelligence.md`, `product-intelligence.md`, `recomendations.md` → `docs/specs/`.
- New: `docs/specs/README.md` (index mapping each brief to its changelog entry).
- Modified: `CLAUDE.md` (project snapshot), `docs/architecture.md` (layout table), `docs/prompt-changelog.md` (pointer note).

---

## v0.9.3 — 2026-11-20 — Containerisation for hosting (quoteScout.info)

### Raw Prompt
> (Assistant proposal accepted:) If the site will be hosted as quoteScout.info, add Dockerfiles for the API and web, an api/web service pair in compose, and move Mongo Express behind a profile with a password. … please do

### Reframed Command
Make the project deployable with Docker without breaking the existing host-based dev workflow:
1. Production images for the **API** (compiled, production dependencies only, non-root, health check) and **web** (Vite build served by nginx, which also proxies `/api`, so the app is same-origin).
2. A **seed** image/job that builds the demo businesses and the downloadable samples inside Docker (into a shared volume that nginx serves).
3. `docker-compose.yml` with **profiles**: default = MongoDB only (unchanged for `npm run dev`); `app` = api + web; `seed` = one-shot job; `tools` = Mongo Express with basic auth.
4. Tighter defaults: Mongo and Mongo Express published on loopback only.

Acceptance: images build; the stack starts healthy; login works over plain HTTP; samples download; an upload through nginx works; the API refuses to start in production without `JWT_SECRET`; Mongo Express rejects unauthenticated requests; seeded results inside Docker equal the host seed's.

### Architectural Context & Decisions
- **Same-origin via nginx** (`/api` proxied to `api:4000`): no CORS, and the SameSite=Lax session cookie works unchanged. The API is not published to the host.
- **`COOKIE_SECURE` env** (new, API): the session cookie was `Secure` whenever `NODE_ENV=production`, which breaks login over plain HTTP (e.g. a local Docker stack). The default is unchanged (on in production); the compose file defaults it to `false` and documents setting `true` behind HTTPS.
- **`JWT_SECRET` is not hard-required by compose.** A `${VAR:?}` would break `docker compose up mongo` for everyone without it; the API's existing production check fails fast with a clear message instead.
- **Seed runs as `NODE_ENV=development` in its own image** because the seed deliberately skips demo data in production; it also needs tsx, the full workspace and the dataset, which stay out of the runtime images. `SAMPLES_DIR` (new, seed) redirects the sample files to a volume mounted read-only into nginx at `/samples`.
- **Mongo has no authentication** (a replica set needs a keyfile); it is isolated on the compose network and published on `127.0.0.1` only. Mongo Express needs a password (`MONGO_EXPRESS_PASSWORD`, no default) and is loopback-bound.
- `db:up` now starts MongoDB only; Mongo Express moved to `npm run db:tools`.
- **No secrets or tunables stored in the compose file** (a hosting platform flagged plain-text values): the api service passes settings through from `.env`/the platform environment (list form, no `:-default` literals), relying on the API's own defaults. Mongo Express has no default password: its entrypoint refuses to start without `MONGO_EXPRESS_PASSWORD` (the image otherwise falls back to a well-known default). A `${VAR:?}` requirement was rejected because Compose evaluates it for every service, which would break `docker compose up` for users who never run Mongo Express. Consequence: an unset `COOKIE_SECURE` now means Secure, so local plain-HTTP runs must set `COOKIE_SECURE=false` in `.env`.
- TLS is deliberately outside the stack: terminate HTTPS in front of the web container and set `COOKIE_SECURE=true`. With more than one proxy in front, the API's `trust proxy` setting (1 hop) needs raising for correct client IPs in rate limiting.

### Files / Features Added or Modified
- New: `docker/{api,web,seed}.Dockerfile`, `docker/nginx.conf.template`, `.dockerignore`.
- Modified: `docker-compose.yml` (profiles, services, loopback binds, password), `package.json` (`db:tools`, `docker:up`, `docker:seed`, `docker:down`), `apps/api/src/config/env.ts` and `modules/auth/controller.ts` (`COOKIE_SECURE`), `scripts/seed/build-samples.ts` and `seed.ts` (`SAMPLES_DIR`), `.env.example`, `docs/setup-and-ops.md`, `docs/architecture.md`, `CLAUDE.md`.
