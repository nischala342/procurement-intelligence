# ROLE & OBJECTIVE
Act as a Principal Full-Stack Engineer. Implement **User Authentication (Signup / Login / Logout)** and secure **Multi-Tenant Data Ingestion** across the backend (`apps/api`), database (`MongoDB`), and frontend (`apps/web`). 

Every ingestion record, vendor, product, and transaction must be strictly isolated by `tenantId` (linked to the authenticated user/organization), ensuring complete data privacy and user-level scoping.

---

# 1. BACKEND CHANGES (`apps/api`)

### A. Authentication Module (`/src/modules/auth`)
- **Schema & Model (`user.model.ts`):** 
  - Fields: `email` (unique, indexed), `passwordHash` (argon2 or bcrypt), `organizationName`, `createdAt`, `updatedAt`.
- **Controllers & Services (`auth.controller.ts`, `auth.service.ts`):**
  - `POST /api/v1/auth/signup`: Validates input with Zod, hashes password, creates the user, and initializes a default tenant profile.
  - `POST /api/v1/auth/login`: Verifies credentials, issues a secure HTTP-only JWT cookie (`accessToken`), and returns user session details.
  - `POST /api/v1/auth/logout`: Clears the authentication cookie.
  - `GET /api/v1/auth/me`: Validates session cookie and returns current user context.
- **Auth Guard Middleware (`auth.guard.ts`):**
  - Verifies JWT from cookies/headers, attaches `req.user = { userId, email, tenantId }` to the request lifecycle, returning `401 Unauthorized` on failure.

### B. Tenant Isolation in Ingestion & Canonical Schemas
- Update all core Mongoose models (`Vendors`, `Products`, `Transactions`, `RawStagingLogs`) to include a required `tenantId` (ObjectId referencing the User/Organization ID) with compound indexes on `[tenantId, ...uniqueKeys]` (e.g., SKU per tenant, vendor name per tenant).
- Update the ingestion pipeline endpoints (`POST /api/v1/ingest/:source`) to automatically inject `req.user.tenantId` into every staged and canonical document created.

---

# 2. FRONTEND & UI ARCHITECTURE (`apps/web`)

### A. Authentication Flow & State
- **Auth Feature (`src/features/auth`):**
  - Forms for Signup and Login with Zod validation.
  - Global Auth Context / Zustand store tracking session state (`isAuthenticated`, `user`, `logout()`).
  - Protected Route wrapper (`RequireAuth`) redirecting unauthenticated users to `/login`.

### B. Clean UI Specifications
Design a high-contrast, professional B2B SaaS interface:
1. **Auth Screens (`/login`, `/signup`):**
   - Centered card layout with subtle borders, clear validation error feedback, and a polished split-screen aesthetic (branding/value proposition on the left, clean form on the right).
2. **Global Navigation Shell:**
   - Top navbar featuring the organization name, active tenant indicator, notification bell, and a clean user dropdown avatar menu with a prominent **Logout** action.
3. **Multi-Tenant Ingestion Hub:**
   - Integrates the Ingestion Hub, Pipeline Tracker, and Canonical Data Explorer built previously, now dynamically filtered and bound strictly to the logged-in user's `tenantId`.
   - Empty state prompts users to upload their first batch of invoices or Tally files with zero cross-tenant leakage.

---

# 3. DOCUMENTATION & CHANGELOG REQUIREMENT
Per our `CLAUDE.md` protocol:
1. Reframe this prompt into a Principal-level engineering specification and append an entry to `docs/prompt-changelog.md`.
2. Update `docs/architecture.md` and `docs/api-reference.md` to document the new auth endpoints (`/signup`, `/login`, `/logout`, `/me`) and tenant isolation design.