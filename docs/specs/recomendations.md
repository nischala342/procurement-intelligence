# ROLE & OBJECTIVE
Act as a Principal Full-Stack & AI Systems Engineer. Build **Module 5: Actionable Procurement Intelligence & Advisory Layer** across the backend (`apps/api`), LLM/analytics synthesis service, and frontend (`apps/web`).

This is the final intelligence layer. It synthesizes normalized procurement history (Module 1), supplier behavior (Module 2), SKU economics (Module 3), and verified external market benchmarks (Module 4) into **plain-language, evidence-backed recommendations and risk alerts**—such as cost creep alerts, overpaying supplier flags, fragmented spend consolidation opportunities, reorder lead-time warnings, and targeted RFQ (Request for Quotation) suggestions.

Every insight must be grounded strictly in computed metrics and verified records—never speculative or fabricated numbers.

---

# 1. BACKEND & SYNTHESIS ARCHITECTURE (`apps/api`)

### A. Deterministic Signal Engine (`/src/modules/advisory/signals.service.ts`)
Before invoking any LLM, run deterministic analytical checks scoped by `tenantId` over the MongoDB collections to extract concrete evidence packets:
1. **Cost Inflation / Creep Signals:** Detect percentage price increases across categories or SKUs over rolling windows (e.g., 30/60/90 days) compared to prior baselines.
2. **Supplier Overpricing Signals:** Identify vendors whose unit prices consistently exceed peer/alternative suppliers for comparable items or categories.
3. **Spend Fragmentation Signals:** Detect SKUs or raw materials split across multiple vendors (e.g., 3+ suppliers) where order consolidation could improve volume leverage.
4. **Reorder & Stockout Runway Signals:** Flag products approaching reorder thresholds or projected depletion windows based on purchase/consumption cadence.
5. **External Benchmark Arbitrage Signals:** Surface verified lower external prices (from Module 4) where switching or requesting quotations yields measurable gross savings.

### B. Grounded Advisory Synthesis Service (`/src/modules/advisory/advisory.service.ts`)
- Pass **only** computed signal payloads and verified database IDs/metrics into the LLM synthesis layer (e.g., Claude API with structured JSON output / Zod validation).
- Enforce strict grounding rules:
  - Every generated insight must reference specific underlying metrics, entity IDs, time windows, and confidence/severity levels (`HIGH`, `MEDIUM`, `LOW`).
  - Never invent prices, percentages, dates, or external quotes not present in the input signal payload.
  - Support dismissal, snoozing, or marking insights as "Actioned" so users manage recommendations cleanly.

### C. API Endpoints (`/src/modules/advisory`)
- `GET /api/v1/advisory/insights`: Fetch active, filtered procurement insights (`type`, `severity`, `status`) for the authenticated `tenantId`.
- `POST /api/v1/advisory/generate`: Trigger an on-demand signal scan and insight generation run for the tenant.
- `PATCH /api/v1/advisory/insights/:id/status`: Update insight lifecycle state (`ACTIVE`, `ACTIONED`, `DISMISSED`, `SNOOZED`).
- `POST /api/v1/advisory/insights/:id/rfq-draft`: Generate a structured RFQ / quotation request summary referencing the specific items and recommended alternative suppliers.

---

# 2. FRONTEND & UI ARCHITECTURE (`apps/web`)

### A. Feature Structure (`src/features/advisory`)
- `components/` — Executive Advisory Feed, Insight Priority Cards, Evidence & Metric Drawer, Spend Consolidation Simulator, and RFQ Draft Modal.
- `api/` — Typed API client for fetching insights, triggering scans, and updating insight statuses.
- `hooks/` — React Query hooks managing insight filtering, mutations, and scan refreshes.

### B. Clean UI Specifications
1. **Actionable Insights Command Center:**
   - Top summary strip showing counts by category (*Cost Creep*, *Supplier Variance*, *Consolidation*, *Reorder Alerts*, *Market Savings*) and a **"Run Intelligence Scan"** action button.
   - Clean, scannable insight cards displaying a plain-language headline, quantified impact (`tabular-nums`), severity badge, and quick actions (*Inspect Evidence*, *Draft RFQ*, *Dismiss*).
2. **Evidence & Metric Provenance Drawer:**
   - Clicking *"Inspect Evidence"* opens a side drawer showing the exact numbers behind the recommendation—historical prices, vendor comparisons, verified external benchmark sources, and links to the underlying Vendor, Product, or Transaction records.
3. **RFQ & Supplier Action Helper:**
   - Allows users to select recommended alternative suppliers for an insight and copy or export a clean quotation request checklist with exact item specs and target quantities.

---

# 3. DOCUMENTATION & CHANGELOG REQUIREMENT
Per our `CLAUDE.md` protocol:
1. Reframe this prompt into a Principal-level engineering specification and append an entry to `docs/prompt-changelog.md`.
2. Update `docs/architecture.md` and `docs/api-reference.md` with the deterministic signal engine, grounded LLM synthesis contract, and `/api/v1/advisory/*` endpoints.