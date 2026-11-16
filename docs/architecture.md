# Architecture

## Overview
npm-workspaces monorepo:

| Path | Package | Role |
|---|---|---|
| `apps/api` | `@pi/api` | Express 4 + TypeScript (CommonJS) + Mongoose REST API |
| `apps/web` | `@pi/web` | React 18 + Vite + TypeScript SPA |
| `scripts/seed` | `@pi/seed` | Deterministic seed/reset scripts (run with `tsx`) |
| `docs/` | — | Living documentation + prompt history |

```
Browser ──(Vite proxy /api)──> Express API ──> Mongoose ──> MongoDB (rs0)
                                  ▲
                         Newman / Postman suite
```

## Backend request lifecycle
```
Request
 → helmet → cors → compression → pino-http → express.json → rate limiter (/api)
 → Router (/api/v1/<module>)
 → [authGuard] (mutating items routes; no-op without API_KEY)
 → validate({params, query, body})  (Zod; replaces req.* with parsed values)
 → asyncHandler(controller)         (HTTP ⇄ service translation only)
 → service                          (business rules, uniqueness, 404/409)
 → Mongoose model                   (persistence)
 → sendSuccess(...) envelope
Errors (anywhere) → errorHandler → sendError(...) envelope
Unmatched routes → notFoundHandler
```

### Layering rules
- **Routes** declare paths and compose middleware only. No logic, no DB.
- **Controllers** read validated input, call one service function, shape the HTTP response. No business logic.
- **Services** own business rules and are the only layer touching models.
- **Models** define schemas/indexes. `toJSON` maps `_id` → `id` and no `__v` is exposed.
- **schema.ts** (Zod) is the contract for every request input; types are inferred from it.

### Module layout (`src/modules/<domain>/`)
`routes.ts`, `controller.ts`, `service.ts`, `model.ts` (if persisted), `schema.ts` (if it accepts input). Register new routers in `src/app.ts` under `/api/v1`.

### Standard envelope
```ts
{ success: boolean; data?: T; error?: { code: string; message: string; details?: unknown }; meta?: object }
```
Always produced by `src/utils/response.ts`. Never call `res.json` directly.

### Error handling
`AppError(status, code, message, details?)` for expected failures. The global handler also maps:

| Source | Status | Code |
|---|---|---|
| `ZodError` | 400 | `VALIDATION_ERROR` |
| Mongoose `ValidationError` | 400 | `VALIDATION_ERROR` |
| Mongoose `CastError` | 400 | `INVALID_ID` |
| Malformed JSON | 400 | `INVALID_JSON` |
| Mongo duplicate key (11000) | 409 | `DUPLICATE_KEY` |
| Body too large | 413 | `PAYLOAD_TOO_LARGE` |
| Anything else | 500 | `INTERNAL_ERROR` (stack in details only outside production) |

### Config & lifecycle
- `config/env.ts`: Zod-validated env, loads root `.env`, exits on invalid config.
- `config/logger.ts`: Pino; `pino-pretty` only in development; auth headers redacted.
- `server.ts`: connects DB, listens, handles SIGINT/SIGTERM/unhandled errors with graceful shutdown (10s force-exit).

## Frontend
```
src/
  shared/    reusable UI + HTTP client (no knowledge of features)
  features/  one folder per domain: api.ts, types.ts, hooks, components, index.ts barrel
  pages/     route-level composition of features
  main.tsx
```
- Dependency direction is strictly `shared → features → pages`: pages import feature barrels; features import `shared` only; `shared` imports nothing from above.
- `shared/api/client.ts` is the only place that talks to Axios. Its interceptors enforce the backend envelope: success responses are unwrapped to `{ data, meta }`, failures become a typed `ApiError` (`code`, `status`, `details`), including network errors (`NETWORK_ERROR`).

## Data & seeding
- Single `Item` collection (see [api-reference.md](api-reference.md)). Unique index on `slug`; indexes on `category`, `status`; text index on `name`/`description`.
- Seeder imports the API's model so schema and seed data cannot drift.

## Authentication & multi-tenancy

```
signup ─> Tenant (name = organizationName) + User(email, passwordHash, organizationName, tenantId) ─> cookie
login  ─> bcrypt compare ─> sign JWT {sub: userId, email, tid: tenantId} ─> HTTP-only cookie `accessToken`
request ─> requireAuth (cookie or Bearer) ─> req.user = { userId, email, tenantId } ─> controller: tenantOf(req)
        ─> service(tenantId, …) ─> every query/write filtered by { tenantId }
```
- **Tenant model:** a `Tenant` is created per signup (the "default tenant profile"); users reference it via `tenantId`. This keeps the isolation key separate from the user so several users can share a tenant later without a data migration.
- **Module layout:** `modules/auth/{model,schema,tokens,service,guard,controller,routes}.ts` (repo convention, rather than the dotted file names in the brief). `tokens.ts` signs/verifies JWTs (HS256 only; `alg: none` and foreign-secret tokens are rejected); `guard.ts` exports `requireAuth`, `currentUser`, `tenantOf`.
- **Passwords:** bcrypt (`bcryptjs`, cost 12; pure JS, no native build). Login compares against a dummy hash for unknown emails and returns one generic error, so neither the message nor the timing reveals which emails exist. Signup does reveal duplicate emails (`409 EMAIL_TAKEN`), an accepted trade-off for usability.
- **Cookie & CSRF:** `HttpOnly` (scripts cannot read it), `SameSite=Lax` (cross-site POSTs do not carry it), `Secure` when `NODE_ENV=production`. The web app is same-origin via the Vite proxy; for a cross-origin deployment add the origin to `CORS_ORIGIN` (credentials are allowed) and review `SameSite`.
- **Brute force:** `/auth/login` allows `AUTH_RATE_LIMIT_MAX` failed attempts per IP per 15 min (successes are not counted); `/auth/signup` counts every attempt.
- **Secrets:** `JWT_SECRET` (>= 32 chars) is mandatory in production (the API refuses to start without it); in development an insecure built-in secret is used with a warning.
- **Known limitation:** tokens are stateless, so logout clears the cookie but does not revoke a token that was copied elsewhere before it expires. Add a token version/denylist if immediate revocation is required.

### Tenant isolation design
- `tenantId` (required ObjectId) is on `Vendor`, `Product`, `Transaction`, `IngestionJob` and `RawRecord`. It is set **only** from the authenticated session (`tenantOf(req)`), never from request bodies or query strings; it is hidden from API output.
- Uniqueness is per tenant via compound indexes: vendor `{tenantId, normalizedName}` (unique), product `{tenantId, normalizedName}` (unique) and `{tenantId, sku}`, transaction `{tenantId, fingerprint}` (unique) plus `{tenantId, date}`, `{tenantId, vendorId, date}`, `{tenantId, productId}`, `{tenantId, jobId}`, `{tenantId, reference}`; job `{tenantId, createdAt}`, `{tenantId, fileHash, sourceType}`; raw record `{tenantId, jobId, rowNumber}`. Two tenants can therefore both own a vendor "Acme", the same SKU, or ingest the same file.
- **Services take `tenantId` as an explicit first argument** and every read, update, merge and delete filters on it (`findOne({ _id, tenantId })`, not `findById`). The entity resolver is constructed per tenant, so fuzzy matching and merging can never see or touch another tenant's vendors or products. Cross-tenant ids return `404`.
- **Out of scope for scoping:** the reference `items` CRUD and static `reference` data are global demo/reference resources.
- **Existing data:** documents created before tenancy have no `tenantId` and are invisible. In development use `npm run db:reset && npm run db:seed`; the API also syncs indexes at start-up (non-production) to drop the old global unique indexes. Production needs an explicit migration (assign a tenant, then `syncIndexes`).

## Module 1: ingestion & normalisation
```
upload ─> multer (memory, size limit) ─> validate(sourceType…) ─> controller
       ─> ingestion/service.runIngestion
            1. extension + sha256 check  (409 DUPLICATE_FILE unless allowDuplicate)
            2. parser adapter (pure)     -> ParsedRow[] + row errors   [parsers/*]
            3. IngestionJob created (processing)
            4. per row: normalizeRow (numbers, dates, units, currency; pure)   [normalise/*]
                        EntityResolver (vendor/product match or create)        [resolver.ts]
                        fingerprint -> upsert Transaction ($setOnInsert)
            5. RawRecord rows stored (original payload, normalized|error)
            6. job stats/errors persisted -> completed | completed_with_errors | failed
```
- **Adapters**: one function per source (`parsers/`), all returning the same `ParsedRow` shape. Adding a source = new parser + entry in `PARSERS`/`ALLOWED_EXTENSIONS` + enum value. `pdf_invoice` is registered but throws `501` until its strategy is decided.
- **Pure vs DB code**: parsers and `normalise/*` never touch the database, so they are unit-tested with the sample files (`apps/api/tests/unit`).
- **Entity resolution** (`resolver.ts`): in-memory indexes loaded once per job; tax id/SKU → exact normalised key/alias → fuzzy (Dice bigram similarity, word-order insensitive). Thresholds: vendors 0.90/0.75, products 0.92/0.80 (auto-attach / flag `needs_review`). Fuzzy scan is O(n) per unseen name; revisit for very large catalogs.
- **Idempotency** is two-level: file hash (whole-file re-uploads) and per-row fingerprint with unique index (overlapping exports, retries).
- **Traceability**: every `Transaction` stores `jobId` + `rawRecordId`; raw payloads are kept so records can be re-derived.
- **Normalisation rules** live in `modules/reference` (unit table with dimension base units `pcs/kg/l/m`; static FX table to INR; the applied `fxRate` is stored on each row).
- **Processing is synchronous** within the request (bounded by size/row limits). Move to a queue/worker if limits are raised.
- Collections: `items` (reference CRUD), `vendors`, `products`, `transactions`, `ingestionjobs`, `rawrecords`.

## Frontend: `features/ingestion`
```
src/
  shared/
    api/            HTTP client + envelope types (ApiError, request, PageMeta)
    hooks/          usePagedQuery (paginated fetch + reload), useHashRoute
    lib/format.ts   money/date/bytes formatting (en-IN)
    ui/             Drawer (a11y dialog), Pill, EmptyState, Skeleton, Pagination, AppShell, Card, styles
  features/ingestion/
    types/          IngestionJob, RawRecord, Vendor, Product, Transaction, QueueItem, ...
    api/            uploadFile, listJobs, getRawRecord, list/get/merge/confirm for vendors & products, listTransactions
    sources.ts      per-source config: accepted extensions, size limit, disabled reasons
    status.ts       API job status -> PipelineStatus (PENDING/PARSING/NEEDS_REVIEW/PROCESSED/FAILED)
    hooks/          useUploadQueue (validation, concurrency 2, progress, retry), useReview (flagged entities + actions),
                    IngestionContext (queue + polled jobs + review drawer)
    components/     SourceSelector, Dropzone, UploadQueuePanel, IngestionHub, PipelineTracker, ReviewDrawer,
                    DataExplorer -> TransactionsTab / VendorsTab / ProductsTab, TransactionDrawer
    index.ts        public surface: IngestionProvider, IngestionHub, PipelineTracker, DataExplorer
  pages/
    IngestionPage.tsx   <IngestionProvider> + Hub + Tracker + Explorer
```
- **Status mapping:** the API is synchronous, so `PENDING`/`PARSING` are largely client-side (queued / uploading-or-processing); `processing` jobs map to `PARSING`; `failed` -> `FAILED`; a job with `reviewPending > 0` -> `NEEDS_REVIEW`; otherwise `PROCESSED`. `reviewPending` is computed live by the API, so resolving matches clears the badge. Jobs poll every 3 s while anything is in flight.
- **Review flow:** the drawer lists the job's vendors/products with `status = needs_review` (scanning up to 500 of its transaction lines), shows the extracted name beside the suggested canonical match with its similarity score, and calls *merge* (alias) or *confirm* (create new entity).
- **Retry:** the original `File` is kept in the browser session; Retry re-uploads it. Jobs from earlier sessions cannot be retried (button disabled with an explanation).
- **Auth in the UI (`features/auth`):** `AuthProvider` (React context: `user`, `isAuthenticated`, `loading`, `login`, `signup`, `logout`) is backed by `GET /auth/me`, so a page refresh keeps the session. `RequireAuth` redirects to `#/login`. A `401 UNAUTHORIZED` from any API call (expired session) fires a window event that signs the user out. Forms validate with Zod (same rules as the API) and show field errors with `aria-invalid`/`role="alert"`. The shell shows the organization (tenant indicator), a notifications bell (placeholder: no notification backend yet) and an avatar menu with **Log out**. The page tree is keyed by `tenantId`, so no client state survives an account switch.
- **Not yet backed by the API (shown but disabled/omitted):** PDF/image invoices, Tally JSON/CSV, bank-statement PDFs, Shopify store connection, vendor payment terms, tax breakdowns.
- **Accessibility:** dropzone is a keyboard-operable button with ARIA label/description; drawers are `role="dialog"` with focus trap/restore and Esc; tabs follow the WAI-ARIA tabs pattern (arrow keys); status is conveyed by glyph + text, not colour alone; progress uses `role="progressbar"`/`meter`.

## Testing
Unit tests (`npm run test:unit -w @pi/api`, `node:test` via `tsx`, no database) cover normalisers and all parsers against `scripts/seed/data/samples`. Postman collection v2.1 executed by Newman (`apps/api/tests/postman`) covers health, the item CRUD lifecycle, validation errors and the ingestion flow (multipart uploads, dedupe, vendor resolution, FX/unit normalisation, 4xx/501 cases). It is generated from `build-collection.js` so assertions stay reviewable.

## Key decisions
- **Express 4 + `asyncHandler`** over Express 5: widest ecosystem compatibility; explicit async error forwarding.
- **Zod v3** for both env and request validation: one validation vocabulary.
- **Single-node replica set** in Docker so transactions/change streams are available when needed.
- **Optional API-key guard** as a stand-in auth seam; replace with JWT when an `auth` module lands.
- **Single root `.env`** shared by API, seeders and Vite (`envDir`).
