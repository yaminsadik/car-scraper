# marketplace-cdp

Local Node.js utilities for reading Facebook Marketplace cards and listing-page
text from the user's signed-in Chrome through the Chrome DevTools Protocol.

The tools are mechanical: they do not contain approved brands, budgets,
scoring, or buying criteria. Those rules live only in
`used_car_buying_playbook.md`.

## Safety and scope

The utility opens, focuses, reads, and closes browser tabs. It never scrolls a
feed, clicks listing controls, submits forms, or contacts sellers. The user
performs the Marketplace scroll manually because automated scrolling does not
reliably trigger Facebook's loader.

## Requirements

- macOS and Google Chrome—the endpoint discovery path is currently macOS-only
- Node.js 18 or newer
- Chrome signed in to the Marketplace account you intend to use

Install the single runtime dependency:

```bash
npm ci
```

In Chrome, open `chrome://inspect/#remote-debugging`, enable **Allow remote
debugging for this browser instance**, and approve the prompt. Repeat this
after a full Chrome quit. Chrome records its negotiated endpoint in
`~/Library/Application Support/Google/Chrome/DevToolsActivePort`; `cdp.js`
reads that file on every invocation.

## Capture a search feed

```bash
node mp.js open "<verified Marketplace URL>"
# Scroll the newly opened tab to the bottom by hand.
node mp.js read --out ../../captures/feeds/2026-08-21_4000-5999_distance_ascend.json
node merge.js
node validate.js
```

`open` persists the exact Chrome target ID in a private ignored pin file.
`read` uses that target on later invocations, eliminating the old behavior of
reading the first Marketplace tab returned by Chrome. If the pin is missing
and several search tabs are open, `read` refuses to guess:

```bash
node mp.js tabs
node mp.js read --target <target-id> --out ../../captures/feeds/<name>.json
```

The feed capture records the actual page URL, capture timestamp, card count,
batch count, and parsed listing records. A count at or below 24 is a warning
that the first Facebook page may be the only batch loaded.

## Capture listing-page text

```bash
node mp.js item <id-or-url> [<id-or-url> ...] \
  --out ../../captures/items/items_batch1.json
```

Each listing is opened in a temporary tab, read once, and closed in a cleanup
block even if an error occurs. Item captures are arrays and stay separate from
feed-capture objects.

## Merge semantics

`node merge.js` reads `captures/feeds/*.json` and writes
`captures/master.csv`.

- Captures are ordered by their `capturedAt` timestamp, with filename as a
  stable fallback.
- Listing ID is the deduplication key.
- `first_pass` and `last_pass` reflect chronological observation order.
- The most recent price, raw label, model, city, and URL are updated together.
- `price_changed` retains the chronological price chain.
- `best_rank` is the lowest numeric position observed across passes.
- Only clearly non-passenger vehicle classes are dropped; `--keep-all`
  disables that filter.

Custom paths remain available:

```bash
node merge.js --dir path/to/feeds --out path/to/master.csv
```

## Validation

`node validate.js` is read-only. It checks:

- feed and item JSON shapes;
- capture metadata, counts, IDs, and duplicate IDs;
- master CSV uniqueness and price/label consistency;
- tracker row shape and listing-ID uniqueness;
- checkpoint tracker count and retired 12-cell references.

Warnings identify recoverable parsing limitations; structural errors return a
non-zero exit code.

## Commands

```text
node mp.js tabs
node mp.js open <marketplace-url>
node mp.js read [--out file] [--all] [--target id]
node mp.js item <id-or-url...> [--out file]
node merge.js [--dir dir] [--out file] [--keep-all]
node validate.js
npm test
```

## Card parsing

Real result links carry a Marketplace item ID and usually a `tracking` query
parameter with `commerce_rank_obj.primary_position` and a batch `qid`. Cards
with neither a primary position nor a search/category `ref` are treated as
recommendation-strip filler unless `--all` is passed.

Card fields come from `aria-label`, normally:

```text
<year> <make> <model>, $<price>, [reduced from $<price>,] <city>, <ST>, listing <id>
```

Unrecognized labels remain in the capture with `parsed: false`; validation
reports them as warnings rather than discarding their IDs.
