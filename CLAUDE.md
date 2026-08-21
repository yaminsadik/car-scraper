# car-scraper — Project Instructions

## What this project is

A reusable playbook for finding a used car on Facebook Marketplace near
Pembroke Pines / Miramar / Hollywood, FL (zip 33029). The judgement work — searching, filtering, scoring,
shortlisting — is done by an AI assistant with browser access following
`used_car_buying_playbook.md`.

There is one small piece of code, `tools/marketplace-cdp`, which reads listing
cards off a Marketplace tab in your own Chrome. It exists only because agents
cannot scroll the feed themselves (playbook §8a); it holds no search rules.

## Single source of truth

**`used_car_buying_playbook.md` is the only place search rules live.** This
file deliberately does not restate them. Earlier versions of this project
duplicated the criteria across three files and they drifted apart; don't
reintroduce that.

- **Rules, criteria, scoring, filters, output format** → the playbook
- **Where the sweep currently stands** → `search_checkpoint.md`
- **Which listings have been seen and why they were kept or dropped** → `seen_listings.md`
- **How the workflow fits together, and why** → `WORKFLOW.md` (prose) and
  `workflow.html` (visual). Explanatory only — they restate the playbook, they
  don't extend it. If they ever disagree with the playbook, the playbook wins.
- **Superseded findings and prior listing history** → `archive/`. Never read
  for deduplication.
- **Getting the cards off the page** → `tools/marketplace-cdp/`. Mechanism
  only. It contains no criteria and makes no decisions.

## How to run a task in this folder

Any task involving searching, filtering, scoring or shortlisting listings:

1. Read `used_car_buying_playbook.md` in full. **§8 first** — it documents
   which Facebook filters actually work. Most of the vehicle filters do not,
   and a search designed around them wastes the run.
2. Read `search_checkpoint.md` for the current sweep, price slice, and
   position, and `seen_listings.md` for known Listing IDs.
3. Follow playbook §9 as the execution plan.
4. Update `seen_listings.md` per §12 for every listing opened — passes and
   rejections alike — before producing output.
5. Update `search_checkpoint.md` at least every 5 new listings.

## Reading results out of the browser

**You scroll, the agent reads.** Automated scrolling does not trigger
Facebook's loader, so an agent that scrolls for itself sees only the first 24
results and will silently miss most of a slice. Manual scrolling works
normally — one hand-scrolled Honda slice yielded 264 listings where automation
capped at 24. Playbook §8a has the evidence.

This is not tied to any one AI tool. `tools/marketplace-cdp` talks to Chrome
over the DevTools Protocol from a plain shell command, so any assistant that
can run a terminal command can use it.

Setup, once per machine:

```bash
cd tools/marketplace-cdp && npm ci
```

Then in Chrome, open `chrome://inspect/#remote-debugging`, tick **Allow remote
debugging for this browser instance**, and Allow if prompted. Re-do this after
a full Chrome quit. The port changes each time and is read automatically from
Chrome's `DevToolsActivePort` file.

Per slice:

```bash
node mp.js open "<search url>"        # opens, focuses, and pins the exact tab
                                      # -> now scroll it to the bottom by hand
node mp.js read --out ../../captures/feeds/slice.json
node merge.js                         # writes ../../captures/master.csv
node validate.js                      # read-only consistency checks
```

`read` reports how many results and how many 24-card batches loaded. **If it
reports 24 or fewer, the tab was not scrolled** — go back and scroll before
using the output for anything. See `tools/marketplace-cdp/README.md`.

The tool is read-only. It never scrolls, clicks, or messages a seller.

## Things that are easy to get wrong

- **Facebook's Make and Body style filters are cosmetic.** They populate the
  sidebar and change nothing about the results. Brand and body type must be
  rejected from the card title. Playbook §8.
- **Distance is not a filter.** It is a graded scoring factor. Hialeah,
  Miami, Boca Raton and Aventura are in scope. `Rejected: distance` is
  retired. Playbook §2, §5, §7.
- **There is no artificial open limit.** Checkpoint every 5 listing opens and
  stop only at a complete cell, a clean handoff point, or a real constraint.
  Card-level triage remains unlimited and nearly free. Playbook §9 controls.
- **A feed that stops at 24 cards is a stalled loader, not an exhausted
  slice.** The old note calling 23–58 cards "normal" was wrong and cost real
  listings. 24 is Facebook's page size. Scroll by hand until it stops growing.
  Playbook §8a.
- **Never contact sellers.** Message templates in §11 are for the user to
  send by hand.

## Tracker history

The local tracker was reset on 2026-08-20. Superseded rows live in the private
`archive/` directory and are **not** used for deduplication. `seen_listings.md`
is live state, not an empty template; a clean template for new clones lives at
`templates/seen_listings.md`.

## Updating the playbook

§14 ("Assumptions & Open Decisions") lists the defaults that were chosen
rather than confirmed. If the user corrects one, or changes their criteria
in a way meant to be permanent rather than for a single session, edit
`used_car_buying_playbook.md` directly.

If the user's instructions for one session differ from the playbook, follow
their instructions for that session but don't silently edit the file — flag
the discrepancy and ask whether it should be made permanent.

## Conventions

- Keep the playbook copy-pasteable into other tools (a ChatGPT custom GPT, a
  Claude Project) — that's why all criteria live in one file.
- `seen_listings.md` is append/update-in-place data. Never rewrite it from
  scratch; never duplicate a row for a listing already tracked.
- `search_checkpoint.md` carries state across chats. Read it before
  continuing, write it before handing off.
- Code lives in `tools/`, documented in its own README and summarised above.
  Keep criteria out of it — tools move cards around, the playbook decides.
- Raw feed captures live in `captures/feeds/`; listing-page text lives in
  `captures/items/`; `captures/master.csv` is regenerated from feeds only.
- Captures, live state, and archives are private and ignored by Git. Never
  force-add them; use synthetic fixtures in tests.
