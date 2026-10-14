# Brand Sweeps Execution Plan (Route B)

This document specifies the strategy, search order, exact URLs, and end-to-end execution protocol for conducting brand-specific keyword sweeps (`Route B`) across Facebook Marketplace.

---

## 1. Why Route B Brand Sweeps Work

Facebook's category-wide feed (`/marketplace/category/vehicles`) returns metro-wide inventory where >70% of results are non-approved brands (Ford, Chevy, Hyundai, Nissan, etc.).

Searching by brand keyword (`query=<brand>`) with `sortBy=creation_time_descend` across the full $4,000–$10,500 band surfaces concentrated, date-sorted inventory that category sweeps bury. The completed Honda sweep proved this by yielding **2,419 cards and 1,723 brand-new unique listings**.

---

## 2. Brand Sweep Schedule & Priority Queue

| Priority | Brand | Search Query | Expected Volume | Key Target Models & Notes | Status |
|---|---|---|---|---|---|
| **#0** | **Honda** | `query=honda` | ~2,400 cards | Civic, Accord, CR-V, Fit, Pilot, HR-V | **DONE** (2026-08-23, 605 triaged) |
| **#1** | **Toyota** | `query=toyota` | ~2,000–3,000 cards | Corolla, Camry, RAV4, Prius, Yaris, Matrix, Avalon. *Also catches cross-listed Scion models.* | **DONE** (2026-08-23, 126 triaged) |
| **#2** | **Mazda** | `query=mazda` | ~400–700 cards | Mazda3, Mazda6, CX-5, CX-3, Mazda2 (SkyActiv 6-spd auto). *Reject Miata convertibles.* | **DONE** (2026-08-23, 15 triaged) |
| **#3** | **Acura** | `query=acura` | ~300–500 cards | ILX, TSX, TL, RDX, MDX (shares robust Honda K24 & J35 powertrains). | **DONE** (2026-08-23, 12 triaged) |
| **#4** | **Lexus** | `query=lexus` | ~300–600 cards | ES 350, RX 350, CT 200h, IS 250/350 (Toyota reliability with premium trim). | **DONE** (2026-08-23, 1 triaged) |
| **#5** | **Subaru** | `query=subaru` | ~250–500 cards | Impreza, Legacy, Forester, Crosstrek, Outback. | **DONE** (2026-08-23, 7 triaged) |
| **#6** | **Volkswagen** | `query=volkswagen` | ~800–1,200 cards | Jetta (2.5L 5-cyl priority), Golf, Passat, Tiguan. *Marginal cap applies (§2).* | **DONE** (2026-08-23, 5 triaged) |
| **#7** | **Volvo** | `query=volvo` | ~100–200 cards | S60, XC60, V60, S80 (2.5L T5 engines preferred). | **SKIPPED** (2026-08-23, negligible inventory) |

*Note on Scion:* Scion remains an approved brand under playbook §2 (any Scion surfaced will be scored as approved), but does not require a standalone keyword sweep because of low volume and Toyota cross-listing.

---

## 3. Step-by-Step Instructions for Agents

When starting a new chat to run or continue a brand sweep, follow this standard 4-step workflow:

### Step 1 — Open the Verified URL in Chrome

Pick the next uncompleted brand from the table above and open the pinned search tab:

```bash
cd tools/marketplace-cdp
node mp.js open "https://www.facebook.com/marketplace/category/search/?query={BRAND}&minPrice=4000&maxPrice=10500&maxMileage=110000&sortBy=creation_time_descend"
```

**Ask the user to scroll the opened tab to the bottom** (2–3 second pauses per batch until the feed stops loading new cards).

---

### Step 2 — Capture, Merge & Validate

Once the user confirms scrolling is finished, execute:

```bash
cd tools/marketplace-cdp
# 1. Read DOM cards into a timestamped feed capture
node mp.js read --out ../../captures/feeds/2026-08-23_4000-10500_{brand}_creation_time_descend.json

# 2. Merge into master.csv
node merge.js

# 3. Validate consistency
node validate.js
```

---

### Step 3 — Planner Triage & Queue Freezing

Do not attempt to open hundreds of listings in a single chat. Follow the planner/worker pattern from `DEV-JOURNAL.md`:

1. **Rebuild Remaining Candidates from the Capture:**
   - Filter `master.csv` for the current capture.
   - Drop non-cars: pickups (Tacoma, Tundra, Ridgeline), minivans (Sienna, Odyssey, Mazda5), convertibles (Miata, Eos, Cabriolet), motorcycles, ATVs, trailers, commercial trucks.
   - Drop off-brand leakage from title tokens.
   - Deduplicate against IDs already present in `seen_listings.md`.

2. **Apply Card-Level Screen (§3a):**
   - Model year ≥ 2022 at ≤ $10,500 → flag `Suspected down payment (card-only)`.
   - Model year 2019–2021 at ≤ $10,500 → **Must open** (§3a / §9a).
   - Pre-2019 → Normal candidate open queue.

3. **Generate Worker Prompt Files:**
   - Create directory `prompts/{brand}-route-b-chats/`.
   - Pack 15 IDs per batch, 2 batches (30 IDs) per worker prompt file.
   - Include exact `node mp.js item <ids...> --out ../../captures/items/items_batchNN.json` commands in each prompt.

---

### Step 4 — Worker Execution & Data Refresh

1. Run the worker prompts sequentially (or across worker chats in Agent mode) to open item pages, score survivors per playbook §5/§6, and write full markdown rows to `seen_listings.md`.
2. Update `search_checkpoint.md` with the new tally (`X/N`).
3. Rebuild the frontend evidence dataset:
   ```bash
   cd web && npm run data:build
   ```
4. Run `node tools/marketplace-cdp/validate.js` to confirm zero deduplication or schema errors.
