# ROLE & OBJECTIVE
Act as a Principal Frontend Engineer. Build a clean, enterprise-grade UI in `apps/web` for **Module 1: Business Data Ingestion & Normalisation**.

The platform consolidates fragmented procurement data (PDF/image invoices, Tally exports, Shopify syncs, Excel/CSV price lists, and bank statements) into a unified, normalized MongoDB database. Your goal is to build an intuitive, responsive interface that allows business users to upload/connect these sources, monitor normalization progress, resolve entity ambiguities, and inspect canonical records.

---

# 1. FEATURE ARCHITECTURE (`apps/web/src/features/ingestion`)
Follow the strict unidirectional dependency flow (`shared -> features -> pages`):
- `components/` — Modular UI components listed below
- `hooks/` — Custom hooks for file upload state, polling ingestion status, and entity resolution
- `api/` — Typed API client functions connecting to `POST /api/v1/ingest/:source` and canonical data endpoints
- `types/` — TypeScript interfaces for Staging Logs, Vendors, Products, and Transactions

---

# 2. REQUIRED UI ELEMENTS & VIEWS

### A. Multi-Source Ingestion Hub (Upload & Connect Zone)
- **Source Selector Tabs / Cards:** Clean visual cards allowing users to pick their input type:
  1. *Purchase Invoices* (PDF, PNG, JPG)
  2. *Tally Exports* (XML, JSON, CSV)
  3. *Shopify Sync* (CSV export upload or Store API connection trigger)
  4. *Excel / CSV Sheets* (Purchase orders & supplier price lists)
  5. *Bank Statements* (CSV, PDF)
- **Smart Dropzone:** Drag-and-drop multi-file uploader with client-side file type validation, file size indicators, and batch upload progress bars.

### B. Live Ingestion & Normalization Pipeline Tracker
- **Activity Feed / Queue Table:** Displays recently uploaded files and sync jobs with real-time status badges:
  - `PENDING` (Queued in raw staging)
  - `PARSING` (OCR / structure extraction active)
  - `NEEDS_REVIEW` (Entity mismatch or math discrepancy flagged)
  - `PROCESSED` (Normalized and persisted to canonical DB)
  - `FAILED` (With expandable error details and a "Retry" button)

### C. Entity Resolution & Review Drawer (Human-in-the-Loop)
- **Side-by-Side Comparison Modal/Drawer:** Triggered when a file has `NEEDS_REVIEW` status.
- **Vendor & SKU Matcher:** Shows extracted raw text (e.g., *"APEX PVT LTD"*) alongside suggested canonical database matches with confidence scores, letting the user either **Merge as Alias** or **Create New Entity** with one click.

### D. Unified Canonical Data Explorer
- **Tabbed Data Grid:** Clean, searchable, filterable tables to inspect the normalized output across three core tabs:
  1. **Transactions Ledger:** Unified view of invoices, POs, and bank payments with source badges, dates, and grand totals.
  2. **Vendors Directory:** Canonical supplier profiles displaying merged aliases, GSTIN/tax IDs, and payment terms.
  3. **Normalized Product Catalog:** Standardized SKUs, unified units of measure, and cross-vendor pricing history.
- **Line-Item Drilldown:** Clicking any transaction opens a clean detail drawer showing normalized line items, tax breakdowns, and a link to view the original raw source payload.

---

# 3. UX & DESIGN STANDARDS
- **Visual Aesthetic:** Clean, high-contrast B2B SaaS layout (inspired by Linear/Stripe) with crisp borders, subtle status pills, and tabular numbers (`tabular-nums`) for all financial figures and quantities.
- **Empty & Loading States:** Include skeleton loaders for tables and clear empty-state illustrations/prompts guiding first-time users to drop their first invoice or Tally export.
- **Accessibility:** Ensure keyboard navigation, ARIA labels on dropzones/drawers, and clear color-independent status indicators.

---

# 4. DOCUMENTATION & CHANGELOG REQUIREMENT
Per our `CLAUDE.md` protocol:
1. Reframe this prompt into a Principal-level specification and append it to `docs/prompt-changelog.md` with architectural context and created files.
2. Update `docs/architecture.md` with the `ingestion` feature module structure.