# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Evidence Desk decisions

- The selected source visual is `exec-b99f42ac-c15d-4433-9651-5277e94d1d35.png` (Scored Evidence Rail).
- Preserve the three-part composition: dark saved-view rail, evidence table, and score inspector.
- `used_car_buying_playbook.md` remains the only source of buying criteria. The app's data builder reads approved brands, distance bands, and scoring guidance from that file rather than redefining them.
- The browser bundle may include listing identity, price, city, score, tier, and non-sensitive evaluation fields. Never include seller fingerprints, VIN values, full tracker notes, or raw listing-page text.
- Seller-written card titles (`label`, `model`) are raw listing text. Strip phone numbers, contact pitches, and email addresses from them, and drop quoted description fragments from tracker-derived fields. `npm run data:scan` enforces this and gates `npm run build`; never publish a snapshot that has not passed it.
- Tier is derived from the score using playbook §5 (8+ / 4–7 / below 4), never read from the tracker's free-text Tier column. A tracker tier *below* the derived tier is a documented cap and is preserved with `cappedFrom` set so the UI can explain it. German candidates are additionally capped at `Worth a look` and are never presented as strong matches.
- Every score-ledger line must be computed from a structured tracker column. Do not infer factors from note prose. Whatever playbook §5 leaves to judgement (negotiability, reliability outlook, service records) is reported as one labelled residual with `ledgerComplete: false`, never as an unexplained plug that forces the column to balance.
- Facebook's struck-through `was_price` is a real price reduction and earns a playbook negotiability point, so it counts as a price change alongside reductions observed between captures. `priceChangeKind` distinguishes the two.
- The snapshot is fetched from `public/data/`, not imported, so listing data stays out of the JavaScript chunk. `evidence-core.json` must satisfy every view except "All listings"; keep the `inCore` rule in step with any new view or filter.
- The product is a static snapshot. New listings and price changes appear after the source files are refreshed and the app is rebuilt; never imply live synchronization or a backend.
- Keep `public/data/evidence-core.json` and `public/data/evidence-rest.json` deployable. Local builds regenerate them from the ignored source files; remote Vercel builds reuse the committed sanitized snapshot when *all* private inputs are absent. A partial set is an error, not a fallback — it would silently republish stale data.
- Distance remains a scoring factor, never a rejection filter.
- **Long shots, Worth asking, and Outside approved (playbook §3b) are derived in `build-data.mjs`, never hand-tagged.** `longShot` is an approved brand, 2019 or newer, at $10,500 or less. `worthAsking` is an approved, tracked, non-rejected listing whose price is unverified — either financing language in `Price Type` or a card-level `Suspected down payment` status. `outsideApproved` is a known passenger-car make that is neither approved, hard-rejected, nor German (German makes are routed to the German sweep), 2019 or newer, at $10,500 or less. Hard-rejected brands, motorcycles, and unparseable junk stay out. All three live in the High risk, high reward sidebar group, outside the scored funnel: one is a risk appetite, one is a work queue, and one is a look-queue that is never a recommendation.
- **Financing language caps a tier, it never subtracts points.** The user's own seller replies (2026-08-22) showed a good share of these listings are cash at the listed price with no dealer fees, so the old −1 penalty was retired. Only an ad that states its figure *is* a down payment loses its price band, and that caps at Marginal. Price caps are re-derived in the builder rather than read from the tracker `Tier` column so the rule and the display cannot drift.
- The Inspector shows the §11 price-verification message for any `worthAsking` listing. Keep it copyable and keep the wording aligned with the playbook — it is the action the category exists to enable. Outside-approved listings must say they are not recommendations; 2022+ cards at this price should be described as almost certainly a down payment.
- German candidates come from `captures/german_brands.csv` non-motorcycle rows (including pre-2019 candidates and late-model 2019+ cards flagged as `Suspected down payment`), enriched by `german_seen_listings.md`. Keep them in the separate `German cars` URL view; never merge their counts or tiers into the approved-brand funnel.
- Every German detail view must visibly say the sweep is exploratory and that these brands are not playbook-approved recommendations.
- Teammate help is on demand rather than shown at startup. Keep the guide simple: name the approved makes, explain the score tiers and playbook factors, provide a compact route from the score summary to the full scoring breakdown, send the primary action to `Strong matches`, and keep it reopenable from the interface.
- The shareable title-status filter has three explicit UI categories: values beginning with `Clean` are clean, values beginning with `Rebuilt` are rebuilt, and empty / `—` / not-disclosed or no-info values are not provided. Conflict and salvage values stay outside these categories.

## Publishing a refreshed snapshot

When the user asks to refresh the CSV data in the web app or publish updated listings:

1. From `web/`, run `npm run data:build` to regenerate the payloads in `public/data/`.
2. Run `npm run build` (which runs `data:scan`) and `npm run test:sites` before publishing.
3. Confirm the main and German counts are plausible and that the snapshot scan passed. Review any playbook-reconciliation warnings from `data:build` with the user rather than silently ignoring them.
4. Commit the intended web changes and push `main` to the private `origin`. Vercel redeploys automatically from that push.

Never add ignored source captures or trackers to Git. `captures/*.csv`, `seen_listings.md`, `german_seen_listings.md`, checkpoints, raw captures, and local prompts stay private even when the sanitized web snapshot is published.
