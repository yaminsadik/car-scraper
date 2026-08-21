# car-scraper

A human-in-the-loop workflow for finding and evaluating used cars on Facebook
Marketplace. The buyer scrolls a signed-in Marketplace search in Chrome; a
small local Node.js tool reads the loaded cards through the Chrome DevTools
Protocol. The playbook then drives card triage, listing review, scoring,
deduplication, and checkpointing.

The project does not automate seller contact, purchasing, or unattended
scrolling. Search and scoring rules live only in
[`used_car_buying_playbook.md`](used_car_buying_playbook.md).

## How it fits together

```text
playbook (rules)
      │
      ├── search_checkpoint.md (private progress)
      ├── seen_listings.md     (private curated decisions)
      │
Chrome ──> mp.js ──> captures/feeds/*.json ──> merge.js ──> captures/master.csv
                  └─> captures/items/*.json
                                      │
                                      └─> validate.js (read-only checks)
```

`WORKFLOW.md` provides the prose walkthrough, and `workflow.html` is a visual
version. If either differs from the playbook, the playbook wins.

## Requirements

- macOS with Google Chrome
- Node.js 18 or newer
- A Facebook account already signed in to Marketplace in Chrome

Chrome remote debugging is enabled manually from
`chrome://inspect/#remote-debugging`. The tool connects only to the local
DevTools endpoint recorded by Chrome.

## Setup

```bash
cd tools/marketplace-cdp
npm ci
cd ../..
cp templates/search_checkpoint.md search_checkpoint.md
cp templates/seen_listings.md seen_listings.md
mkdir -p captures/feeds captures/items captures/legacy
```

The copied state files and everything under `captures/` are intentionally
ignored by Git because they can contain seller names, contact details,
locations, VINs, listing text, and personal search history.

## Normal capture loop

From `tools/marketplace-cdp`:

```bash
node mp.js open "<verified Marketplace search URL>"
# Scroll the pinned Chrome tab to the bottom by hand.
node mp.js read --out ../../captures/feeds/2026-08-21_7500-8999_distance_ascend.json
node merge.js
node validate.js
```

`open` pins the exact Chrome target. Later `read` calls use that target rather
than whichever Marketplace tab Chrome happens to return first. If the pin is
lost and multiple search tabs are open, the tool refuses to guess; use
`node mp.js tabs` and pass `--target <id>`.

To capture listing-page text for local review:

```bash
node mp.js item <listing-id> [<listing-id> ...] \
  --out ../../captures/items/items_batch1.json
```

The complete operating procedure—including URL construction, human scrolling,
card triage, reliability research, scoring, and checkpoint frequency—is in the
playbook.

## Commands

| Command | Purpose |
|---|---|
| `node mp.js tabs` | List Chrome tabs and show which target is pinned |
| `node mp.js open <url>` | Open, focus, and pin a Marketplace search tab |
| `node mp.js read [--out file]` | Read cards from the pinned search tab |
| `node mp.js item <ids...> --out file` | Capture listing-page text into a private item file |
| `node merge.js` | Chronologically merge private feed captures into `captures/master.csv` |
| `node validate.js` | Check captures, master data, tracker uniqueness, and checkpoint counts without writing |
| `npm test` | Run fixture-based unit tests |

## Data layout

| Path | Role | Git policy |
|---|---|---|
| `captures/feeds/` | Search-card capture objects | Private and ignored |
| `captures/items/` | Opened listing-page arrays | Private and ignored |
| `captures/master.csv` | Deduplicated mechanical index | Private and ignored |
| `seen_listings.md` | Curated evaluation tracker | Private and ignored |
| `search_checkpoint.md` | Current grid position and run log | Private and ignored |
| `templates/` | Clean starter state | Public and tracked |
| `archive/` | Superseded private runs | Ignored except for its policy README |

See [`captures/README.md`](captures/README.md) for capture schemas and retention
guidance.

## Development

The Node utility intentionally has one runtime dependency, `ws`. Buying rules
must not be added to `tools/marketplace-cdp`; tooling stays mechanical and the
playbook stays authoritative.

Before sharing a change:

```bash
cd tools/marketplace-cdp
npm test
node merge.js
node validate.js
```

Do not force-add ignored scrape data to Git. If a bug needs a fixture, create a
small synthetic record under `test/` rather than copying a real seller page.
