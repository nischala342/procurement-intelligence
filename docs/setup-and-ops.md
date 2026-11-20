# Setup & Operations

## Prerequisites
- Node.js >= 20 and npm >= 10
- Docker Desktop (for local MongoDB + Mongo Express)

## First-time setup
```bash
npm install                 # installs all workspaces (api, web, seed)
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run db:up               # starts MongoDB (replica set rs0); Mongo Express: npm run db:tools
npm run db:seed             # reference items + 5 demo businesses from datasets/ (~1 min)
npm run dev                 # API on :4000, web on :5173  ->  sign in with a demo business on the login page
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
| `VITE_DEMO_MODE` | web | `true` | Shows demo logins (with password) and sample downloads on the sign-in page. Set `false` for any non-demo deployment |
| `ANTHROPIC_API_KEY` | api | empty | Optional: Claude writes insight text from computed evidence (sends names and metrics to Anthropic) |
| `ADVISORY_MODEL` / `ADVISORY_LLM_TIMEOUT_MS` / `ADVISORY_LLM_MAX_PER_RUN` | api | `claude-haiku-5-5` / `20000` / `15` | Narration model, timeout and per-scan cap |
| `ALLOW_DESTRUCTIVE_SEED` | seed | `false` | Allows `db:reset`/clean in `NODE_ENV=production` |
| `MONGO_PORT`, `MONGO_EXPRESS_PORT` | docker-compose | `27017`, `8081` | Host port mappings (bound to 127.0.0.1) |
| `WEB_PORT` | docker-compose | `8080` | Published port of the web container (profile `app`) |
| `MONGO_EXPRESS_USER` / `MONGO_EXPRESS_PASSWORD` | docker-compose | `admin` / none | Mongo Express basic auth (profile `tools`). **No default password:** the container refuses to start until one is set |
| `COOKIE_SECURE` | api | on in production | `Secure` flag of the session cookie: set `false` for plain-HTTP Docker on localhost, `true` behind HTTPS |

The env file is validated with Zod at API startup; invalid values abort boot with a readable message.

## Root scripts
| Command | Description |
|---|---|
| `npm run dev` | API + web concurrently |
| `npm run dev:api` / `dev:web` | One app only |
| `npm run build` | Build API (`dist/`) and web |
| `npm run typecheck` / `lint` | `tsc --noEmit` in every workspace |
| `npm run db:up` / `db:down` | Start / stop MongoDB (default compose profile) |
| `npm run db:tools` | Start Mongo Express (password-protected, http://localhost:8081) |
| `npm run docker:up` | Build and start the full stack (api + web) on http://localhost:8080 |
| `npm run docker:seed` | Seed demo businesses + sample downloads inside Docker |
| `npm run docker:down` | Stop every profile |
| `npm run db:seed` | Idempotent: reference items, five demo businesses from the dataset (with advisory scans), sample upload files |
| `npm run samples:build -w @pi/seed` | Regenerate `apps/web/public/samples` only |
| `npm run db:reset` | Drop the configured database (blocked in production) |
| `npm run test:api` | Newman suite + HTML report |
| `npm run test:unit -w @pi/api` | Unit tests (parsers, normalisers, intelligence math, advisory detectors, statistics, overview math; no DB needed) |

## Docker
Compose profiles (see the header of [docker-compose.yml](../docker-compose.yml)):

| Profile | Services | Use |
|---|---|---|
| *(default)* | `mongo` | Database for `npm run dev` on the host: `localhost:27017`, replica set `rs0`, data in the `mongo-data` volume |
| `app` | `api`, `web` | The whole app in containers. nginx serves the web build and proxies `/api` to the API (not published), so everything is same-origin |
| `seed` | `seed` | One-shot job: demo businesses, advisory scans and the sample downloads (written to the `samples` volume that nginx serves at `/samples`) |
| `tools` | `mongo-express` | DB browser with basic auth, loopback only |

### Run the full stack in Docker
`docker-compose.yml` contains no secrets or tunable values: the api service passes settings through from `.env` (or the hosting platform's environment). Unset values use the API's own defaults.
```bash
# .env: set JWT_SECRET (>= 32 chars; the API refuses to start in production without it) and, for plain http://localhost, COOKIE_SECURE=false
npm run docker:up      # builds the images, starts mongo + api + web
npm run docker:seed    # demo data + samples (about a minute)
# open http://localhost:8080 and pick a demo business on the login page
```
Reset the demo data: `docker compose --profile seed run --rm seed npm run reset -w @pi/seed`, then `npm run docker:seed`. `VITE_DEMO_MODE` is baked into the web image at build time: after changing it run `docker compose --profile app build web`.

### Hosting as quoteScout.info
- Put an HTTPS terminator in front of the `web` container (hosting platform or reverse proxy) and set `COOKIE_SECURE=true`, `CORS_ORIGIN=https://quotescout.info` and a strong `JWT_SECRET`. With more than one proxy hop, raise `trust proxy` in `apps/api/src/app.ts` so rate limiting sees real client IPs.
- Decide on demo mode: `VITE_DEMO_MODE=true` publishes the demo passwords on the sign-in page (right for a judges' demo, wrong for a real deployment), and the seed creates those accounts.
- MongoDB has **no authentication** (a replica set needs a keyfile) and must never be published beyond loopback. Use a managed MongoDB, or add auth and a keyfile, before real data goes in. Keep Mongo Express off (`tools` profile) on a public host.
- Remove all data: `docker compose --profile app --profile tools down -v`.

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
- `db:seed` builds **five demo businesses** from `datasets/Dataset_Procurement.xlsx` through the real `purchase_orders` pipeline (history to 30 Sep 2024; amounts unchanged, each business in its own currency), runs a template-only advisory scan for each, and writes the held-back Oct–Dec 2024 quarter plus format examples to `apps/web/public/samples` (served at `/samples/...`, listed in `manifest.json`). Files already ingested are skipped (by hash). Expected transactions on an empty DB: UK 2,125 (+1 review line), DE 1,075, US 534, JP 277, AU 246. The hand-made files in `scripts/seed/data/samples/` are used by the tests and offered as format examples.
- If a demo login already holds data in another currency (an older seed), the seed stops and asks for `npm run db:reset && npm run db:seed`.

## Accounts & tenants
- Create an account at http://localhost:5173/#/signup (organization name, email, password). Each signup creates its own tenant: its data is invisible to every other account.
- `npm run db:seed` creates **development-only** demo accounts (password `Demo@12345`): `demo@procurement.test` (UK, GBP, the fullest demo), `demo.de@…` (EUR), `demo.us@…` (USD), `demo.jp@…` (JPY), `demo.au@…` (AUD). They are listed on the sign-in page. Skipped when `NODE_ENV=production`. Walkthrough: [demo-walkthrough.md](demo-walkthrough.md).
- Generate a production secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` and set `JWT_SECRET`.
- **Upgrading a pre-tenancy database:** run `npm run db:reset && npm run db:seed` (old documents have no `tenantId`).
- With `curl`, keep the cookie: `curl -c jar -H "Content-Type: application/json" -d '{"email":"demo@procurement.test","password":"Demo@12345"}' http://localhost:4000/api/v1/auth/login`, then `curl -b jar …`.

## Overview & advisory
- `#/overview` (default after sign-in): KPIs, charts and the guided tour; `GET /analytics/overview?months=12`.
- `#/advisory`: recommendations from the latest scan; **Analyse** re-runs it (defaults to the latest data date for historical datasets). Deep link a type with `#/advisory?type=SOURCING_SHIFT`.
- Inspect the stored insights and verify every narrative number from the command line: `npx tsx scripts/seed/inspect-insights.ts demo@procurement.test` (run inside `scripts/seed`).

## Product intelligence
- UI: `#/products` (Product Catalog: click a product for the economics deep-dive).
- Every dataset item has a category, prices from many suppliers and measured lead times; try editing a lead time and safety stock in the Reorder card.
- Lead time and safety stock are per-product settings (`PATCH /products/:id {"leadTimeDays": 7, "safetyStockDays": 3}`); without them a flagged 14-day lead time is assumed and safety stock is estimated statistically.
- API-only `asOf` (e.g. `GET /products/:id/intelligence?asOf=2025-06-10`) evaluates the reorder status at a past/future date; the seeded data is from 2025, so the default (today) reports stock as depleted.
- No new environment variables or scripts.

## Vendor intelligence
- UI: `#/vendors` (Vendor Directory: click a vendor for the deep-dive; Compare Suppliers: pick products to see a supplier price matrix).
- The demo businesses have 15 suppliers each with ERP profiles (country, tier, risk, ESG) and payment terms extracted from the POs (a configured value overrides them).
- Set a vendor's payment terms in the deep-dive (or `PATCH /vendors/:id {"paymentTermsDays": 30}`) to see "paid within terms" rates.
- No new environment variables or scripts. A cold directory request runs one aggregation over the tenant's vendors plus one for the page's order dates.

## Using the UI
Sign in (or pick a demo business) at `#/login`. `#/ingestion`: pick a source (or click **Upload this** on a sample file), drop files (validated client-side by extension and the 10 MB limit), track them in *Pipeline Activity*, resolve flagged matches with **Review**, and browse the normalised ledger, vendors and products in *Data Explorer*. *Market price pointers* (ONDC, IndiaMART, GeM, Agmarknet) are display-only "To do" cards: no importer exists yet. The former `#/system` tab was removed; API health remains at `GET /api/v1/health`.

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

The collection signs up its own throw-away accounts (unique emails per run; the Newman cookie jar carries the session), so it needs no seeded user. Folder 9 covers the analytics overview (isolation, KPI/series reconciliation, nulls for absent fields, validation); folder 8 the advisory engine. Folder 0 covers signup/login/logout/me; folder 7 covers product intelligence (catalog summaries, lowest/average/current price, best-vendor scoring and savings, price fluctuation, consumption and reorder planning, alternatives, settings, validation and cross-tenant isolation); folder 6 covers vendor intelligence (directory summaries and sorting, the deep-dive metrics, payment terms, supplier comparison and its validation errors); folder 5 proves tenant isolation by signing up a second organization and checking it cannot see, modify or collide with the first one's data. The items tests are self-contained (create and delete their own item). The ingestion tests upload files from `scripts/seed/data/samples/` (Newman `workingDir`), use `allowDuplicate=true` so they can re-run, and the vendor-dedupe test expects exactly one vendor matching "acme" (run against a dev/test database; `npm run db:reset && npm run db:seed` gives a clean state). `collection.json` and `local.env.json` are generated by `apps/api/tests/postman/build-collection.js` (`npm run postman:build -w @pi/api`); edit the generator, then regenerate. Both files can also be imported into Postman.

## Troubleshooting
- **`ECONNREFUSED`/server selection timeout**: container not healthy yet, or `MONGO_URI` lacks `directConnection=true`.
- **Health returns 503**: API is up but MongoDB is unreachable.
- **CORS errors**: add the web origin to `CORS_ORIGIN`.
