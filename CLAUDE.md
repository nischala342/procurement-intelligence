# CLAUDE.md — Procurement Intelligence

Persistent rules for AI agents working in this repository. They apply automatically in every session.

## Project snapshot
- Monorepo (npm workspaces): `apps/api` (Express + TypeScript + Mongoose), `apps/web` (React + Vite + TypeScript), `scripts/seed` (deterministic seeding), `docs/`.
- API layering is strict: `Routes -> Zod validation middleware -> Controller -> Service -> Mongoose Model`. No business logic in controllers, no DB queries in routes.
- Every API response uses the envelope `{ success, data?, error?: { code, message, details? }, meta? }` (see `apps/api/src/utils/response.ts`).
- Frontend dependency flow is one-way: `shared -> features -> pages`. Features never import from pages or from other features' internals.
- Auth: HTTP-only `accessToken` cookie (JWT). Tenant data (`ingestion`, `vendors`, `products`, `transactions`) is tenant-scoped: controllers pass `tenantOf(req)` to services, and **every** query on a tenant model must filter by `tenantId`. Never take `tenantId` from request input. Cross-tenant ids must 404.
- Env vars live in the root `.env` (template: `.env.example`).
- Common commands: `npm run db:up`, `npm run db:seed`, `npm run dev`, `npm run test:api`, `npm run typecheck`.

## CRITICAL WORKFLOW RULE — Prompt reframing & living docs
For **every** new feature prompt or command the user gives:

1. **Reframe the raw prompt** into a clean, unambiguous **Principal-level engineering specification** that captures intent, edge cases, acceptance criteria, and affected modules. Show it briefly before implementing.
2. **Log context & changes:** append an entry to `docs/prompt-changelog.md` containing:
   - **Timestamp/Version**
   - **Raw Prompt**
   - **Reframed Command**
   - **Architectural Context & Decisions**
   - **Files/Features Added or Modified**
3. **Sync feature docs:** update `docs/api-reference.md`, `docs/architecture.md`, and `docs/setup-and-ops.md` whenever routes, schemas, env vars, or scripts change. Also update `.env.example` and the Postman collection when the API contract changes.

Do this as part of the same change — a feature is not done until the changelog and docs are updated.
