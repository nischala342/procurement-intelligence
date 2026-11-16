# Prompt Changelog

Append-only log of reframed commands and the architectural context behind each change. Newest entries at the bottom. Format is mandated by [CLAUDE.md](../CLAUDE.md).

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
