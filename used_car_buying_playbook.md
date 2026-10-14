# Used Car Marketplace Buying Playbook
### Pembroke Pines, FL — for use with Claude, ChatGPT, or any browsing-capable AI assistant

**Last revised:** 2026-08-26 (rebuilt-title quality gate: severe crash / airbags / missing repair docs / thin discount → pass; adopted from a field case in §6)

---

## 1. Purpose

This is a reusable instruction set for an AI assistant (Claude desktop app, ChatGPT, or similar) to search Facebook Marketplace (or other used-car listing sites) on your behalf, filter listings against your real buying criteria, flag anything suspicious or misleading, and hand you back a ranked shortlist instead of a raw dump of 50 listings.

This playbook is designed to be run **repeatedly (e.g. daily)** without re-showing listings you've already seen — see §12 for how the tracker file (`seen_listings.md`) handles that.

**How to use it:** paste the relevant sections (or the whole doc) into a new Claude Project's custom instructions, a ChatGPT Custom GPT's instructions field, or directly into a chat as context before asking it to search. The kickoff prompts in §10 are the one-line triggers to start a run once the instructions are loaded.

**Read §8 before writing any search URL.** Most of Facebook's vehicle filters do not work. Building a search on the assumption that they do wastes the majority of a run.

---

## 2. Buyer Profile & Search Criteria

| Criterion | Rule |
|---|---|
| **Maximum asking price** | **$10,500.** Do not open anything advertised above this. |
| **Expected negotiation** | 10–15% off asking is typical on Marketplace; more when paying cash immediately. A $10,500 ask is a realistic ~$9,000 car. Score on the asking price, but treat negotiability signals as real value — see §5. |
| **Target settled cash price** | Roughly $9,000 or below. |
| **Search floor** | $4,000. Below this, a complete running car essentially does not exist in this market — see §3. |
| **Price slices** | $4,000–$5,999 · $6,000–$7,499 · $7,500–$8,999 · $9,000–$10,500 |
| **Mileage** | 110,000 miles or less. **Hard cutoff.** |
| **Location** | Pembroke Pines, FL (changed from Fort Lauderdale 2026-08-20). **Distance is a soft factor, not a hard filter** — see §7. A longer drive is acceptable when the listing has been verified by message first (§11). Miami-Dade is now the near field: Hialeah, Miami, Miami Gardens, Doral and Miami Lakes are all 0–20 mi. Boca Raton and Delray Beach are now 30+ mi. |
| **Title status** | Clean preferred. Rebuilt acceptable only when it clears the §6 rebuild quality gate (light cosmetic damage, documented repairs, no airbag deployment, no structural damage, and a large discount vs clean-title comps). Salvage / flood / junk / "no title" / "bill of sale only" = **reject**. |
| **Allowed body types** | Sedans, hatchbacks, wagons, crossovers, SUVs, coupes, and Facebook's "Small Car" category. No preference points among them. Coupes remain eligible, but recommend one only when its exact model/powertrain has a strong reliability outlook and affordable long-term ownership. |
| **Excluded body types** | Minivans; pickup trucks and other trucks; commercial, cargo, and passenger vans. **Convertibles are currently excluded** — flag any that looks exceptional rather than silently dropping it, so the decision can be revisited. |
| **Approved brands** | Toyota, Honda, Mazda, Lexus, Acura, Subaru, Scion, Volkswagen, Volvo. Only these; any unlisted brand is `Rejected: brand`. |
| **Explicitly excluded brands** | Dodge, Chrysler, Jeep, Ram, Chevrolet, Cadillac, GMC, Buick, Ford, Lincoln, Kia, Hyundai, Genesis, Nissan. Hard rejects. |
| **Volkswagen caveat** | VW is the weakest fit of the nine approved brands for "reliable and cheap to own long-term." It stays approved, but a VW cannot score above **Marginal** without either a Good model-year/powertrain reliability outlook *and* maintenance records, or credible evidence the known failure points were addressed. |
| **Reliability / long-term prospects** | High priority — the purchase and repair budget is limited. For every listing that survives the cheap hard filters, evaluate the exact model year and powertrain (not the brand) for recurring engine, transmission, hybrid-battery, or electrical failures; parts availability; repair complexity; maintenance history; and likely remaining useful life. |
| **Listing language** | Does **not** affect scraping, filtering, scoring, ranking, or deal reasoning. English, Spanish, and mixed listings are evaluated identically. Handle any communication need manually, after the vehicle qualifies. |

**A note on "crossover":** Facebook has no Crossover body style — crossovers are filed under SUV. Don't search for it as a separate category.

---

## 3. Price Interpretation Rules (read this twice — it's the part that goes wrong most often)

Facebook Marketplace car listings routinely show a **misleading headline price**. Always determine which of these applies:

1. **True cash price.** Usually confirmed by "cash price," "firm," or the absence of any financing language.
2. **Down-payment price disguised as the sale price.** Common in South Florida, often bilingual, with language like *"Shown prices are the amount to be financed after a 15–45% down payment,"* *"Financing available,"* *"Not cash price,"* *"ITIN accepted."*
3. **Unclear.** No financing language, but no explicit cash statement either. Treat as likely-cash, flag as unconfirmed.

**Rule:** never treat the headline price as gospel. Scan the full description — including "See more" expanded text — before recording a price. If financing language is present the price is **unverified**, not wrong: set **Price Type = "Unverified (financing language)"** and ask the seller directly: *"Is that your cash price, or a financed down payment? Any dealer or doc fees on top?"*

**Field evidence, 2026-08-22 (the user's own seller replies).** The user messaged a batch of listings carrying financing language. **A good share replied that the listed price is the cash price, and most of those said there are no dealer fees.** That is decisive: financing language advertises a *payment option*, it does not redefine the price. Treating it as proof of a disguised down payment was wrong, and these listings are frequently exceptional value precisely because everyone else assumes the worst and skips them.

Two consequences, both binding:

1. **Financing language never subtracts points** (§5). It caps the tier until the price is verified, and nothing more. An unverified price is missing information, and missing information does not reduce a score — that is the pending-info rule.
2. **The question is cheap and the answer is high-value, so ask it early.** A confirmed cash price plus a confirmed absence of fees converts an ignored listing into a scored candidate in one message. This is the highest-yield action available in this search.

### 3a. The year-vs-price screen (a triage hint, not a rejection)

Disguised down-payment ads often are identifiable without opening the listing, because they advertise late-model cars at impossible prices. But the screen is only trustworthy at the extreme end, and treating it as a rejection cost this search real candidates. Measured on 2026-08-21 by re-opening every 2019–2020 card that had been flagged from its card alone:

| Card-flagged cohort | Genuine down payment | False positive |
|---|---|---|
| 2019–2020, ≤ $10,500 (n=76) | 19 (25%) | 57 (75%) |
| 2022+, ≤ $10,500 (control sample, n=3) | 3 (100%) | 0 |

The 2019–2020 false positives were overwhelmingly rebuilt-title cars, high-mileage cars, and cash sellers who wrote three words. A seven-year-old rebuilt Corolla at $6,500 is an ordinary listing, not a scam. Of the 57, **36 cleared every hard filter** and are now live candidates, 16 turned out to be ordinary mileage rejects, 3 had sold, and 2 were unreadable.

> **Rule: the card screen flags, it never rejects.**
>
> - **Every 2019+ card at ≤ $10,500 is a Long shot** (§3b) and belongs in that category, whatever else is true about it.
> - **Model year ≥ 2022 AND price ≤ $10,500** → the price is almost certainly not a cash price, so a card-only `Unverified` flag is safe. Still open it before recommending it.
> - **Model year 2019–2021 AND price ≤ $10,500** → **must open** (§9a). The card is not evidence.
> - Any card-only flag is provisional. Write `card-only` in the tracker's evidence note so a later pass can tell it apart from a flag confirmed on the page.
- **A financing flag never substitutes for the hard filters.** Sixteen of the 57 false positives were plain mileage rejects that nobody had measured, because the down-payment label had already ended the conversation. Record mileage and title for every listing you open, whatever else is wrong with it.

**The 2019–2021 boundary is an estimate, not a measurement.** 2019 and 2020 were measured directly (n=76). 2021 was never opened — it is a must-open year because the false-positive rate plausibly decays smoothly with model year, not because anyone checked. The 2022 cutoff rests on a three-listing control sample. Treat both boundaries as provisional and move them when there is data.

Real examples where the card screen was right — note that all of them are 2021 or newer:

| Listing | Ask |
|---|---|
| 2025 Toyota RAV4 Woodland | $4,000 |
| 2024 Toyota Tacoma TRD Off Road | $4,000 |
| 2026 Toyota 4Runner SR5 | $5,000 |
| 2023 Toyota 4Runner Limited | $5,000 |
| 2021 Chevrolet Suburban | $4,000 |
| 2024 GMC Yukon | $4,000 |
| 2025 BMW X7 | $4,000 |
| 2026 BMW 330i xDrive | $5,000 |
| 2023 Toyota RAV4 Prime XSE | $9,000 |
| 2023 Toyota Camry XSE | $8,000 |
| 2023 Toyota Corolla LE | $9,999 |

These cluster geographically — Davie and Hollywood produced most of the above — and by seller. Note the pattern when it appears.

**Current handling:** these listings stay in the tracker, in ranked results, and in the Long shots category. They are never price-verified or visit-ready until the seller confirms a cash price, but they are also never penalised for it (§5).

**What financing language actually looks like on the page**, so a flag is not guesswork. Any one of these means the price is unverified — *not* that it is a down payment:

- An explicit financing offer: "financing available", "we finance", "in-house financing", "buy here pay here", "no credit check", "ITIN", "matrícula", "licencia".
- A payment schedule: "$X down", "$X/mo", "weekly payments", "48 months", "APR".
- The Spanish-language equivalents that dominate this market: *"enganche"*, *"inicial"*, *"pago inicial"*, *"mensualidad"*, *"pagos semanales"*, *"aceptamos ITIN"*.
- A price qualifier that concedes the headline is not the price: "price is the down payment", "not cash price", "precio de entrada", *"para llevar"* / "to take home".

**The trap that hid several of these:** the financing language is sometimes only in the *listing title*, not the description — a title like "2020 Nissan Sentra $1,500 down" with a blank description. Scan the title and the description, not the description alone.

Absence of all of the above, combined with a stated cash price or no financing language at all, means the listing is **not** a down-payment ad. Sparseness is not evidence of one.

**Only one thing settles the price: the seller saying so.** A page that quotes an explicit cash figure is good evidence. A reply to a direct question is better, and it is the only thing that lifts the tier cap in §5.

### 3b. Standing categories

These exist because the listings in them were being lost — not to a filter anyone chose, but to accumulated caution. All three are derived automatically, so nothing depends on remembering to tag a row.

**Long shots — late-model cars at economy prices.**

> Approved brand, **model year ≥ 2019, asking price ≤ $10,500**.

If the price is real, this is the best value available anywhere in the search: a car with years of service left, for the price of a fifteen-year-old commuter. If it isn't, the reason is usually a rebuilt title, undisclosed damage, or a financing figure. The category exists to hold that bet openly rather than resolve it by assumption. Expect most to disappoint and a few to be extraordinary; the user's stated position (2026-08-22) is that one right answer here beats a shelf of safe clean-title cars, and that is a deliberate risk preference, not an oversight to be corrected.

Long shots are surfaced as a category, never promoted into the shortlist on price alone. Everything in §5, §6 and §11 still applies — most importantly, the verification bar in §11 rises with the size of the discount.

**Rebuilt & High-Risk VIN Decoding (Copart/IAAI Auction Records):**
Whenever evaluating high-risk/high-reward or rebuilt-title candidates, decode the VIN on free public insurance auction archives before proceeding:
- [BidFax / Bid.cars](https://bid.cars/)
- [AutoAuctionHistory](https://autoauctionhistory.com/)

These databases index historical Copart and IAAI total-loss insurance auction listings, providing original pre-repair crash photos, primary/secondary damage designations, airbag deployment status, frame damage warnings, and waterlines on flood claims at zero cost. This immediately reveals whether a rebuilt title was a light cosmetic repair or catastrophic structural impact. After the photos, apply the §6 rebuild quality gate — a rebuilt car can fail even when it is not flood.

**Worth asking — price unverified, one message from resolution.**

> Any listing whose Price Type is not a confirmed cash price, whether because of financing language or because nothing was stated.

Measured by the user's own replies, a good share of these turn out to be cash at the listed price with no dealer fees. The category is a work queue, ordered by how good the car would be if the answer comes back clean. Send the §11 message; record the answer per §12; re-score.

**Outside approved brands — unlisted late-model cars, look-queue only.**

> Known passenger-car make that is **neither approved nor on the explicit exclude list**, model year ≥ 2019, asking price ≤ $10,500.

This is how a 2019 Infiniti Q50 at $10,000 can be glanced at without changing brand policy. Hard-rejected brands (Nissan, Hyundai, Chevrolet, Kia, Ford, and the rest of §2) stay out. Trailers, motorcycles, and unparseable Marketplace junk stay out. None of these cars enter the scored funnel or the shortlist.

The German exploratory sweep is separate and stops at 2018. A 2019–2021 BMW, Mercedes, Audi, Porsche, MINI, or Alfa at this price lands here, not there. Apply the same §3a screen: 2019–2021 must be opened before you trust the figure; 2022+ at ≤ $10,500 is almost certainly a down payment.

---

## 4. Data to Extract Per Listing

From the listing's own page — mileage and title status are never visible from the search grid:

- Year, Make, Model, Trim
- Engine/powertrain, when shown or reliably identifiable
- Listed price + **Price Type** (Cash confirmed by reply / Cash stated in listing / Unverified — financing language / Unverified — nothing stated)
- **Mandatory fees** — dealer fee, doc fee, tag/transfer, "plus taxes and fees". Ask when not stated; they routinely add $500–$1,500 and belong in the effective cash price (§5)
- **Negotiability signals** — price already reduced (struck-through price), days on market, "OBO"/"negotiable"/"must sell" in the description
- Mileage
- Title status — check **both** the structured "About this vehicle" field *and* the free-text description; flag any contradiction
- Location (city) and distance band (§7)
- Number of owners, if listed
- VIN, if listed; whether it is a complete 17-character VIN and whether it decodes to the advertised vehicle
- Dashboard evidence: whether the vehicle appears fully running/READY, whether the odometer is visible, whether any warning lights are lit
- Transmission, fuel type, colors (nice-to-have)
- Seller type (private individual vs. dealer/business listing)
- Seller account signals: rating/review count, "Joined Facebook in [year]"
- **Seller fingerprint** — phone number plus a short description-template signature. This is what makes curbstoning detectable across runs (see §6).
- **Listed Date** — Marketplace shows only relative age ("Listed 3 days ago"). Convert to a real calendar date using the run date and store that, not the relative text.
- Full seller description text (needed for financing language, title status, and red flags — not just the truncated preview)
- Reliability / ownership outlook for hard-filter survivors: `Good`, `Mixed`, `Poor`, or `Unresearched`, with a model-year/powertrain-specific reason
- Listing URL

---

## 5. Scoring & Triage System

Score each listing that passes the hard filters (allowed body type, approved brand, mileage ≤110k, title not salvage/flood, asking price $4,000–$10,500).

### Price

| Asking price | Points |
|---|---|
| ≤ $6,000 | +3 |
| $6,001–$7,500 | +2 |
| $7,501–$9,000 | +1 |
| $9,001–$10,500 | 0 |
| > $10,500 | **Reject** |

### Price type

Score the price band on the **effective cash price**: the confirmed cash figure plus any mandatory dealer, doc, or transfer fees. A $9,000 car with a $1,200 doc fee is a $10,200 car and bands accordingly. Where no cash price is confirmed, band on the advertised price and cap the tier.

| Condition | Effect |
|---|---|
| Cash price confirmed by a seller reply, fees confirmed or excluded | Full price-band points, **+1**, no cap |
| Cash price stated in the listing text, unconfirmed by reply | Full price-band points, **+1**, no cap |
| Nothing said about price type, and no financing language anywhere | Full price-band points, no bonus, no cap |
| Financing language present — the figure *may* still be the cash price | Full price-band points, **no penalty**, **tier capped at "Worth a look"** until a seller reply settles it |
| The ad itself says the figure is a down payment ("$1,500 down", "not cash price", *"enganche"*) | **No price-band points** — the number is not the car's price, so there is nothing to band — **no penalty**, **capped at "Marginal"**. Band it normally once the seller gives the real cash figure |

Two distinctions that must not be collapsed again:

- **Silence is not doubt.** A plain listing that never mentions financing gets no cap. Most private sellers say nothing about payment type, and capping them all would empty the shortlist without identifying a single real risk. The cap is for listings that gave you a *reason* to doubt the number.
- **An offer is not a price statement.** "Financing available" alongside a price is an offer and leaves the price merely unverified. "$1,500 down" *is* the price statement and means the headline number is not what the car costs. Only the second removes the price band.

**A confirmed §6 scam-network or curbstoning match also caps at Marginal**, independently of price. These stay visible — the pattern is worth recognising on sight — but they are never shortlisted, whatever the arithmetic says. Without this cap, retiring the financing penalty would have promoted known BHPH network ads into "Worth a look" purely because a threshold moved.

**Revised 2026-08-22, and this replaces a rule that was actively wrong.** Financing language used to void the price band and levy −1. Both are retired. The user's seller replies (§3) show a good share of these listings are cash at the listed price with no fees, so the old treatment was penalising listings for a payment option the seller merely offered.

*Rationale: cap, don't subtract. A listing whose price is unverified cannot be a Strong match, because the number might be wrong — that is what the cap is for, and the cap is sufficient. Subtracting points on top of the cap punished the listing twice for one uncertainty and pushed genuinely cheap cars below expensive ones. This is the same principle as the pending-info rule below; the two must not diverge again.*

### Negotiability

| Signal | Points |
|---|---|
| Price already reduced (struck-through on card) | +1 |
| Listed 30+ days ago | +1 |
| "OBO" / "negotiable" / "must sell" in description | +1 |

### Title

| Condition | Points |
|---|---|
| Clean | +2 |
| Rebuilt that clears the §6 quality gate (light cosmetic, documented, no airbags, no structure, ~35–45%+ off clean comps) | 0 |
| Rebuilt that fails the §6 quality gate | **Reject** |
| No info given | −1 (flag — ask seller) |
| Salvage / flood / junk / no title | **Reject** |

### Mileage

| Range | Points |
|---|---|
| < 60,000 | +2 |
| 60,000–90,000 | +1 |
| 90,000–110,000 | 0 |
| > 110,000 | **Reject** |

### Distance (graded — no longer a rejection)

| Band | Points |
|---|---|
| 0–10 mi | +2 |
| 10–20 mi | +1 |
| 20–30 mi | 0 |
| 30+ mi | −1 |

A far car is one that has to be *worth the drive*, not one that's disqualified. The verification bar scales with distance — see §11.

### Reliability

| Condition | Points |
|---|---|
| Good for the exact model year/powertrain, no major unresolved pattern | +2 |
| Mixed, insufficient data, or powertrain unknown | 0 (flag; cannot be Strong until researched) |
| Poor — documented pattern of expensive major failures | −2 (cap at Marginal unless credible records show the risk was addressed) |
| Relevant maintenance/service records support long-term ownership | +1 |

Do not give or subtract points merely for body style. Reliability research is required only *after* a listing passes the cheap hard filters. Use model-year- and powertrain-specific evidence, never the badge alone. Before any final recommendation, check the exact VIN for open recalls and require service records plus an independent pre-purchase inspection.

### Missing information — the pending-info rule

A thin listing is a listing you know less about, not a worse car. Sellers who write "Runs good, $5,500, no low ballers" are the most common kind of private seller in this market, and the scoring tables above will quietly bury them: no title field, no mileage, no service records, no VIN and no reliability confirmation is −1, −2 and several forgone bonuses before anyone has looked at the car.

> **Rule: never let absent information alone push a listing out of consideration.**

1. **A missing hard-filter field is not a hard-filter failure.** Mileage or title status that is simply not stated → status `Pending info`, not `Rejected`. Only a *stated* disqualifier (mileage > 110k, salvage/flood title, price out of band, wrong body type or brand) rejects. `Rejected: mileage` requires a number.
2. **Score what is known, and cap rather than subtract.** A listing with too little information to score is capped at "Worth a look" and carries `Pending info` — it is not scored down to Marginal by absence. Record which fields are missing in the tracker note.
3. **Every missing field becomes a question, not a deduction.** Maintain a per-listing question queue (mileage, title, VIN, "is that your cash price?", records) and use the §11 templates. A pending-info listing is *ready to ask*, and it exits the state the moment the seller answers.
4. **Photos carry information the text doesn't.** Before concluding a listing is uninformative, read the photos: odometer shots, the dashboard, the VIN sticker, interior wear, the title document itself. Sellers who write nothing frequently photograph everything.
5. **Cheap and quiet is where the deals are.** Sparse listings get fewer messages, which is a negotiating advantage, and this market's confirmed scams are the *verbose* ones — templated financing paragraphs, emoji blocks, repeated phone numbers. Terseness correlates with a genuine private seller, if anything.

**Tiers:**
- **8+ points → Strong match** — worth messaging the seller today
- **4–7 points → Worth a look** — shortlist with caveats
- **Below 4 → Marginal** — include in the data dump, don't lead with it
- **`Pending info`** is a status that rides alongside the tier, not a tier of its own. Surface these in output; they are the listings one message could promote.

Sort output by tier, then score, then **Listed Date (newest first)**, then asking price ascending.

---

## 6. Red Flags & Notes Checklist

Scan for these and call them out explicitly in Notes:

- **Title conflict** — structured field says one thing, description another. Flag prominently; don't silently pick one.
- **Financing/down-payment language** anywhere in the description (§3).
- **Year-vs-price implausibility** (§3a) — a late-model car at an economy-car price.
- **Salvage / flood / lien / "no title" / "bill of sale only"** — reject and note why.
- **Rebuilt quality gate (adopted 2026-08-26).** Rebuilt stays eligible only for **light cosmetic damage, documented repairs, no airbag deployment, no structural/unibody damage, and a substantial discount** (roughly **35–45% below** a clean-title comparable). Prioritize those. **Pass — do not shortlist, do not schedule —** when several of these are present: airbags deployed; severe front-end or side structural damage; marked stationary / not-run at auction; insurer total-loss sale; frame/unibody involvement suspected; ADAS/radar sensors in the impact zone; no repair receipts; no frame/alignment documentation; no SRS/ADAS calibration documentation; seller refuses those documents or an independent inspection; rebuilt-title discount thinner than ~35–45% vs clean comps. Marketplace photos of a new bumper and a clean engine bay do **not** clear this gate. A seller who answers a document request with “this is not the car for you” is a walk-away.
  - *Field case 1 (2026-08-26):* 2021 Mazda3 Select hatch (insurance-auction record: severe front end, airbags deployed, not-run, $9,998 vs ~$15–16k clean) — seller refused receipts; **passed**. Status `Rejected: title`.
  - *Field case 2 (2026-08-28):* Listing (advertised as 2016 Civic EX Coupe $6,000, Kendall FL; description claimed "Runs great, Needs some TLC / buen carro todo funciona muy bien, needs maintenance"). Copart auction photo revealed severe right-front collision with a crushed front clip, crumpled hood, and complete structural/suspension destruction (passenger-side front wheel assembly sheared and folded flat under the unibody apron). Furthermore, the VIN decoded as a 2015 9th Gen LX rather than the advertised 2016 10th Gen. **Scam/Curbstoner Euphemism Pattern:** Beware of phrases like *"needs some TLC"* or *"needs routine maintenance"* on cheap rebuilt cars used to conceal total-loss suspension/frame damage; **passed**. Status `Rejected: damage`.
- **Mileage anomalies** — implausibly low for the age, or a mismatch between the structured field and the description. Also watch for **replaced instrument clusters** — a seller who mentions swapping the cluster has made the odometer unverifiable regardless of intent.
- **Poor long-term ownership outlook** — known recurring engine, transmission, hybrid-battery, electrical, or air-suspension failures for the exact model year/powertrain; expensive repair complexity; weak parts availability; major scheduled maintenance due without records. Never inferred from brand reputation alone.
- **"As-is," no warranty, "mechanic special," "runs but needs work"** — not disqualifying, but flag it.
- **New or unrated seller accounts** ("Joined Facebook in [current or last year]," no reviews) — mild scam-risk signal on its own. **Escalates to a near-certain scam tell (2026-08-20 finding) when combined with a name mismatch** — the description tells you to "Call [First Name]" and that name doesn't match the account's display name. Confirmed across two independent curbstoning networks (identical phone number, identical leetspeak financing disclaimer, reposted across 3+ cities under different seller names, all "Joined Facebook in 2026"). This pattern is **not caught by the §3a year-vs-price screen** — it shows up on ordinary older cars (2010–2016) at plausible prices, so §3a alone is not sufficient; check the description text even when the year/price combination looks fine.
- **Dealer posing as a private seller** — "Business Details" tag, a physical dealer address, ITIN/trade-in/warranty language on a personal account. Expect fees and markup.
- **Curbstoning** — the same boilerplate description, emoji pattern, or phone number across multiple unrelated vehicles, or the same car reposted under different seller names and cities. Record the **seller fingerprint** (§4) so this is detectable across runs, not just within one.
- **Urgency/scam language** — "must sell today," "moving out of state," requests for wire transfer, gift cards, PayPal friends & family, or any money before an in-person viewing.
- **No VIN listed** — note it and ask before visiting. Refusal, or a VIN that doesn't match, means don't go. For any Rebuilt or high-risk candidate with a VIN, decode and search the VIN on [BidFax](https://bid.cars/) or [AutoAuctionHistory](https://autoauctionhistory.com/) to inspect historical Copart/IAAI insurance auction photos and evaluate the true pre-repair damage severity.
- **Missing or unclear running-dashboard evidence** — see §11. Refusal, an unreadable dashboard, or unexplained warning lights means don't travel until resolved.
- **3+ owners** — not disqualifying, worth a note.
- **Sparse or stock-looking photos** (no interior, no engine bay, no odometer) — flag as needing more before committing to a visit.

**Not a red flag: a short description.** Terseness is missing information, handled by the pending-info rule in §5. The scams in this market are wordy, not quiet.

---

## 7. Distance & Drive-Cost Bands from Pembroke Pines, FL

**Home base changed to Pembroke Pines on 2026-08-20** (was Fort Lauderdale). The bands below are rebuilt from Pembroke Pines; the old Fort Lauderdale table is superseded and must not be used, because the two origins are ~15 miles apart and that is enough to move most of Miami-Dade a full band closer and most of Palm Beach County a full band further.

Distance is a **scoring factor, not a filter** (§2, §5). This table sets the band; the band sets the points and the verification bar.

| Band | Cities |
|---|---|
| **0–10 mi** | Pembroke Pines, Miramar, Cooper City, Davie, Southwest Ranches, Weston, Hollywood, West Park, Pembroke Park, Hallandale Beach, Miami Gardens |
| **10–20 mi** | Fort Lauderdale, Plantation, Sunrise, Dania Beach, Lauderhill, Lauderdale Lakes, Tamarac, North Lauderdale, Wilton Manors, Oakland Park, Margate, Miami Lakes, Hialeah, Hialeah Gardens, Medley, Opa-Locka, Doral, Miami Springs, North Miami, North Miami Beach, Aventura, Miami, Miami Beach |
| **20–30 mi** | Coral Springs, Coconut Creek, Pompano Beach, Parkland, Deerfield Beach, Coral Gables, South Miami, Sunny Isles Beach, Pinecrest, Palmetto Bay |
| **30+ mi** | Boca Raton, Delray Beach, Kendall, Homestead, West Palm Beach, Port St. Lucie, Cape Coral, Bonita Springs |

These are approximate. Confirm anything borderline against a map before it changes a decision.

**What moved, relative to the old Fort Lauderdale table** — worth internalising, because it inverts several prior judgement calls:

| City | Was (from Ft. Laud.) | Now (from Pembroke Pines) |
|---|---|---|
| Fort Lauderdale | 0–10 | **10–20** |
| Hialeah | 20–30 | **10–20** |
| Miami | 20–30 | **10–20** |
| Miami Gardens | 20–30 | **0–10** |
| Boca Raton | 20–30 | **30+** |
| Deerfield Beach | 10–20 | **20–30** |
| Pompano Beach | 10–20 | **20–30** |

**Consequence:** Miami-Dade is now the near field, not the far field. The old "Hialeah is worth it despite the ~26-mile drive" caveat is retired — Hialeah is now an ordinary 10–20 mi drive and needs no special justification. Conversely, Boca Raton and Deerfield Beach listings now cost more to inspect than they used to, and Palm Beach County (Delray, WPB) is firmly in the 30+ penalty band.

**Radius (2026-08-20):** the account-level search radius is 40 miles (Facebook offers 20 or 40, not 30). This does not add a new scoring band — everything past 30 mi still scores the same flat −1 (§5). Distance stays a graded score, never a rejection, no matter how far a listing turns out to be.

---

## 8. How Facebook's Filters Actually Behave

**Tested live on 2026-08-19/20 in a signed-in session. Most vehicle filters do not work.** Do not design a search around them.

### Route A — `/marketplace/category/vehicles`

| Parameter | Status |
|---|---|
| `minPrice` / `maxPrice` | **Works.** |
| `sortBy` | **Works — and this route's sort menu is richer than Route B's.** Full menu confirmed 2026-08-20: Suggested · Date listed: Newest first · Date listed: Oldest first · Distance: Nearest first · Distance: Farthest first · **Mileage: Lowest first** · **Mileage: Highest first** · Year: Newest first · Year: Oldest first. The two mileage sorts and the two year sorts do **not** exist on Route B. This is the single best reason to prefer Route A: mileage sorting is what turns the un-cardable mileage cap into a cheap stopping condition (Sweep A, §9), and each distinct sort returns a largely different 24-item slice for union purposes (§8a). |
| `maxMileage=110000` | **Unreliable.** Populates the field; listings above the cap still appear. Advisory only — always verify on the listing page. |
| `make=<numeric id>` | **Cosmetic. Does not filter.** Confirmed by URL, by clicking the native radio with a 4s settle, and by scrolling two pages deep. **Re-verified 2026-08-20** with the filter set through the native UI panel (not the URL): with `Make: Honda` showing active in blue in the sidebar plus price $4,000–$5,999 and mileage ≤110k, **20 of the 24 returned cards were not Hondas** — Hyundai Sonata, Toyota Corolla, VW CC, Dodge Grand Caravan, Dodge Journey, Ford F-150, Ford Focus, plus a motorcycle. The price filter in that same request was flawless (0 of 24 outside the band). **The danger is that it fails silently:** the param is accepted, no error is shown, and the sidebar renders "Make: Honda" in blue as though it took. Never trust the sidebar's own display as evidence a filter worked — verify against the returned card titles. **Third test, 2026-08-20 — it does not even resample:** `make=Honda` and `make=Toyota` were run at identical price/sort/location; **20 of the first 24 listing IDs were identical**, and the Toyota feed's first 24 held more Hondas (3) than Toyotas (2). Position-scatter on a 308-card Honda feed gave flat quartiles (7/12/14/13). So `make=` is not a filter, not a ranking boost, and not a useful resampling axis — **iterating brands is ~83% redundant scrolling.** |
| `carType=sedan,suv,…` | **Cosmetic. Does not filter.** Minivans, pickups, cargo vans, motorcycles and trailers still returned. |
| `topLevelVehicleType=car_truck` | **Cosmetic. Does not filter.** |
| `radius=<n>` | **Cosmetic.** Relabels the sidebar; results unchanged. The account-level radius (set in the Change Location dialog) is the real one. |

### Route B — `/marketplace/category/search/?query=…`

| Parameter | Status |
|---|---|
| `query=<brand>` | **Weak relevance hint, NOT a filter.** A `query=toyota` search returned 12 Toyotas in the first 24, versus 4 from the native Make filter — better than nothing. But verified 2026-08-20: `query=honda civic` returned a Hyundai Tucson, a Hyundai Venue and a Nissan Sentra inside the first six results. **Adding a model name does not reliably narrow the set, so model is not a usable partition axis.** |
| `minPrice` / `maxPrice` | **Works — and is applied strictly.** Verified 2026-08-20: `minPrice=9000&maxPrice=9000` returned 24 listings priced at exactly $9,000, no leakage. This is the only filter precise enough to partition the search space — see §8a. |
| `maxMileage` | **Works** (advisory — still verify on the listing page). |
| `sortBy` | **Multiple sorts work. The earlier "creation_time_descend is the only accepted sort" finding was WRONG** — corrected 2026-08-20. `price_ascend` verified working on this route. The sidebar also offers Suggested, Distance: Nearest first, and Price: Highest first. **Different sorts return largely different 24-item slices of the same pool** — this is the basis of the union strategy in §8a. |
| `make=` | **Returns zero results.** Incompatible with this route. |
| `carType=` | **Ignored.** |
| `exact=true` / `false` | **No observable difference.** |

### Which route to use — Route A is the better default (decided 2026-08-20)

Both routes require the same card-level brand triage, because **neither one can filter by brand**: Route A's Make filter is cosmetic, and Route B's `query=` is only a weak relevance hint. Given that they tie on brand, Route A wins on everything else:

| | Route A (`/vehicles` category) | Route B (`query=` search) |
|---|---|---|
| Brand filtering | Broken (cosmetic Make filter) | Broken (fuzzy keyword) |
| Off-brand noise in results | High, but *honest* — it never claimed to be one brand | High and *misleading* — a "honda" search returned 177 non-Hondas out of 264, including Porsches, a Chevy Silverado and 15 motorcycles |
| Price filter | Works, strict | Works, strict |
| Mileage sorting | **Yes — Lowest/Highest first** | No |
| Distance / Year sorting | **Yes** | Distance only |
| Result cap | 24 (same) | 24 (same) |
| Covers all 9 approved brands in one pass | **Yes** | No — one brand per query at best |

**The decisive point:** the buyer's list is nine approved brands, not one. Route B forces nine separate keyword sweeps per price slice and still leaks other brands in; Route A returns the whole pool for a price band in one pass, and brand triage from card titles is free either way. Route B keeps one narrow use: when a specific brand is genuinely under-represented in a Route A pass and you want a targeted top-up.

**Do not read this as "Route A's filters work."** Only price, mileage-as-advisory, and sort work. Make, Body style, Vehicle type and radius are all decorative. Set price + sort, then triage brand and body type from the card titles exactly as before.

#### How to prove a filter is cosmetic (position-scatter test)

A broken filter and a *working* filter on thin inventory look identical if you only count results — "4 Hondas out of 24" could mean either. The test that separates them is **where the matches sit in the feed**, not how many there are:

- **If the filter works** (even if it pads the tail with suggestions), matches cluster at the front: positions 0,1,2,3… then non-matches after.
- **If the filter is cosmetic**, matches are scattered at their natural frequency throughout the whole feed.

Run on `make=Honda` + price band + mileage, 2026-08-20, 164 cards deep after a manual scroll. Honda landed at positions **7, 11, 17, 19, 33, 44, 65, 66, 97, 129, 130, 133, 141, 142, 148, 150, 152, 153** — evenly sprinkled end to end, non-Hondas before, between and after, no clustering at all. 18 Hondas in 164 cards ≈ 11%, which is just Honda's natural share of a date-sorted all-makes feed. **Cosmetic, conclusively.**

Corollary worth remembering: **"only N matches in the first 24" is never evidence of scarcity on this route.** At ~11% natural frequency, any 24-card window holds 2–3 Hondas whether inventory is thin or huge. Judge inventory from a deep scrolled feed, never from the first batch.

#### What one deep Route A pass actually yields

Same 164-card pass, scored against the nine approved brands:

| Measure | Count |
|---|---|
| Cards loaded | 164 |
| Approved brand | 47 |
| Approved **cars** (after motorcycle/minivan/pickup/van triage) | **39** |
| Brand spread | Toyota 16 · Honda 10 · VW 9 · Lexus 2 · Volvo 1 · Mazda 1 |

Per-card useful-hit rate is about the same as Route B's (24% vs 28%). **The win is not hit rate — it is passes required.** Covering eight brands through Route B means eight separate keyword sweeps per price slice, each needing its own manual scroll. Route A covers all eight in a single scroll of a single feed. With a human doing the scrolling, that is the cost that actually matters.

### 8a. The 24-result cap — the single biggest coverage risk

**Tested live 2026-08-20. This supersedes the old "a feed that exhausts at 23–58 cards is normal" note, which led to real missed listings.**

What actually happens on the search route:

| Observation | Detail |
|---|---|
| **First batch = 24 results.** | Every query tested returned exactly 24 on initial load, regardless of price band. 24 is a page size, **not** the size of the matching inventory. |
| **A second batch of 24 sometimes loads on scroll (48 total).** | Observed once. A skeleton placeholder card appears at the end of the grid while it fetches. |
| **That second batch is rate-limited and frequently never arrives.** | After a fresh reload of the identical URL, the count stayed pinned at 24 through ~30 seconds of both programmatic scrolling and real mouse-wheel scrolling. The skeleton loader rendered and never resolved. |
| **48 appears to be a hard ceiling.** | Once 48 were loaded, six bounce-scrolls (scroll up 40%, back to bottom, wait 3.5s) over ~25 seconds produced zero additional results. |
| **The same URL returns different result counts on different loads.** | One load gave 48; a reload minutes later gave 24, all a subset of the previous 48. Result sets are not stable between loads. |

**What this cost us:** the 2026-08-20 Honda run recorded 24 cards for the $9,000–$10,500 slice. The DOM actually held 48. The 24 never examined included several approved-brand candidates — a 2018 Subaru Legacy 2.5i ($9,900, Oakland Park), a 2016 Toyota Corolla S Plus ($9,560, Miramar), three 2020 Toyota Corolla LE ($9,500–$10,500), and a 2019 VW Jetta ($9,000, Davie).

#### "Just scroll and get another 24" — tested four ways, does not work

The obvious fix is to scroll, collect 24 more, scroll again, collect 24 more. That is how infinite scroll is supposed to behave. It was tested directly on 2026-08-20 and **failed every time**:

| Attempt | Result |
|---|---|
| Programmatic scroll to bottom, 8 bounce-scrolls, ~30s | stayed at 24 |
| Real mouse-wheel scroll + ~80s parked at the bottom | stayed at 24 |
| Fresh never-queried URL (`query=toyota`, $6,000–$7,499), gentle human-paced descent | stayed at 24 |
| Switch to another tab, wait, switch back to re-fire the intersection observer | stayed at 24 |

Two confounds were ruled out. Window width was suspected (a 2560px-wide window fits 7 cards per row, so 24 results leave only ~500px of scroll travel); retesting at 1280px, with real scroll runway, changed nothing. Miscounting was suspected; counting *all* `marketplace/item` links and counting only `browse_serp` ones returned identical numbers.

**Root cause, established at the network layer:** with request tracking on, scrolling to the bottom and re-triggering fires **zero data-fetching requests**. Tracking was confirmed live (it captured an unrelated `ajax/webstorage` POST at the same moment), so this is not a monitoring gap. The skeleton placeholder card at position 25 renders, but the pagination fetch is **never issued at all**.

**Important caveat — this is an automated-session problem, not how Marketplace behaves normally.** Scrolling to load the next 24 after a 2–3 second pause is the correct, expected behaviour in ordinary manual browsing, and it works fine that way. Something about this extension-driven session (automation detection, the synthetic event signature, or a session-level throttle after many rapid queries) stops the observer from firing its request. Do not "fix" this by scrolling harder or waiting longer — no amount of either will help, because nothing is in flight.

**Consequences for agent runs:** additional listings come from issuing *more queries*, not from scrolling one query harder. Each new URL reliably returns its own fresh 24. Two workable paths:

- **Partition by price** (§8a below) — fully automatable, no scrolling dependency.
- **Hybrid: ask the user to scroll.** Since manual scrolling works normally, the user can scroll the results page themselves and the agent then reads the fully-populated DOM. This is the cheapest route to deep coverage on a single query and sidesteps the block entirely.

**Standing workflow (agreed with the buyer 2026-08-20): the buyer scrolls first, then the agent reads.** The agent sets up the Route A URL (price band + sort) and hands the tab over; the buyer scrolls as deep as they want; only then does the agent enumerate the DOM. The agent does not read early or interleave reads with scrolling — one setup, one scroll, one read.

**Human-in-the-loop scroll — validated 2026-08-20 and now the preferred method whenever the user is present.** Tested on Honda $4,000–$5,999: agent set up the filtered URL, user scrolled manually with ordinary 2–3 second pauses, agent then enumerated the DOM. Result: **264 unique listing IDs**, vs. 24 from the automated method. This is a bigger single-pass yield than price-subdivision would have produced (subdividing $4,000–$5,999 into <24-result bands would take several separate queries to reach the same coverage). Use this whenever a human is actively in the session; fall back to price-subdivision for unattended/scheduled runs where no one can scroll.

#### The rule that replaces "scroll until exhausted"

> **A query returning exactly 24 results is presumed INCOMPLETE. A query returning fewer than 24 is complete.**

24 is the overflow signal. Never treat a 24-result feed as a finished slice. This single test is more reliable than any amount of scrolling, because scrolling failure and inventory exhaustion look identical from the outside.

#### How to actually get full coverage: partition, don't paginate

Pagination is unreliable and rate-limited, so stop depending on it. Make each query small enough that its answer fits under 24.

1. **Subdivide by price until every band returns < 24.** Price is strictly applied, so this is sound. Start with the standard slices; any band that returns exactly 24 gets split in half and re-run. Repeat until every sub-band is under 24. Typical useful granularity is $250–$500.
2. **Handle round-number spikes with sort unions.** Prices cluster hard on round numbers, so `minPrice=maxPrice=9000` can still overflow — a single price point that cannot be subdivided further. For those, run the *same* query under several sorts (`creation_time_descend`, `price_ascend`, `price_descend`, distance) and take the **union of listing IDs**. Each sort surfaces a different 24-slice.
3. **Cross-check with Sweep A.** The `/marketplace/category/vehicles` route sorted by `vehicle_mileage_ascend` orders the pool along a completely different axis, so it surfaces listings the price-ordered search route buries. Treat A and B as two independent samples of the same inventory and union them.
4. **Read result cards from the DOM, not from page text.** `get_page_text` truncated at 24 even when 48 were present — that alone caused the miss above. Enumerate `a[href*="/marketplace/item/"]` filtered to hrefs containing `browse_serp` (which excludes the "Today's picks" recommendation strip), dedupe by the numeric listing ID, and read each card's `aria-label` (format: `"<year> <make> <model>, $<price>, <city>, FL, listing <id>"`). Count what you actually captured and compare against 24 before deciding a slice is done.

#### Do repeats mean stop?

**No — and the old "3 consecutive loads with no new IDs" stopping rule is unsafe.** Repeats indicate the loader stalled or Facebook re-served the same batch, which happens for reasons unrelated to inventory. Within a single load you get one ordered batch; Facebook does not interleave fresh listings after repeats. Across reloads the returned set can shrink or grow arbitrarily. So "I keep seeing the same cars" is evidence about *the feed*, never evidence that you have seen all matching inventory. Completeness is established only by the `< 24` test above.

### The radius does not bound results

The stored radius is genuinely 20 miles (visible in the Change Location dialog, with the map circle drawn). But out-of-radius cities appear at the *top* of the feed, interleaved into newest-first ordering — card #1 of a `toyota` search was Hialeah, card #5 Miami. Facebook is not exhausting the nearby pool and then expanding; the radius is a soft relevance hint against a metro-wide pool.

**Consequence:** Miami-Dade inventory arrives whether or not it's requested, and no setting reliably stops it. Whether that spillover represents *all* Hialeah/Miami inventory or an arbitrary slice is unknown — see §14.

### Reference data

**Make IDs** (recorded in case Facebook restores the filter):

| Brand | ID | Brand | ID |
|---|---|---|---|
| Toyota | 2318041991806363 | Subaru | 2571870739551112 |
| Honda | 308436969822020 | Scion | 1546786558785480 |
| Mazda | 410067716491465 | Volkswagen | 523665818157652 |
| Lexus | 2101813456521413 | Volvo | 367577657422824 |
| Acura | 280909549507187 | | |

**Body style tokens:** `coupe`, `hatchback`, `sedan`, `wagon`, `suv`, `small_car` confirmed. Convertible / Minivan / Truck / Other exist in the panel, tokens unconfirmed. Moot while `carType` doesn't filter.

**Unused filters that exist:** Year (min/max), Model, Transmission type, Exterior/Interior color, and **Vehicle history** (free CARFAX report / no accidents / one owner / personal use / service records). Vehicle history is *not* recommended as a hard filter — private sellers rarely populate it, so it over-excludes — but it is useful as an occasional high-quality pass.

**The Year filter is cosmetic. Confirmed 2026-08-20.** Set `maxYear=2018` via the native UI panel (not the URL) on Route A with price $4,000–$10,500, mileage ≤110k. The sidebar showed "Year: to 2018" as active and the URL carried `maxYear=2018`, but the returned cards still included a 2022 Yamaha R7, a 2025 Yamaha YZF-R, a 2026 BMW 3 Series, and a 2023 Nissan Sentra — all years the filter should have excluded. Same failure mode as Make, Body style and Vehicle type: accepted silently, no error, sidebar renders as if it took. **There is no filter shortcut for the §3a down-payment screen** (year ≥2019 at ≤$10,500) — it must be applied by eye from the card title on every listing, same as brand and body type.

---

## 9. Step-by-Step Agent Instructions

Because Facebook's brand and body-type filters don't work (§8), the search is built on **two sweeps plus aggressive card-level triage.** Almost all rejection happens for free, from the search card, before anything is opened.

### Sweep A — mileage-ordered, all brands (primary baseline)

```
https://www.facebook.com/marketplace/category/vehicles?minPrice={MIN}&maxPrice={MAX}
  &maxMileage=110000&sortBy=vehicle_mileage_ascend&topLevelVehicleType=car_truck
```

Mileage is the only hard filter that cannot be read from a card — it always costs a listing open. But mileage *sorting* works. Walking a price slice from lowest mileage upward turns mileage from a per-listing rejection into a **stopping condition**: once listings cross 110,000, that slice is done, and everything below is pre-qualified on mileage. Brand, body type and city are all rejected free from the card on the way up. One pass covers all nine approved brands.

Caveat: this loses newest-first ordering, and listings with no mileage entered sort unpredictably.

**Mileage-ascending sort verified genuine, not cosmetic — 2026-08-20.** Spot-checked by opening three listings from a single scrolled feed at `minPrice=4000&maxPrice=10500` (the full standard search floor-to-ceiling, no price slicing) sorted `vehicle_mileage_ascend`: position 0 was 2,000 mi, position 12 was 10,000 mi, position 23 was 16,000 mi — monotonically increasing. Unlike Make/Body style/Vehicle type/Year, this one actually works.

**Full-band variant — run the whole $4,000–$10,500 range in one scroll instead of four price slices.** Since a human scroll already breaks the 24-result cap (§8a; 264 listings observed in one scrolled pass), the price-slicing that exists to route around that cap is redundant work when a person is actively scrolling. One full-band pass sorted by mileage ascending covers all eight brands and lets the mileage cutoff (110,000 mi) serve as the visible stopping point — stop scrolling once cards cross it. Prefer this over four separate slice-scrolls whenever a human is in the loop to scroll (§8a "human-in-the-loop scroll"). Fall back to the four fixed price slices only for unattended/scheduled runs, or if a single scroll stalls well short of 110k miles (in which case run a second pass sorted `vehicle_mileage_descend` from the 90k+ end and union the two, rather than reverting to price slicing).

Note: a 2,000-mile reading on a 2016 model at position 0 of that test is itself a §6 mileage-anomaly red flag (implausibly low for the age) — not evidence the sort is broken, but worth flagging on the listing itself if it becomes a candidate.

### Sweep A2 — sort-union top-up (replaces the per-brand loop)

**Do not iterate brands. Iterate sorts.** Confirmed 2026-08-20 (§8): `make=` neither filters nor resamples — `make=Honda` and `make=Toyota` returned 20 of the same 24 IDs. Running nine brand passes per price slice is ~83% redundant scrolling and is now explicitly retired as a strategy.

The two axes that genuinely change the returned set are **price** (strictly applied) and **sort** (each sort surfaces a different slice of the same pool, §8a). So the sweep grid is `price slice × sort`, not `price slice × brand`:

```
https://www.facebook.com/marketplace/category/vehicles?minPrice={MIN}&maxPrice={MAX}
  &maxMileage=110000&sortBy={SORT}&topLevelVehicleType=car_truck
```

Recommended sort rotation, in priority order:

| Pass | `sortBy` | Why |
|---|---|---|
| 1 | `distance_ascend` | Nearest-first. Highest-value cars per unit of inspection effort, and it *buries* freshly-posted down-payment scam listings rather than concentrating them. |
| 2 | `vehicle_mileage_ascend` | Gives the 110k stopping condition; everything above the stop line is pre-qualified on the one filter that cannot be read from a card. |
| 3 | `creation_time_descend` | Newest-first, catches anything listed since the last sweep. Expect the highest scam density on this pass (§3a, §6). |
| 4 | `Suggested` | Facebook's default/algorithmic ranking. Run last because it is most likely to resample cards the first three passes already surfaced. **Verified 2026-08-21:** select it by omitting `sortBy` from the URL; do not pass the literal value `Suggested`. |

Four price slices × 2–4 sorts = 8–16 productive scrolls, versus 36 mostly-redundant ones under a brand loop. If the full-band variant is used instead (§ above), running all four sorts once each is 4 scrolls total.

**Do not bother setting Make, Body style, Vehicle type or Year in the UI.** All four are cosmetic. Leaving them unset costs nothing and avoids the silent-failure trap where a blue "Make: Honda" chip implies filtering that isn't happening.

### Sweep B — brand keyword search (rarely needed)

```
https://www.facebook.com/marketplace/category/search/?query={BRAND}
  &minPrice={MIN}&maxPrice={MAX}&maxMileage=110000
  &sortBy=creation_time_descend&exact=false
```

Run per approved brand, per price slice. This replaces the old (non-functional) native Make filter. Results are fuzzy — reject other brands from the card title.

### Sweep C — maintenance sweep (once the initial grid is exhausted)

**Purpose: after the price×sort grid (Sweep A2 — 16 cells as of the 2026-08-21 `Suggested` sort addition) has been fully captured and triaged once, ongoing need shifts from "find everything" to "find what's new since last time."** This is a different, cheaper workflow — not a repeat of Sweep A2. Use it for any period of continued looking after the initial sweep, for example checking every few days over a two-week window while a decision is pending.

**Why this can be cheap when Sweep A2 couldn't be:** Sweep A2's "never stop on repeated IDs" rule (§8a, batch-size section above) exists because, during the *initial* sweep, hitting a known ID proves nothing — the same URL returns different subsets on different loads, so a repeat could just as easily mean a stalled loader as real exhaustion. That danger disappears once a complete baseline exists. Sorted **newest-first** (`creation_time_descend`), listing order is monotonic in post time. So once the grid has been fully captured and triaged, hitting a *run* of already-known IDs means everything older than that point was already seen in the complete baseline — there is nothing left to find by scrolling further.

**Method:**

1. One sort only: `creation_time_descend`. Skip `distance_ascend` and `vehicle_mileage_ascend` entirely — they exist to resample an *unknown* pool, and the pool is no longer unknown.
2. Run the full $4,000–$10,500 band in one scroll if a human is available to scroll (preferred), or per price slice if not.
3. Scroll from the top. Capture via `mp.js` as usual.
4. **Stop rule:** once **10 consecutive listing IDs** (in feed order) are already present in `seen_listings.md` or `captures/master.csv` from a prior complete sweep, stop scrolling — everything past that point is provably older. Use 10, not 1, to absorb the case where a seller's price edit bumps an old listing's timestamp and it resurfaces near the top; a single repeat doesn't prove the frontier, ten in a row does.
5. Merge and triage exactly as in Sweep A2 (§12). New IDs get full triage. IDs already known just get their `Last Seen` date and price refreshed by `merge.js`'s price-change tracking — no re-triage needed unless the price changed.
6. Checkpoint as usual, but note in `search_checkpoint.md` that this was a maintenance pass, not a grid cell — it doesn't fill in the Sweep A2 grid and shouldn't be confused with it.

**Cadence:** not fixed — run it as often as makes sense for how urgently a decision is needed. Every 2–3 days is reasonable during an active search window; there's little cost to running it more often, since the stop rule usually ends the scroll within the first page or two once the pool is stable.

### The run

1. Confirm the account location is Pembroke Pines, FL (zip 33029) and note the stored radius. Don't rely on it (§8).
2. Pick the sweep and the first incomplete price slice from `search_checkpoint.md`.
3. Read result cards **in batches** and capture Listing IDs first.
4. **Card-level triage — reject before opening.** Everything here is free:

   | Signal | Where on the card | Action |
   |---|---|---|
   | Brand | First words of the title | Reject if not on the approved list |
   | Body type | Title suffix — `Sedan 4D`, `Sport Utility 4D`, `Minivan 4D`, `Pickup 4D`, `Wagon 4D`, `Van 4D`, `Hatchback 2D` | Reject minivans, pickups, vans, convertibles |
   | Asking price | Card | Reject above $10,500 |
   | Year vs. price, 2022+ | Title year + price | Flag `Suspected down payment` per §3a — safe to skip |
   | Year vs. price, 2019–2021 | Title year + price | **Must open** (§9a). Flagging from the card was 68% wrong |
   | City | Under the price | **Not a rejection** — record the band for §5 scoring |
   | Struck-through price | Card | Record as a negotiability signal |
   | Title unreadable, missing, or an unrecognized make | Card | **Must open** (§9a) — never a silent drop |

   Across the first 106 listings processed under the old playbook, brand and body type alone account for 67 rejections — all of which this step handles without opening anything.

   **Every rejection in this table must come from something the card actually says.** A card that is blank, truncated, or unparseable says nothing, and "says nothing" is never grounds for rejection — see §9a.

5. Check every surviving Listing ID against `seen_listings.md` (§12) *before* opening. Skip permanent rejections; re-check `Rejected: price`; re-open `Active` and anything new.
6. Open remaining candidates in **one reusable scratch tab**. Expand the description once and collect all §4 fields in a single pass. Never reopen a listing to fetch one field.
7. Apply the hard filters (§2/§5). Log **every** listing opened — passes and rejections alike — with a one-line reason.
8. For hard-filter survivors only, research the exact model year and powertrain's reliability and long-term ownership outlook. Reuse a prior assessment for the same configuration from tracker Notes when still applicable.
9. Run survivors through the §6 red-flag checklist and populate Notes.
10. Score per §5.
11. Classify against `seen_listings.md` per §12 — New / Price Changed / Repeat / Rejected — and update the tracker with complete rows.
12. Output a table sorted by tier → score → Listed Date (newest first) → asking price ascending, containing **only New and Price Changed listings that passed the hard filters**, with columns: `#, Listed Date, Year, Make/Model/Trim, Ask, Price Type, Negotiability, Mileage, Title, Distance Band, Reliability, VIN Status, Dashboard Status, Score, Tier, Notes, Location, URL`. Add a summary line above it, e.g. *"4 new, 1 price change, 11 repeats skipped, 3 rejected at card, 2 rejected at listing."*
13. After the table, call out the top 3–5 Strong matches by name with a one-sentence reason each.
14. Do not recommend traveling to inspect any car until it is marked **Pre-visit verification complete** per §11.

### 9a. The must-open bucket — cards that can't be triaged

Card-level triage (step 4) rejects on what the card *says*. A card that says nothing — no title, a title the parser can't read, a make that isn't in the known list — cannot be triaged, and must never be discarded for lack of information. This is the single failure mode that hid the most cars from this search: on 2026-08-21 an audit of the existing captures found roughly 30 listings that had never been seen by anyone, because a strict card-label parser dropped them before triage and nothing downstream noticed they were gone.

**How they get flagged.** `merge.js` writes a `review` column into `captures/master.csv` for exactly this. Its values:

| `review` | Meaning |
|---|---|
| `no-title` | The card carried a price and location but no vehicle title text at all |
| `no-make` | A title that parsed but yielded no make token |
| `unknown-make` | A make token not on the recognized-brand list — a typo, a non-English spelling, or a real brand missing from the list |
| `no-year` | A recognized make with no four-digit year |
| *(empty)* | Fully triageable from the card |

**Rules:**

1. **Anything with a non-empty `review` value goes in the must-open bucket** and is opened like a candidate. There is no card-level rejection available for it.
2. **`unknown-make` is not `rejected: brand`.** The approved-brand check requires reading a brand off the card. An unrecognized token means the list or the parse failed, not that the car is off-brand. Open it, and if it turns out to be a legitimate brand spelling the list is missing, add the spelling to `KNOWN_MAKES` in `merge.js`.
3. **A slice is not complete while its must-open bucket is non-empty.** Add the bucket count to the checkpoint alongside the triage count, so a partially-triaged cell can't be closed with invisible cards still in it.
4. **Never solve a parse failure by narrowing the parser.** If a label can't be read, the fix is to keep the row and flag it, never to drop it. `validate.js` reports labels the current parser still cannot read; that number is a work queue, not a warning to suppress.
5. **Re-merge after any parser change.** `merge.js` re-parses raw labels from the stored captures, so a parser fix retroactively recovers historical cards without re-scrolling anything. Run `node merge.js && node validate.js` and triage whatever newly appears.

### Batch size and stopping

**No artificial per-task open limit (retired 2026-08-20).** The old "~25 listings opened per chat" rule caused real candidates to sit unprocessed for no reason tied to the actual search — it stopped the agent even when there were more genuine, unscored Hondas sitting right there in the DOM. There is no fixed number of opens per task. Work is paced by **checkpointing**, not by a quota:

- **Checkpoint every 5 listings, minimum.** Update `search_checkpoint.md` and `seen_listings.md` after every 5 opens (not just every 5 *new actives* — every 5 opens, including rejections and scam confirmations). This is what makes it safe to stop and resume at any point without re-doing work or losing track of where you are.
- **Default page-opening batch: 10 listing IDs per `mp.js item` command.** This reduces repeated browser/tool permission prompts. The command batch and checkpoint unit are separate: process the captured results in two 5-listing units and checkpoint after each unit; if a CDP command stalls, retry with fewer IDs.
- **A task ends when the slice is actually exhausted, the user says stop, or a real constraint is hit** (context window, turn length) — never because an open counter hit a round number. If a task has to stop mid-slice for a real constraint, checkpoint immediately, note exactly which candidates in the current batch are still unopened, and say so plainly rather than silently deferring them.
- **A slice is complete only when its query returns FEWER than 24 results (§8a) — for automated (non-scrolled) runs.** Exactly 24 means the page-size cap was hit and the slice is presumed incomplete — split the price band in half and re-run both halves. Repeat until every sub-band is under 24. Do not mark a 24-result band as done.
- **For human-in-the-loop scroll runs (§8a), the slice is complete once every approved-brand car surfaced in the scrolled DOM has been opened or resolved at the card level** (rejected/suspected-DP/curbstoning match) — not once some fixed count of opens is reached. If the DOM held 74 approved-brand cars, the task isn't done until all 74 are accounted for, even if that takes multiple checkpointed passes.
- **Never use "no new IDs on reload" as a stopping condition.** The old 3-consecutive-empty-loads rule is retired: a stalled loader and genuine exhaustion are indistinguishable from the outside, and the same URL returns different result counts on different loads (§8a).
- **Count what you captured before ending a slice.** Enumerate the cards from the DOM (`browse_serp` links, deduped by listing ID) — not from page text, which has truncated at 24 while 48 were present.
- Sweep A additionally ends once listings cross 110,000 miles.
- Keep interim chat updates to a one-line count every 10 so the user can see progress without a wall of text.
- Leave the filtered results tab open between tasks.

### Browser-automation cautions

- **Set filters by URL, not by clicking the panel.** Coordinate clicks on the price/mileage fields are fragile — one prior run corrupted a value into $40,004,000 from stray clicks.
- **Scroll by targeting definitely-empty space** (the sidebar filter panel), never near the card grid. A prior run accidentally clicked a card and navigated the primary results tab into a listing page.
- **Verify the full filter set after any change**, not each filter independently — selecting a vehicle-type filter has been observed silently clearing the mileage filter.
- Prefer page-text/structured reads over screenshots. Use screenshots only when visual evidence is actually needed.

---

## 10. Sample Kickoff Prompts

**Rewritten 2026-08-20** to match the current grid model. The old brand-loop prompts (`Sweep A` mileage-only, `Sweep B` per-brand) and the retired "open at most 25" cap are gone — see §9 for why.

**Grid sweep (the main workflow — one chat per cell, use this every time):**

> Read `CLAUDE.md`, `used_car_buying_playbook.md`, `search_checkpoint.md`, and `seen_listings.md` in this project folder before doing anything else.
>
> Check the grid in `search_checkpoint.md`. If any cell is `Captured — triage X/N`, this chat's job is finishing triage on that one cell — skip to the triage step below, don't touch the URL or scroll anything. Otherwise, find the next `Not started` cell (4 price slices × 4 sorts: `distance_ascend`, `vehicle_mileage_ascend`, `creation_time_descend`, then `Suggested`) and build its search URL from the template — price and sort only, no `make=`, `carType=`, or `maxYear=` (all confirmed cosmetic, §8). Omit `sortBy` for `Suggested`.
>
> **Show me the URL and wait for confirmation before I scroll.** Don't hand off to scroll on an unverified filter set.
>
> Once I confirm I'm done scrolling, capture it with `tools/marketplace-cdp` (`node mp.js read --out ../../captures/feeds/{date}_{price}_{sort}.json`, then `node merge.js`), set the cell to `Captured — triage 0/N` in `search_checkpoint.md` (N = approved-brand candidates in `captures/master.csv`), then triage against `seen_listings.md` per §2/§5/§6 — approved brands only, reject minivans/pickups/vans, apply the §3a year-vs-price screen, run the §6 red-flag checklist, score survivors. Update `seen_listings.md` with full rows and the cell's `X/N` count as you go. Checkpoint every 5 listings triaged, not just at the end, and run `node validate.js` before handoff.
>
> Only mark a cell `Done (N/N)` once every candidate is triaged — a completed capture with untriaged candidates stays `Captured — triage X/N`, it is not Done. Stop at the end of one cell's worth of work (or a clean stopping point mid-triage) and hand off with a compact summary — status of this cell, new candidates found, which cell is next. Do not contact sellers. Do not start a second cell in this chat.

**Maintenance sweep (only after all 16 grid cells read Done):**

> Run the maintenance sweep (playbook §9 Sweep C) — this is only valid once every grid cell in `search_checkpoint.md` reads `Done (N/N)`. One sort only, `creation_time_descend`, full $4,000–$10,500 band. Build the URL and show it to me before I scroll. Scroll from the top; stop once 10 consecutive listing IDs in a row are already known in `seen_listings.md` or `captures/master.csv`. Capture, merge, and triage exactly as the grid sweep does. Log the run in the "Maintenance sweep log" table in `search_checkpoint.md`. Show me only new candidates plus any price changes on existing Actives.

---

## 11. Safety, Verification & Negotiation (for you, not agent tasks)

### Pre-visit verification — the bar scales with the drive

Distance is no longer a filter, which means a far car is one that must earn the trip. Do not travel until the tier below is satisfied.

| Distance | Required before you drive |
|---|---|
| **0–10 mi** | Complete 17-character VIN + a current running-dashboard photo |
| **10–20 mi** | The above, plus written confirmation of title status and the actual cash price |
| **20+ mi** | All of the above, plus a **cold-start dashboard video**, a clear odometer photo, direct answers to specific-defect questions, and a confirmed appointment window. You're spending 45–60 minutes each way — the seller should demonstrate they're serious first. |

**Why the dashboard photo must show the engine running:** warning lights normally illuminate during the ignition-on bulb check, so an engine-off photo proves nothing. In Park, or READY mode for a hybrid/EV, with the odometer, gauges and warning-light area visible. A cold-start video is better still.

**Warning lights:** any check-engine, oil-pressure, temperature, charging, brake, ABS, airbag/SRS, transmission, or red light means pause the visit until the seller explains it with credible diagnostic evidence. Don't accept "it's just a sensor."

**VIN:** confirm it decodes to the advertised year/make/model, then run title, accident, theft, odometer, recall and ownership history. Refusal to provide the complete VIN means don't schedule.

**The agent must never contact sellers automatically.**

### Price-verification message — send this first, to anything in "Worth asking"

Short, single-purpose, and answerable in one line. It costs nothing and it is what lifts the §5 tier cap. Send it before the longer templates below; there is no point requesting a cold-start video for a car whose price turns out to be a monthly payment.

> Hi — is the $[price] in your listing the cash price to buy the car outright, or is it a down payment? And are there any dealer, doc, or transfer fees on top? Thanks.

Record the reply per §12 whatever it says. A "no" is as valuable as a "yes": it is the only thing that turns a card-only guess into a confirmed fact, and it costs one message either way.

### Seller message template — near (0–20 mi)

> Hi, I'm interested in the [year, make, model]. Before I arrange a time to see it, could you please send me: (1) the complete 17-character VIN, and (2) a current clear photo of the full dashboard while the car is running in Park, showing the odometer and any warning lights? Also — is the price you listed the cash price, and what's the title status? Are there any mechanical problems, warning lights, or fees not mentioned in the listing? Thank you.

### Seller message template — long drive (20+ mi)

> Hi, I'm interested in the [year, make, model]. I'd be driving about [X] miles to see it, so I want to make sure it's worth both our time. Could you send me: (1) the complete 17-character VIN, (2) a short cold-start video showing the dashboard before and after the engine starts, with the odometer visible, and (3) a clear photo of the odometer? Also, could you confirm: is the listed price your cash price? What's the title status — clean or rebuilt? Any warning lights, mechanical issues, leaks, or AC problems? If everything checks out I can come with cash and we can set a specific time. Thank you.

### Language

Handle any language or translation need manually, after the vehicle qualifies on its merits. Communication language must never change a score, tier, or shortlist position. It is fine to ask whether English communication will be possible for the inspection and title transfer.

### At the sale

- **Never send money** — deposit, "hold fee," or otherwise — before seeing the car in person.
- Meet in a public, well-lit place; many local police departments have a designated safe-exchange zone.
- Bring a second person if possible, and go during daylight.
- For anything above ~$5,000, a pre-purchase inspection (~$100–150 at an independent mechanic) is cheap insurance against a bad rebuilt-title repair or hidden frame damage. A rebuilt car that *does* clear the §6 gate still needs a structural/SRS/ADAS inspection before money changes hands (~$350–$600 all-in: mechanical PPI plus frame/alignment plus module scan). Do not pay for that inspection on a listing that already failed the gate.
- Verify the seller's ID matches the name on the title before handing over money.
- Run a VIN check (Carfax, AutoCheck, or free NMVTIS) and search free public insurance auction archives ([BidFax](https://bid.cars/) or [AutoAuctionHistory](https://autoauctionhistory.com/)) before finalizing — especially for any Rebuilt title, since the rebuild reason (flood vs. minor collision vs. structural damage) matters enormously and auction photos reveal the exact pre-repair state.
- **Negotiate.** 10–15% off asking is normal here, and more when you have cash ready. The negotiability signals in §5 tell you which sellers are most likely to move.

---

## 12. Recurring Runs & the Three-Tier Log

**Adopted 2026-08-20.** Because the sweep grid now runs the same pool through many overlapping passes (§9 Sweep A2), and measured overlap between two passes was ~83%, the thing that saves the most time is not finding new cars — it is instantly recognising a car already rejected. That only works if **rejections are logged too**, including off-brand ones. Logging everything is close to free (the data is already in the DOM and the capture is scripted), so the log is deliberately wider than the buying criteria.

Three tiers, with different jobs. Do not merge them.

| | Tier 1 — raw capture | Tier 2 — curated tracker | Tier 3 — deal tracker |
|---|---|---|
| **File** | `captures/feeds/*.json` per pass, merged into `captures/master.csv` | `seen_listings.md` | `deals/<listing-id>.md`, indexed by `deals/INDEX.md` |
| **Contains** | Every vehicle card returned, all brands, all prices, all distances | Only approved-brand cars actually triaged or opened | Only the handful that turned into a conversation with a seller |
| **Written by** | `tools/marketplace-cdp` + `merge.js`, mechanically | The agent, per §12 columns below | You or the agent, via `node mp.js deal` |
| **Edited by hand** | Never | Yes | Yes |
| **Purpose** | Dedupe across passes; market price baseline; re-checkable if criteria loosen | Human-readable record of why each candidate was kept or dropped | Track what the seller said, what the VIN showed, what the photos showed, and when you are seeing the car |
| **Scale** | ~10,000s of rows | ~1,000s of rows | ~10s of files, a page each |

**What to exclude even from Tier 1:** motorcycles, powersports, boats, trailers, RVs, campers, and commercial/industrial equipment. Note that `topLevelVehicleType=car_truck` is cosmetic (§8) and does **not** remove these — a 308-card capture contained 5 motorcycles despite the Cars & Trucks filter being set. Exclusion happens at parse time by keyword, not by trusting the filter.

**What to keep in Tier 1 even though it fails the criteria:** off-brand cars (Nissan, Hyundai, Ford…), cars over $10,500, cars over 110k miles, and cars outside the distance bands. These are kept deliberately — they are the price baseline, and they are what makes "already seen, already rejected" work on the next overlapping pass. This answers a question worth stating explicitly: **yes, listings that don't match the criteria still get saved — every one of them, automatically, every pass, at no extra cost.** They just live in Tier 1 (`master.csv`), not Tier 2 (`seen_listings.md`), because Tier 1 is designed to hold everything and Tier 2 is designed to hold only what a human would want to read.

**Near-miss promotion — the one case where a rejected listing gets a Tier 2 row anyway.** A car that is otherwise a strong candidate but only barely outside a *hard* cap (mileage 110,000–~120,000, or price $10,500–$11,000) should still get a one-line row in `seen_listings.md`, tagged `Rejected: mileage (near miss)` or `Rejected: price (near miss)` per the tracker's status table (§12 above is Tier 1/2 structure; the tracker file itself documents these statuses). The caps themselves are not moving — §2's $10,500 and 110,000mi remain hard cutoffs — but §14 already treats both as chosen defaults rather than fixed physical constraints, so a near-miss row costs one line now and saves a full re-search later if either cap is ever revisited. This does **not** apply to soft criteria that already have graded scoring instead of a hard cutoff (distance, price type, negotiability) — those never need a "near miss" tag because they were never a hard reject to begin with. It also does not apply to off-brand or wrong-body-type rejects, which stay in Tier 1 only, full stop — brand and body type are not the kind of criteria that "loosen."

**Card-title triage is not reliable enough to be the only gate.** From a real 94-car approved-brand capture on 2026-08-20:

- **"2014 Honda sonata"** — a Hyundai Sonata with the make typed wrong by the seller. Brand-matching on the title produces false positives; verify on the listing page before scoring.
- **Three minivans** (Odyssey, Sienna, VW Routan) passed brand triage. Body type needs its own check — an approved brand is not an approved body.
- Approved-brand cars were 94 of 308 cards (31%); after dropping minivans and the mislabel, 89 were genuinely in scope.

**Sort choice changes scam exposure.** That same capture, sorted `distance_ascend`, produced only 1 §3a down-payment flag in 94 cars — versus 20 flags found earlier in a comparable Honda slice sorted newest-first. Freshly-posted scam listings concentrate at the top of `creation_time_descend` and sink under `distance_ascend`. Expect to do most §3a and §6 scam screening on the newest-first pass.

### The curated tracker (`seen_listings.md`)

The single biggest annoyance in a repeated search is Marketplace re-showing the same listings. `seen_listings.md` is the fix — persistent memory of every listing ever opened, plus a human-readable record of why each was kept or dropped.

**Dedupe key:** the numeric listing ID from the URL (`facebook.com/marketplace/item/1234567890123456/` → `1234567890123456`), not the full URL — URLs pick up varying tracking parameters between runs.

**Tracker columns:**

| Column | Meaning |
|---|---|
| Listing ID | Numeric ID from the URL (dedupe key) |
| Vehicle | Year, make, model, trim |
| Listed Date | Seller's actual posting date, computed per §4 |
| First Seen / Last Seen | When *we* found it, and most recently saw it |
| Last Price | Most recent asking price |
| Effective Cash Price | Confirmed cash price **plus mandatory fees** (§5), else `—` |
| Price Type | One of the four values in §4. `Cash (seller confirmed)` is reserved for a reply and is the only value that lifts the §5 cap |
| **Price History** | e.g. `$8,200 → $7,500 (08/12)` — feeds the §5 negotiability point |
| **Days on Market** | From Listed Date — feeds the §5 negotiability point |
| Mileage | Most recent advertised or verified mileage; keep discrepancies in Notes |
| Title Status | Clean / Rebuilt / Not disclosed / Conflict / rejection reason |
| Location / Distance | City plus the §7 band |
| **Seller Fingerprint** | Phone number + short description-template signature — makes curbstoning detectable across runs |
| VIN Status | Provided and matched / Not provided / Refused / Mismatch / Not recorded |
| Dashboard Status | Verified clear / Warning lights / Unverified / Refused / Not recorded |
| Score / Tier | Per §5; blank for rejected listings |
| Status | `Active`, `Pending info`, `Must open`, `Not yet evaluated`, `Rejected: body type`, `Rejected: brand`, `Rejected: mileage`, `Rejected: title`, `Rejected: price`, `Suspected down payment`, `Not seen recently` |
| **Rejected At** | `card` or `listing` — lets you measure what the card-level triage is saving |
| Notes | Findings, contradictions, red flags, rejection reasoning |
| URL | Full listing URL |

Never reduce this tracker to IDs and statuses. Every row must preserve enough that the listing can be understood later without reopening it.

**Note:** `Rejected: distance` is retired. Distance is no longer a rejection reason (§2, §5).

**Two statuses added 2026-08-21, both meaning "we don't know yet" rather than "no":**

- **`Pending info`** — the listing is plausible but a field needed to judge it is simply absent (§5 pending-info rule). It carries a question queue in Notes and leaves the state as soon as the seller answers.
- **`Must open`** — the card could not be triaged at all (§9a). Never a terminal state; it means an open is owed.

Neither is a rejection, and neither may be used to close out a slice. Count both in the checkpoint.

**A financing flag must record its evidence.** Write `card-only` in Notes when the flag came from the year/price screen alone, or quote the financing language when it came from the page. A `card-only` flag on a 2019–2021 car is a to-do, not a verdict — the 2026-08-21 recheck found 75% of them were wrong (§3a).

**Recording a seller's price reply (added 2026-08-22).** This is now the highest-value row update in the tracker, because it is the only thing that lifts the §5 cap. When the seller answers the §11 price-verification message:

| Reply | Price Type | Effective Cash Price | Status |
|---|---|---|---|
| Listed price is cash, no fees | `Cash (seller confirmed)` | the listed price | `Active` |
| Listed price is cash, plus fees | `Cash (seller confirmed)` | listed price **+ fees**, re-band per §5 | `Active` |
| Listed price is a down payment | `Down payment (seller confirmed)` | the real cash figure if given, else `—` | `Suspected down payment` |
| No reply after a reasonable wait | unchanged | `—` | unchanged, note the date asked |

Put the date asked and the date answered in Notes. Never overwrite the advertised price with the confirmed one — `Last Price` stays what the ad says, so the gap between advertised and effective stays visible.

**The tracker was reset on 2026-08-20.** That is historical context, not a statement that the current tracker is empty. Superseded listings live in the private `archive/` directory and are *not* consulted for deduplication. A clean starter tracker for a new clone lives at `templates/seen_listings.md`.

**Each run:**

1. Read `seen_listings.md` first; build the set of known IDs and statuses.
2. Skip re-opening anything logged as `Rejected: body type`, `Rejected: brand`, `Rejected: mileage`, or `Rejected: title` **where the rejection came from a stated fact** — those facts don't change. A rejection recorded with `Rejected At = card` and no supporting figure is not a stated fact; re-open it. Do re-open `Rejected: price` (sellers cut prices), `Not yet evaluated`, `Pending info`, `Must open`, `Active`, `Suspected down payment` flagged `card-only` on a 2019–2021 car, and anything new.
3. For each listing opened, classify:
   - **Not in tracker, passes hard filters → New.** Full row, First Seen = Last Seen = today, Status = `Active`. Include in output.
   - **Not in tracker, fails → Rejected.** Full row with known details, Status = `Rejected: <reason>`, `Rejected At` = card or listing, Score/Tier blank, evidence in Notes. Counted in the summary, not in the table.
   - **In tracker as `Active`, price unchanged → Repeat.** Update Last Seen and any changed details. Counted only.
   - **In tracker as `Active`, price changed → Price Changed.** Update Last Seen, Last Price, Price History, and the row. Include in output with a Notes callout.
   - **`Rejected: price`, still out of range →** refresh Last Seen, leave status. If back in range, treat as new: re-score, set `Active`, include in output.
4. Save the tracker at the end of the run — append new rows, edit existing rows in place, never duplicate.
5. Optional: a previously `Active` listing absent from a run *may* be marked `Not seen recently`. Treat as a soft signal, not proof it sold.

`search_checkpoint.md` is the cross-chat control file — it records where the sweep stands so the next chat doesn't have to reconstruct the conversation. The tracker remains the authority on which IDs have been processed.

### The deal tracker (`deals/`)

**Added 2026-08-27.** Tiers 1 and 2 answer *discovery* questions — have I seen
this car, and why did I keep or drop it? A different set of questions starts
the moment a seller replies, and `seen_listings.md` is the wrong shape for
them: it is a single table of well over a thousand rows, so changing one cell
means rewriting the whole file, and the answers you need — what the seller
actually said, what the history report showed, what was visible in the
dashboard photo, when you agreed to meet — are prose, not cells.

So a conversation gets its own file: `deals/<listing-id>.md`, a page long,
cheap to read whole and cheap to edit. `deals/INDEX.md` is generated from
those files and is the only thing you need to read to see the whole board.

**When a deal file gets opened:** when you first message a seller, or the
moment a seller replies to a message you sent. Not before — a shortlisted car
you have not contacted is Tier 2 state, and opening a deal file for every
`Active` row would just rebuild the big tracker in a second place.

**Stages**, in order. The tracker moves forward through these; it does not
skip:

| Stage | Means |
|---|---|
| `queued` | Shortlisted, nothing sent yet |
| `asked-price` | §11 price-verification message sent |
| `asked-vin` | §11 near/long template sent — VIN and dashboard requested |
| `has-vin` | VIN in hand, history report not yet run |
| `vin-checked` | History report run and filed in the deal file |
| `ready` | Everything §11 requires **for this car's distance band** is satisfied |
| `scheduled` | Appointment set — date, time, and place recorded |
| `visited` | You saw the car |
| `closed` | Terminal. `outcome` is one of `bought`, `passed`, `sold-to-other`, `ghosted`, `scam`, `price-too-high` |

**`ready` is computed, not claimed.** The pre-visit table at the top of §11 is
the authority: a 0–10mi car needs a VIN and a running-dashboard photo, a
10–20mi car adds title and cash-price confirmation, and a 20+mi car adds the
cold-start video, the odometer photo and a confirmed appointment window. The
tool reads that table out of this file at run time and reports the gap. If §11
is edited, the gap calculation changes with it — there is no second copy of
the requirements to keep in sync.

**A seller's claim is not verification.** "No warning lights" typed into a
Messenger reply does not fill the dashboard requirement; §11 already says an
engine-off photo proves nothing, and text proves less. Record the claim as
context and keep chasing the photo.

**Which tier owns which fact.** `seen_listings.md` stays the authority on
discovery — price, mileage, title, score, tier, seen dates, and why a listing
was kept or dropped. The deal file is the authority on the conversation. The
two overlap in exactly three cells — `VIN Status`, `Dashboard Status`, and
`Effective Cash Price` — which the deal tool writes back into the tracker row
mechanically so a sweep that never opens `deals/` still sees that a VIN
exists. Do not maintain that overlap by hand.

**Never contact a seller from the tool.** The deal tracker records what was
sent and what came back. §11's rule is unchanged: the send is a human
keystroke.

`deals/` is private and ignored by Git — it holds seller names, VINs, and
appointment locations. A clean template for a new clone lives at
`templates/deal.md`.

---

## 13. Known Yield (reality check)

**The tracker was reset on 2026-08-20 and the search restarted from zero.** The figures below come from the first 106 listings, processed under the *previous* playbook and preserved in `archive/seen_listings.archive-2026-08-20.md`. They are kept here as a calibration reference — expected hit rate, not live state.

From those 106 listings:

| Outcome | Count |
|---|---|
| Rejected: brand | 60 |
| Rejected: distance (**now retired** — reinstated as `Not yet evaluated`) | 17 |
| Rejected: mileage | 16 |
| Rejected: body type | 7 |
| Reached `Active` | 6 |

Of those 6, three were confirmed disguised down-payment ads (their own descriptions say "Not cash price") and one had a replaced instrument cluster making its mileage unverifiable. **Real yield: 2 candidates from 106 listings** — a 2010 Toyota Corolla LE ($5,999 / 100,018 mi / Hollywood) and a 2019 VW Jetta ($9,000 / 91,750 mi / Davie).

Expect a low hit rate. That is normal for this market and this budget, and it is the reason the card-level triage in §9 matters so much: the cost per candidate found is dominated by listings that never should have been opened.

---

## 14. Assumptions & Open Decisions

Confirm or correct these; they were chosen as defaults, not confirmed by you.

- **Convertibles are excluded.** Excluded by omission in the original playbook; now explicit. Flag exceptional ones rather than dropping them silently. *Flip this if you'd take a convertible.*
- **Volkswagen stays approved, with a scoring cap** (§2). It's the weakest long-term-ownership fit of the nine. *Alternatives: drop it, or remove the cap.*
- **Down-payment and financing listings stay in results.** Financing language caps the tier and never subtracts points (§5). Only an ad that states its figure *is* a down payment loses its price band, and that caps at Marginal. *Hard-rejecting them from the card was considered and is now ruled out: the 2026-08-21 recheck measured the card screen at 75% false positives on 2019–2020 cars, and recovered 36 real candidates from listings that rule would have thrown away. The time saving was never real — it was 36 cars.*
- **Unlisted late-model cars appear in a look-queue, not the shortlist.** Infiniti, Mitsubishi, Jaguar, Tesla, and 2019+ German luxury in the main feed can be opened from High risk, high reward. Hard-rejected brands and junk stay out. This is not a new approved-brand list.
- **No year cap is applied.** The §3a card-level rule handles down-payment ads because the Year filter is confirmed cosmetic (§8); `maxYear=2018` displays as active but does not remove newer cars.
- **The stored origin is Pembroke Pines (zip 33029) with a 40-mile account radius.** The URL `radius` parameter is cosmetic and the account radius remains a soft relevance hint, not a boundary; record and score the actual city instead of assuming the feed is geographically complete.
- **Salvage, flood, junk and "no title" are automatic rejects.** *Say so if you'd consider one at the right price.*
- **Rebuilt-title quality gate is in force (§6, 2026-08-26).** Severe crash + airbags + missing repair docs + a thin discount is a pass, even when the listing is nearby and already messaged. Light cosmetic rebuilt with paperwork and ~35–45% off clean comps stays eligible. *Loosen this only if you decide a well-repaired airbag car is worth a visit.*
- **§7 distance bands are estimates.** Worth spot-checking a few against a map.
- **Listing language never affects filtering, scoring or ranking.** Handled manually after a vehicle qualifies.
