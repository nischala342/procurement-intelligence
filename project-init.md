# ROLE & OBJECTIVE
Act as a Principal Software Engineer. Your task is to scaffold a production-grade, full-stack monorepo using **Node.js (Express/TypeScript)**, **React (Vite/TypeScript)**, and **MongoDB (Mongoose)**, complete with automated **Postman/Newman API testing**, **deterministic mock data seeding**, and a **living documentation + AI prompt-history system**.

Execute this setup cleanly, modularly, and without placeholder TODOs.

---

# 1. REPOSITORY ARCHITECTURE
Initialize the following root structure:

```text
/
├── apps/
│   ├── api/                  # Node.js + Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── config/       # Env validation (Zod), DB connection, logger (Pino)
│   │   │   ├── modules/      # Domain-driven modules (e.g., health, auth, items)
│   │   │   │   └── <domain>/ # controller.ts, service.ts, model.ts, routes.ts, schema.ts
│   │   │   ├── middleware/   # Error handler, request validator, auth guard, rate limiter
│   │   │   ├── utils/        # Standard API response wrappers, custom AppError class
│   │   │   ├── app.ts        # Express app setup (Helmet, CORS, compression, routes)
│   │   │   └── server.ts     # Entry point & graceful shutdown handling
│   │   ├── tests/
│   │   │   └── postman/      # Postman Collection v2.1 JSON, environment JSON, Newman runner
│   │   └── package.json
│   └── web/                  # React + Vite + TypeScript frontend
│       ├── src/
│       │   ├── features/     # Feature-based architecture (components, hooks, api, types)
│       │   ├── shared/       # Reusable UI components, Axios/Fetch client, global hooks
│       │   ├── pages/        # Route-level composition
│       │   └── main.tsx
│       └── package.json
├── scripts/
│   └── seed/                 # Standalone TypeScript database seeding & teardown scripts
│       ├── data/             # Deterministic mock JSON/factory generators (@faker-js/faker)
│       ├── seed.ts           # Idempotent upserts / clean-and-seed runner
│       └── reset.ts          # Safe DB wipe for test/dev environments
├── docs/
│   ├── architecture.md       # System design, data flow, and folder conventions
│   ├── setup-and-ops.md      # Local setup, env vars, seeding, and Newman test execution
│   ├── api-reference.md      # Endpoint contracts, request/response schemas, error codes
│   └── prompt-changelog.md   # Structured log of reframed Claude commands & architectural context
├── .env.example              # Documented environment variables for API, Web, and Seeders
├── CLAUDE.md                 # Persistent AI agent rules for living docs & prompt reframing
├── docker-compose.yml        # Local MongoDB (with replica set or healthcheck) + Mongo Express
└── package.json              # Root workspace scripts (concurrently, lint, test, seed)
```

---

# 2. TECHNICAL SPECIFICATIONS & STANDARDS

### A. Backend (`apps/api`)
- **Strict Layering:** `Routes -> Validation Middleware (Zod) -> Controller -> Service -> Mongoose Model`. Never put business logic in controllers or DB queries in routes.
- **Standardized API Envelope:** Every response must follow `{ success: boolean, data?: T, error?: { code: string, message: string, details?: unknown }, meta?: object }`.
- **Observability & Security:** Configure `helmet`, `cors`, `pino-http` structured logging, and a centralized global error-handling middleware that catches async errors and formats Mongoose/Zod errors cleanly.
- **Base Domain:** Implement a complete `health` module (`GET /api/v1/health` checking DB connectivity) and a reference CRUD module (`items`) to demonstrate all architectural patterns end-to-end.

### B. Frontend (`apps/web`)
- **Feature-Based Structure:** Group code by domain under `src/features/` rather than global `components/` folders. Enforce one-way dependency flow (`shared -> features -> pages`).
- **Typed API Layer:** Create a centralized HTTP client in `src/shared/api/` with request/response interceptors matching the backend's standardized API envelope.
- **Base UI:** Build a clean System Status & Item Manager view connected to the backend to verify full-stack integration out of the box.

### C. Mock Data & Seeding (`scripts/seed`)
- Use `@faker-js/faker` with a **fixed seed** (`faker.seed(42)`) so test data is 100% deterministic across runs.
- Include explicit, predictable fixture records (e.g., known IDs/slugs) alongside generated records so automated tests can reliably query known entities.
- Add root npm scripts: `npm run db:seed` and `npm run db:reset`.

### D. Automated Postman / Newman Suite (`apps/api/tests/postman`)
- Generate a valid **Postman Collection v2.1** (`collection.json`) and environment file (`local.env.json`) covering:
  1. Health check (`200 OK`, DB status verification).
  2. Full CRUD lifecycle on `/api/v1/items` (Create -> Read -> Update -> Delete -> Verify 404).
  3. Negative/Validation tests (`400 Bad Request` on invalid payloads).
- Include Postman `pm.test(...)` assertion scripts inside the collection JSON verifying status codes, response schema structure, and dynamic variable chaining (e.g., saving `createdItemId` to environment variables).
- Configure `newman` + `newman-reporter-htmlextra` via `npm run test:api` to run the suite from the CLI and output an HTML report.

---

# 3. LIVING DOCUMENTATION & CLAUDE COMMAND PROTOCOL

Create and maintain the `docs/` directory and a root `CLAUDE.md` file with thorough, production-ready documentation:
1. **`docs/setup-and-ops.md`**: Prerequisites, step-by-step installation, Docker MongoDB startup, environment configuration, seeding commands, and running Newman tests.
2. **`docs/architecture.md`**: Architectural decisions, directory rules, request lifecycle, and frontend/backend boundaries.
3. **`docs/api-reference.md`**: Complete documentation of all endpoints, headers, payloads, and error codes.
4. **`docs/prompt-changelog.md` & `CLAUDE.md` (CRITICAL WORKFLOW RULE):**
   - Initialize `docs/prompt-changelog.md` with the architectural baseline established by this setup prompt.
   - Persist the following rule inside `CLAUDE.md` at the repository root so it applies automatically across all future sessions:
     1. **Reframe Raw Prompts:** Every time I give a new feature prompt or command in future turns, reframe my raw prompt into a clean, unambiguous **Principal-level engineering specification** (capturing intent, edge cases, acceptance criteria, and affected modules).
     2. **Log Context & Changes:** Append an entry to `docs/prompt-changelog.md` containing: **Timestamp/Version**, **Raw Prompt**, **Reframed Command**, **Architectural Context & Decisions**, and **Files/Features Added or Modified**.
     3. **Sync Feature Docs:** Update `docs/api-reference.md`, `docs/architecture.md`, and `docs/setup-and-ops.md` whenever routes, schemas, env vars, or scripts change.

---

# 4. EXECUTION ORDER
1. Scaffold the workspace configuration (`package.json`, TypeScript configs, `.env.example`, `docker-compose.yml`, `CLAUDE.md`).
2. Build `apps/api` with the health and reference CRUD modules.
3. Build `scripts/seed` and verify deterministic mock data generation.
4. Create `apps/api/tests/postman` collection, environment, and Newman test runner.
5. Build `apps/web` wired to the API.
6. Write all four documentation files in `docs/` in full detail.
7. Provide a concise verification checklist at the end showing the exact commands to boot Docker, seed the DB, run the API/Web apps, and execute the Newman test suite.