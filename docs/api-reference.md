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

Sessions use an **HTTP-only cookie** named `accessToken` (JWT, HS256, `SameSite=Lax`, `Secure` in production, lifetime `JWT_EXPIRES_DAYS`, default 7). Non-browser clients may send `Authorization: Bearer <token>` instead. `/ingestion`, `/vendors`, `/products` and `/transactions` require a session and are **tenant-scoped** (see architecture.md); `/health`, `/reference`, `/auth/*` and the reference `/items` CRUD do not.

All user responses use `{ "user": { "id", "email", "organizationName", "tenantId", "createdAt" } }`; password hashes are never returned.

### `POST /auth/signup`
Body: `email` (valid email, normalised to lower-case), `password` (8–72 bytes, at least one letter and one number), `organizationName` (2–120 chars). Creates a new tenant (the organisation) and its first user, and signs the user in (sets the cookie).
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
| `pdf_invoice` | `.pdf` | **Not enabled**: returns `501 NOT_IMPLEMENTED` until an extraction strategy is chosen |

### `POST /ingestion/jobs`
`multipart/form-data`. Requires a session; everything created is stored under the caller's tenant. Processing is synchronous; the job is returned when finished. Max file size `MAX_UPLOAD_MB` (default 10); max 20,000 rows.

| Field | Required | Notes |
|---|---|---|
| `file` | yes | one file |
| `sourceType` | yes | see table |
| `dayFirst` | no | `true` (default) / `false`: how to read ambiguous dates like `03/04/2025` |
| `defaultCurrency` | no | ISO code used when a row has no currency (default `INR`) |
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

- `GET /vendors`: query `page`, `limit`, `search` (name/alias/taxId), `status`.
- `GET /vendors/:id`
- `PATCH /vendors/:id`: `{ name?, status?: "active" }` (confirm a flagged vendor is distinct). `409` if merged.
- `POST /vendors/:id/merge`: `{ "targetId": "…" }`. Moves aliases, re-points transactions, marks the source `merged`. Response `{ vendor, transactionsMoved }`. `400` if same id; `409` if either vendor is already merged.

## Products

Product: `{ id, name, normalizedName, sku?, aliases[], baseUnit, dimension, status: active | needs_review, possibleDuplicateOf? }`. Matching: SKU → exact name/alias → fuzzy (≥ 0.92 attach; 0.80–0.92 `needs_review`).

- `GET /products`: query `page`, `limit`, `search`, `status` (`active` | `needs_review` | `merged`).
- `GET /products/:id`
- `PATCH /products/:id`: `{ "status": "active" }` confirms a flagged product is distinct. `409` if merged.
- `POST /products/:id/merge`: `{ "targetId": "…" }`. Moves aliases, re-points transactions, marks the source `merged`. Response `{ product, transactionsMoved }`. `400` same id; `409` if either is already merged.

## Transactions

Unified record for every source. Always traceable: `jobId`, `rawRecordId`, `sourceType`, `reference`.

| Field | Notes |
|---|---|
| `kind` | `invoice_line` \| `price_quote` \| `payment` \| `sale` |
| `vendorId`, `productId` | populated on read: vendor `{ id, name, status, taxId }`, product `{ id, name, sku, status, baseUnit }` |
| `date` | UTC date, or absent if unparseable (see `warnings`) |
| `quantity`, `unit`, `baseQuantity`, `baseUnit` | unit normalised (e.g. `dozen` → `pcs` ×12, `Kgs` → `kg`) |
| `unitPrice`, `amount`, `currency` | as reported; currency normalised to ISO |
| `fxRate`, `amountBase`, `unitPriceBase` | converted to INR; `unitPriceBase` is per base unit |
| `warnings[]` | `UNKNOWN_UNIT:x`, `UNKNOWN_CURRENCY:XYZ`, `NO_FX_RATE:XYZ`, `INVALID_DATE`, `MISSING_DATE`, `MISSING_VENDOR`, `ASSUMED_UNIT_PCS` |

Idempotency: each row has a fingerprint (source, kind, vendor, reference, date, SKU/product, quantity, price/amount); identical rows across different files never create duplicates.

- `GET /transactions`: query `page`, `limit`, `kind`, `sourceType`, `vendorId`, `productId`, `jobId`, `reference` (exact), `search` (reference/description), `from`, `to`, `sort` (`date`, `-date` (default), `amountBase`, `-amountBase`).
- `GET /transactions/:id`

## Reference data

`GET /reference` → `{ units: [{ unit, dimension, factorToBase, baseUnit, aliases }], currency: { baseCurrency: "INR", ratesToBase } }`. FX rates are static defaults (see `modules/reference/currency.ts`).

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

## Seed fixtures (after `npm run db:seed`)
`fixture-laptop` (`000000000000000000000001`, active), `fixture-software-license` (`…0002`, draft), `fixture-legacy-printer` (`…0003`, archived), plus `generated-item-001…025`.
