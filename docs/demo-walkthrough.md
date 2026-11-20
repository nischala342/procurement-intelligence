# quoteScout.info: demo walkthrough

A 10-minute tour of every capability, using the seeded demo data. Figures below are what a fresh `npm run db:reset && npm run db:seed` produces; they come from the reference dataset (`datasets/Dataset_Procurement.xlsx`) through the real ingestion pipeline. Nothing is hand-edited except the clearly labelled demo items listed at the end.

## 0. Start

```bash
npm install && cp .env.example .env
npm run db:up && npm run db:seed     # ~1 minute: 5 businesses, scans, sample files
npm run dev                          # http://localhost:5173
```

The sign-in page lists every demo workspace with its credentials (all use the password **`Demo@12345`**), a one-click **Sign in as this business** button, and that business's downloadable Q4 2024 file.

| Business | Login | Country · currency | Purchase lines (2022 – Sep 2024) |
|---|---|---|---|
| Thames Valley Manufacturing Ltd (**start here**) | `demo@procurement.test` | United Kingdom · GBP | 2,125 |
| Rheinwerk Fertigung GmbH | `demo.de@procurement.test` | Germany · EUR | 1,075 |
| Lakeshore Industrial Inc. | `demo.us@procurement.test` | United States · USD | 534 |
| Sakura Precision K.K. | `demo.jp@procurement.test` | Japan · JPY | 277 |
| Southern Cross Fabrication Pty Ltd | `demo.au@procurement.test` | Australia · AUD | 246 |

The dataset's lines are split across the five businesses by the currency they were recorded in. Amounts are **never converted**: each business reports in its own currency. Cancelled PO lines are skipped. October to December 2024 is held back as the downloadable "next quarter".

## 1. Overview (`#/overview`)

Signed in as the UK business, analysed as of 30 Sep 2024 (its latest data):

- **Spend, last 12 months:** £129.2m, down 11.4% on the 12 months before; 762 PO lines, 15 active suppliers, 51 products.
- **On-time delivery:** 65.5% against an 85% target ("well below target"), and the monthly trend chart shows it.
- **Maverick spend:** 12.4% of PO spend was bought off-contract. **Price vs budget:** −8% overall. **Contract coverage:** 59.1%.
- **Spend by category** (IT Software 32.3%, Marketing 18.3%, …), **top suppliers** with their on-time rate, the **recommendation mix** by severity and type, and the **data sources** feeding the ledger.
- Switch the window between 6, 12 and 24 months. Hover any column or point for exact values; each chart has a data table.
- The **guided tour** card links to each stop below; hide it with ✕ and bring it back later.

## 2. Advisory (`#/advisory`)

The scan ran during seeding (templates only, no external calls). Open **Sourcing shift**:

> Quantum Electronics is your largest IT Software supplier (£9,273,049.23 in the last 12 months) at a median price index of 1.2446. EuroBuild Materials sits at 0.877, about 29.5% lower, and the gap is statistically significant (p = 0.0233; 18 vs 10 purchase lines).

**Inspect evidence** shows the scorecards (price index, on-time, risk, ESG, composite score), the test, and the saving formula. **Draft RFQ** builds a request for quotation in GBP with the quantities and reference price filled in.

Also try:
- **Maverick spend** and **Budget overrun**: off-contract and over-budget buying by category, with the lines and suppliers behind them. One maverick insight is pre-set to *Actioned* and one budget insight to *Snoozed*; filter the feed by status to see them.
- **Supply risk**: high-risk supplier concentration, with safer alternatives scored.
- **Delivery risk**: portfolio on-time rate against target, with the least and most reliable suppliers.
- **Consolidation (category)**: items bought from many suppliers whose prices vary widely. The saving uses supplier *medians* and is marked low confidence.
- **Reorder alerts**: lead times are *measured* from PO history (75th percentile), not assumed.
- **Market savings**: one labelled demo benchmark (see below).
- Re-run the analysis with **Analyse** (optionally pick an "as of" date).

### Why the engine stays quiet

Prices in this dataset vary about 34% even for the same supplier and item, while real supplier differences are about 5%. Single-price comparisons would be mostly noise. The engine therefore:
1. compares **price indices** (price ÷ the item's median price) pooled per category, shrunk toward 1 for thin samples;
2. requires a **one-sided Mann–Whitney test** before claiming one supplier is cheaper or prices rose (p < 0.05 for sourcing shifts; p < 0.01 for per-item creep/variance, which are tested many times);
3. uses **Wilson intervals** for delivery rates, so a supplier with few deliveries is not called unreliable by chance;
4. caps each type at 8 insights per scan.

The Japanese and Australian businesses have sparse history, so they get far fewer recommendations. That is the intended behaviour.

## 3. Vendors (`#/vendors`) and Products (`#/products`)

- **Vendors:** the directory shows spend and cadence. Open a supplier for its ERP profile (country, tier, risk, ESG), payment terms *extracted from the POs*, price trend, catalogue and supplier comparison.
- **Products:** each product's category and unit type, paid vs quoted price history, supplier matrix, best-vendor score, alternatives, and a reorder plan you can tune (lead time, safety stock).

## 4. Ingestion (`#/ingestion`)

1. **Pipeline Activity** shows the seeded history file and a one-line file containing **"Meridian Technology"**, a near-duplicate of the supplier "Meridian Tech". It is flagged *Needs review*: open **Review** and merge it.
2. Under **Sample files to try**, click **Upload this** on *United Kingdom: purchase orders Oct–Dec 2024* (223 lines). The Purchase Orders source is selected and the file uploads.
3. Back on the Overview, the window moves to Jan–Dec 2024 and spend becomes £143.4m (+7.9%). Run **Analyse** in Advisory to refresh the recommendations with the new quarter.
4. Below the upload area, **Market price pointers** (ONDC, IndiaMART, GeM, Agmarknet) are shown as *To do*: roadmap placeholders with no importer yet, so nothing is fetched or shown from them.
5. Other formats (Tally XML, bank statement, Shopify orders, a supplier price list with one deliberately broken row) are there too. They are small INR files, converted into the business's currency with the static reference rates.

## Clearly labelled demo items

- **Demo benchmark:** a market price for *Steel Sheet (kg)* set at 85% of the recent median paid, sourced as "Demo benchmark (seed data, not a real market quote)", to show the market-savings workflow.
- **Supplier-name variant:** one real UK line re-sent as "Meridian Technology", to show the review queue.
- **Review states:** one insight actioned and one snoozed by "seed script", so those views are not empty.
- Business names, countries and logins are fictitious. The dataset's currency labels are nominal, so amounts are shown exactly as recorded.

Reset at any time with `npm run db:reset && npm run db:seed`.
