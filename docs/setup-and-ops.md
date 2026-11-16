# Setup & Operations

## Prerequisites
- Node.js >= 20 and npm >= 10
- Docker Desktop (for local MongoDB + Mongo Express)

## First-time setup
```bash
npm install                 # installs all workspaces (api, web, seed)
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run db:up               # starts MongoDB (replica set rs0) and Mongo Express
npm run db:seed             # deterministic fixtures + generated data
npm run dev                 # API on :4000, web on :5173
```

Wait for the `pi-mongo` container to report `healthy` (`docker compose ps`) before seeding or starting the API; the healthcheck initiates the single-node replica set on first boot.

## Environment variables
All are read from the root `.env` (see [.env.example](../.env.example)).

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | api, seed | `development` | `development` enables pretty logs and stack traces in 500 details |
| `PORT` | api | `4000` | API port |
| `LOG_LEVEL` | api | `info` | Pino level |
| `MONGO_URI` | api, seed | `mongodb://localhost:27017/procurement_intelligence?directConnection=true` | Mongo connection string |
| `CORS_ORIGIN` | api | `http://localhost:5173` | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | api | `60000` / `300` | Per-IP rate limit on `/api` |
| `JWT_SECRET` | api | dev fallback | Signs session JWTs. **Required (>= 32 chars) in production.** |
| `JWT_EXPIRES_DAYS` | api | `7` | Session lifetime |
| `AUTH_RATE_LIMIT_MAX` | api | `50` | Failed logins / signups per IP per 15 min |
| `MAX_UPLOAD_MB` | api | `10` | Max ingestion upload size |
| `API_KEY` | api | empty | If set, POST/PATCH/DELETE on `/items` require `x-api-key` |
| `VITE_API_BASE_URL` | web | `/api/v1` | API base URL |
| `VITE_PROXY_TARGET` | web (dev) | `http://localhost:4000` | Vite proxy target |
| `VITE_API_KEY` | web | empty | Sent as `x-api-key` (dev only) |
| `ALLOW_DESTRUCTIVE_SEED` | seed | `false` | Allows `db:reset`/clean in `NODE_ENV=production` |
| `MONGO_PORT`, `MONGO_EXPRESS_PORT` | docker-compose | `27017`, `8081` | Host port mappings |

The env file is validated with Zod at API startup; invalid values abort boot with a readable message.

## Root scripts
| Command | Description |
|---|---|
| `npm run dev` | API + web concurrently |
| `npm run dev:api` / `dev:web` | One app only |
| `npm run build` | Build API (`dist/`) and web |
| `npm run typecheck` / `lint` | `tsc --noEmit` in every workspace |
| `npm run db:up` / `db:down` | Start / stop Docker services |
| `npm run db:seed` | Idempotent upsert of fixtures + 25 generated items |
| `npm run db:reset` | Drop the configured database (blocked in production) |
| `npm run test:api` | Newman suite + HTML report |
| `npm run test:unit -w @pi/api` | Unit tests for parsers/normalisers (no DB needed) |

## Docker
- MongoDB: `localhost:27017` (replica set `rs0`, data in the `mongo-data` volume).
- Mongo Express: http://localhost:8081.
- Remove all data: `docker compose down -v`.

## Seeding
- `faker.seed(42)` and a fixed reference date make generated data identical on every run; IDs and slugs are index-derived.
- Fixtures (stable, safe for tests):

| slug | _id | status |
|---|---|---|
| `fixture-laptop` | `000000000000000000000001` | active |
| `fixture-software-license` | `000000000000000000000002` | draft |
| `fixture-legacy-printer` | `000000000000000000000003` | archived |

- Generated items: slugs `generated-item-001`…`generated-item-025`, IDs `…03e9`…`…0401`.
- Re-running `db:seed` upserts by slug; it never duplicates. Use `npm run seed:clean -w @pi/seed` to wipe items **and** all ingestion data first.
- `db:seed` also ingests the sample source files in `scripts/seed/data/samples/` (price sheet, Tally XML, Shopify orders CSV + products JSON, bank statement) through the real pipeline. Files already ingested are skipped (by hash). Expected result on an empty DB: 5 + 4 + 3 + 2 + 3 transactions.

## Accounts & tenants
- Create an account at http://localhost:5173/#/signup (organization name, email, password). Each signup creates its own tenant: its data is invisible to every other account.
- `npm run db:seed` creates a **development-only** demo account, `demo@procurement.test` / `Demo@12345`, and ingests the sample files into its tenant. Skipped when `NODE_ENV=production`.
- Generate a production secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and set `JWT_SECRET`.
- **Upgrading a pre-tenancy database:** run `npm run db:reset && npm run db:seed` (old documents have no `tenantId`).
- With `curl`, keep the cookie: `curl -c jar -H "Content-Type: application/json" -d '{"email":"demo@procurement.test","password":"Demo@12345"}' http://localhost:4000/api/v1/auth/login`, then `curl -b jar …`.

## Using the UI
Sign in (or sign up) at `#/login`, then open `#/ingestion`: pick a source, drop files (validated client-side by extension and the 10 MB limit), track them in *Pipeline Activity*, resolve flagged matches with **Review**, and browse the normalised ledger, vendors and products in *Data Explorer*. `#/system` shows API health and the reference Items CRUD.

## Ingesting your own data
```bash
# sign in once, keeping the session cookie in ./jar
curl -c jar -H "Content-Type: application/json" \
     -d '{"email":"demo@procurement.test","password":"Demo@12345"}' http://localhost:4000/api/v1/auth/login
curl -b jar -F file=@scripts/seed/data/samples/price-sheet.csv -F sourceType=price_sheet \
     http://localhost:4000/api/v1/ingestion/jobs
```
To see the human review flow, upload `scripts/seed/data/samples/price-sheet-needs-review.csv` as a `price_sheet` (deliberately not seeded): it produces one near-duplicate vendor ("Acmee Pvt Ltd") and one near-duplicate SKU ("Steel Rod 10mm") flagged `needs_review`.

Inspect results with `GET /api/v1/ingestion/jobs/:id` (stats, row errors), `/vendors?status=needs_review` (ambiguous matches to confirm or merge), and `/transactions`. See [api-reference.md](api-reference.md). PDF invoices (`pdf_invoice`) return `501` until an extraction strategy is chosen.

## Newman API tests
1. Start MongoDB and the API (`npm run db:up`, `npm run dev:api`).
2. `npm run test:api`
3. HTML report: `apps/api/tests/postman/reports/report.html` (git-ignored).

Options: `BASE_URL=http://host:port npm run test:api`; `API_KEY=... npm run test:api` if the API key guard is on.

The collection signs up its own throw-away accounts (unique emails per run; the Newman cookie jar carries the session), so it needs no seeded user. Folder 0 covers signup/login/logout/me; folder 5 proves tenant isolation by signing up a second organization and checking it cannot see, modify or collide with the first one's data. The items tests are self-contained (create and delete their own item). The ingestion tests upload files from `scripts/seed/data/samples/` (Newman `workingDir`), use `allowDuplicate=true` so they can re-run, and the vendor-dedupe test expects exactly one vendor matching "acme" (run against a dev/test database; `npm run db:reset && npm run db:seed` gives a clean state). `collection.json` and `local.env.json` are generated by `apps/api/tests/postman/build-collection.js` (`npm run postman:build -w @pi/api`); edit the generator, then regenerate. Both files can also be imported into Postman.

## Troubleshooting
- **`ECONNREFUSED`/server selection timeout**: container not healthy yet, or `MONGO_URI` lacks `directConnection=true`.
- **Health returns 503**: API is up but MongoDB is unreachable.
- **CORS errors**: add the web origin to `CORS_ORIGIN`.
