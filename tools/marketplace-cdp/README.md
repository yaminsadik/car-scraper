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

`msg` is the same bargain applied to messaging. It renders the text and puts it
on the clipboard; opening the composer, pasting, reading it over, and pressing
send are all done by hand. Nothing in this repository types into a Messenger
thread. Playbook §11 forbids automated seller contact, and scripted Messenger
traffic is what gets Marketplace accounts banned — losing the account would cost
the whole sweep, not just the messages.

`inbox` and `thread` read the conversation list and one open conversation out of
a tab you opened yourself. They are the same bargain again: read-only. Neither
one scrolls the list, clicks a conversation open, or types anything. The list
pages as you scroll exactly like the search feed does (§8a), so a short read
means an unscrolled tab, and `inbox` says so rather than sweeping a third of
your conversations quietly.

`deal` is the record of what happened after the send. It reads and writes files
only — it never opens Chrome, never reads a Messenger thread, and never replies
to anyone.

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

## Seller-message queue

```bash
node mp.js msg                    # who is owed a message, best first
node mp.js msg --text --limit 5   # same, with each rendered message
node mp.js msg --next             # copy the top message, open that listing
#                                 -> click Message, paste, read it, send
node mp.js msg --sent <id>        # stamp the tracker row afterwards

node mp.js msg <id> <id> <id> --text   # only the listings you name
node mp.js msg <id> <id> --next        # work through just those, in order
```

`msg` reads `seen_listings.md` and answers the only question that is tedious to
answer by hand: which listings still owe a seller a question, which question,
and in what order.

**No criteria live here.** The three §11 templates are extracted from
`used_car_buying_playbook.md` at run time, and the distance bands from its §7
table. If a heading is reworded so the extraction misses, `msg` throws with the
heading it wanted rather than falling back to a stale inline copy. Fix the
pattern in `msg.js`; never paste the message text into the tool.

Which rows are in the queue, and why:

- **Eligible statuses** are `Active`, `Pending info`, and `Suspected down
  payment` — the states where a seller's answer still changes something.
  `Not yet evaluated` and `Must open` owe an open, not a message (§9a), and
  rejections owe nothing.
- **Stage `price`** — the §11 price-verification message. Owed whenever
  `Price Type` is anything other than `Cash (seller confirmed)`, which §12
  reserves for an actual reply. It goes first, because there is no point
  requesting a cold-start video for a car whose price turns out to be a
  monthly payment.
- **Stage `verify`** — the near (0–20 mi) or long-drive (20+ mi) template,
  chosen by the band in the row's `Location / Distance` cell, falling back to
  the §7 city table. Owed once the price is confirmed but `VIN Status` or
  `Dashboard Status` is still unrecorded.
- **Order** is score descending, then price ascending: §3b's work queue,
  "ordered by how good the car would be if the answer comes back clean."

Filters: `--stage price|verify`, `--min-score n`, `--limit n`, `--all`.

## Ranking: quality vs. motivation

```bash
node mp.js msg                        # default: §5 quality score
node mp.js msg --sort negotiability   # who is likeliest to drop their price
```

Two numbers travel with every row, and **both are always shown whichever way
you sort**:

- **`sc`** — the §5 quality score already in the tracker. A clean title is
  worth +2 here, so a genuinely good clean-title deal sits near the top by
  default and is never buried.
- **`neg`** — 0–3, computed from §5's Negotiability table: price already
  reduced, listed past the day threshold, and "OBO" / "negotiable" /
  "must sell" language. `--text` names which signals fired.

Sorting **re-ranks and never filters** — nothing leaves the queue because of
how it is ordered, so switching to `negotiability` cannot hide a strong
clean-title candidate, and the default cannot hide a motivated seller. The
listings worth the most attention are the ones scoring high on both.

The points, the day threshold, and the keyword list are all parsed out of §5's
table, so editing the playbook changes the ranking — nothing here is
hardcoded. Two caveats on the language signal:

- It reads `Seller Fingerprint` (where the ad text lives) **and** `Notes`,
  because the tracker's own scoring narration records an awarded `OBO +1`.
  In practice most hits arrive by that second route, which makes the signal
  partly a reflection of an earlier scoring pass rather than a fresh read of
  the ad.
- `not negotiable` and `non-negotiable` are explicitly excluded — they are
  the opposite of a negotiability signal.

Treat `neg` as a ranking hint for where to spend a message, never as a gate.

## Messaging a chosen few

Naming listing IDs on the command line replaces the ranked queue with exactly
those rows, **in the order you named them** — a deliberate pick is not
re-sorted by score. This is the form to use when you have picked candidates off
a shortlist yourself, or when an agent has been told which ones to work:

```bash
node mp.js msg 1000000000000101 1000000000000102 --text   # preview both
node mp.js msg 1000000000000101 1000000000000102 --next   # stage the first
node mp.js msg --sent 1000000000000101                    # after you send it
node mp.js msg 1000000000000102 --next                    # then the second
```

Each named listing is still put through the same §11 stage logic, so a chosen
listing gets the template its `Price Type` and distance band call for — naming
it does not force a message it does not need. IDs that have no tracker row, or
whose price, VIN and dashboard are all already on file, are reported as
`skipped` with the reason rather than silently dropped.

`--next` with several IDs stages the first and prints the rest, so nothing you
picked gets lost between sends.

`--next` takes the top row that has a listing URL, copies the message with
`pbcopy`, and opens the listing in a new tab. It deliberately does **not**
touch the pinned capture target — that pin belongs to a search feed, and
losing it costs a whole slice.

`--sent <id>` records the send in `seen_listings.md`: `Last Seen` moves to
today, `Active` becomes `Pending info` (a sent question is exactly the "field
we need is absent" state), a `Suspected down payment` classification is left
alone, and a dated stamp is appended to `Notes`. It rewrites that one line and
nothing else, refuses to write if the line count changes, refuses a duplicated
listing ID, and is idempotent. `--dry` on either command shows the work without
doing it.

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
- Raw labels are re-parsed on every run, so a parser fix in `mp.js` applies
  retroactively to captures already on disk.
- `review` marks rows that cannot be triaged from the card alone — `no-title`,
  `no-make`, `unknown-make`, `no-year`, or empty when the card is complete.
  These rows are kept, never dropped, and playbook §9a requires opening them.
  `unknown-make` means the brand list or the parse failed, not that the car is
  off-brand; add genuine spellings to `KNOWN_MAKES` in `merge.js`.

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
node mp.js msg [--text] [--all] [--limit n] [--stage price|verify] [--min-score n]
node mp.js msg [--sort score|negotiability]
node mp.js msg <id...> [--text]
node mp.js msg [<id...>] --next [--dry]
node mp.js msg --sent <id> [--dry]
node mp.js inbox [--all] [--limit n] [--dry]
node mp.js thread <listing-id> [--dry]
node mp.js thread [--dry]
node mp.js deal [board|due|index]
node mp.js deal <id>
node mp.js deal open <id...> [--dry]
node mp.js deal set <id> key=value... [--dry]
node mp.js deal log <id> "<what happened>"
node mp.js deal note <id> <description|vin|photos|appointment> "<text>"
node mp.js deal vin <id> <VIN> [--no-sync] [--dry]
node mp.js deal thread <id> "<name>|<listing>"
node mp.js deal appt <id> "<when>" [--where "<place>"]
node mp.js deal close <id> <bought|passed|sold-to-other|ghosted|scam|price-too-high> [--no-sync]
node merge.js [--dir dir] [--out file] [--keep-all]
node validate.js
npm test
```

## `inbox` and `thread` — finding the eight conversations that moved

A working Marketplace inbox is not a list of leads, it is a pile. Mine holds 237
conversations, 167 of them about cars and the rest about laptops. Nothing in it
tells you which ones changed since yesterday, so the only reliable way to find
out has been to open all of them.

`inbox` is for finding conversations you are **not** tracking — of 167 car
conversations in mine, only 40 had a deal file. For cars that already have one,
work from the listing instead (below); it needs no inbox at all.

It reads the list you scrolled, sorts it into the states Facebook itself names,
and diffs it against the last sweep:

```text
$ node mp.js inbox
Inbox read — 237 conversation(s): 167 about cars, 70 other.
Last sweep : 2026-08-26

12 changed since last sweep

  NEW PHOTOS (3)
    Priya       2017 Toyota Corolla · LE Eco Premium Sedan   10:32 AM  deal 1000000000000103
    ...
  WAITING ON YOU (5)
    Morgan        2016 Subaru Impreza · 2.0i Premium Sedan 4D  10:55 AM  deal 1000000000000104
```

`NEW PHOTOS`, `WAITING ON YOU` and `MARKED SOLD` come from Facebook's own fixed
phrasings and are as reliable as the page. Anything left over lands in
`LAST SPEAKER UNCLEAR`, because Facebook prefixes `You:` only sometimes —
"what is the VIN?" is mine and "Ok in minutes" is theirs, with nothing in the
row to tell them apart. Guessing there would send you to re-read conversations
that owe you nothing, so the bucket is labelled honestly instead.

### Binding a conversation to a deal — once, by hand

Facebook puts **no listing ID anywhere in the inbox**. The rows are bare divs
with no anchor, and `marketplace/item` appears zero times on the page. So the
only available match is seller name plus vehicle title, and that is a guess:
three different people selling a 2018 RAV4 collapse onto one deal under any
similarity score, and a wrong join sends you to the wrong car.

So `inbox` proposes and you decide:

```text
    Morgan · 2016 Subaru Impreza · 2.0i Premium Sedan 4D
      1000000000000104  2016 Subaru Impreza 2.0i Premium Sedan   $7,000
      1000000000000105  2018 Subaru Impreza 2.0i AWD 4dr Sedan   $7,990
      node mp.js deal thread <id above> "morgan|2016 subaru impreza 2 0i premium sedan 4d"
```

Run it once and the key is stored in the deal file. You are never asked again,
and `deal thread` refuses a key already bound to another listing.

### Reading one conversation — go in through the listing, not the inbox

The inbox is the wrong door for a car you already track. Facebook puts no
listing ID in it, so you would be hunting a name among two hundred rows and
then matching it back to a deal by guesswork.

Go the other way. You already have the listing ID, and the conversation with
that seller is on the listing page:

```text
$ node mp.js thread 1000000000000106
Opened https://www.facebook.com/marketplace/item/1000000000000106/
Click "Message" on that page so the conversation is on screen, then run:
  node mp.js thread 1000000000000106
```

Click Message, run it again:

```text
$ node mp.js thread 1000000000000106
Taylor · 2016 Toyota Corolla · LE Eco Plus Sedan 4D — $6,500
7 message(s) -> captures/threads/1000000000000106/2026-08-27_transcript.txt
  [11:12 AM] You: what is the VIN number of the car?
  [2:39 PM] Taylor: Ok in minutes

  VIN candidate(s) typed in the conversation:
    4S3GKAA68J3000006  (Taylor, 3:49 PM)
    verify + record: node mp.js deal vin 1000000000000106 4S3GKAA68J3000006

  BLOCKED — needs you: 2 unreviewed image(s).
    node mp.js deal note 1000000000000106 photos "what it showed"
```

Nothing to match, nothing to bind. Reading it this way also learns the inbox
key as a side effect, so `mp.js inbox` shows that conversation linked on the
next sweep without anyone running a binding pass for it.

`node mp.js thread` with no ID falls back to reading whichever conversation is
open in the inbox tab — for conversations that have no deal file yet.

**Image scoping.** A listing page carries the seller's whole photo carousel: 64
images at 960x720 on the page used above, against four in the conversation. So
the reader climbs from the first message marker up to the largest ancestor that
still does not engulf the carousel, and says so if it cannot tell them apart.

Three things this deliberately does not do:

- **It does not record the VIN.** A seventeen-character string in a chat is a
  candidate. `deal vin` runs the check digit and owns the stage; a misread never
  advances a deal on its own.
- **It does not guess what a photo showed.** It counts the images, writes them to
  disk, and reports the gap. Facebook's CDN links are signed and expire within
  hours, so the bytes are saved now rather than a URL that will 403 tomorrow.
- **It does not close the block.** `deal note <id> photos "…"` does, because
  describing what you saw *is* the review — and a separate command to confirm it
  is the kind of bookkeeping that silently stops happening.

The unreviewed count then rides along on the board and in `deals/INDEX.md`, so a
photo nobody has looked at cannot quietly stop being a blocker.

## `deal` — the per-conversation tracker

`seen_listings.md` is a single table of well over a thousand rows. It is the
right shape for "have I seen this car?" and the wrong shape for "what did this
seller say, what did the VIN show, and when am I seeing the car?" — changing
one cell there means rewriting a megabyte, and the answers are prose anyway.

So each conversation gets `deals/<listing-id>.md`: a page long, frontmatter for
the fields worth sorting on and markdown sections for everything else.
`deals/INDEX.md` is generated from those files and is the only thing you read
to see the whole board. Playbook §12 documents the tiers and the stages;
`deals/` is private and gitignored, and `templates/deal.md` is the clean copy.

### Starting one

```bash
node mp.js deal open 1000000000000107
```

Seeds the file from the `seen_listings.md` row — vehicle, price, mileage,
title, band, seller fingerprint, and any VIN or dashboard status already
recorded — and copies the seller's own description out of `captures/` if a
listing-page capture exists. Nothing is retyped, so the two records cannot
start disagreeing.

### The board

```bash
node mp.js deal        # everything open, most urgent first
node mp.js deal due    # only what is owed today
```

Each line reports the §11 gap for that car's distance band:

```text
  2026-08-27  has-vin      2017 Honda Civic LX Sedan          $8,999   0–10mi   1000000000000108
    next: chase dashboard
    §11 0–10mi: still owed — dashboard
```

The requirements come from §11's pre-visit table, read out of the playbook at
run time, and they accumulate: a 20+mi car owes everything a 0–10mi car owes
plus a cold-start video, an odometer photo and a confirmed appointment window.
Nothing about the requirements is written down in this directory. If §11 is
reworded so the table no longer parses, `deal` throws with the reason rather
than falling back to a stale copy.

### Recording a VIN

```bash
node mp.js deal vin 1000000000000108 SHHFK7H41MU000003
```

The VIN is validated before it is stored: 17 characters, no I/O/Q, and the
position-9 check digit recomputed from the other sixteen. It also decodes the
model year and assembly region and compares the year against the listing.

```text
VIN SHHFK7H49MU000003
  decodes to: 2021 model year, built in UK
  ! check digit is "9", should be "1" — the VIN is mistyped or made up.
    Ask the seller to resend it as a photo of the door jamb or windshield plate.

Not recorded. Fix the VIN first — §11: refusal or a bad VIN means do not schedule.
```

This is arithmetic, not a lookup — no network, no API key — and it costs
nothing to run before you pay for a history report on a car that doesn't exist.

This writes `VIN Status` back into the `seen_listings.md` row automatically
— the same way `msg --sent` writes that tracker without asking for a flag —
so a sweep that never opens `deals/` still sees the VIN. `--no-sync` skips it
if you want the deal file updated without touching the tracker.

### Everything else

```bash
node mp.js deal log  1000000000000108 "seller says cash price, no fees"
node mp.js deal note 1000000000000108 photos "dash photo: engine running, no lights, 88,412 mi"
node mp.js deal note 1000000000000108 vin "AutoCheck: 1 owner, no accidents, filed as report.pdf"
node mp.js deal appt 1000000000000108 "2026-08-30 10:00" --where "Pembroke Pines PD safe-exchange lot"
node mp.js deal close 1000000000000108 passed "rust underneath"
```

`appt` warns if §11 is not satisfied for the band yet, records the appointment
anyway, and repeats the §11 at-the-sale rules in the file. `--dry` on any
writing command prints what would change and writes nothing.

## Card parsing

Real result links carry a Marketplace item ID and usually a `tracking` query
parameter with `commerce_rank_obj.primary_position` and a batch `qid`. Cards
with neither a primary position nor a search/category `ref` are treated as
recommendation-strip filler unless `--all` is passed.

Card fields come from `aria-label`, normally:

```text
<year> <make> <model>, $<price>, [reduced from $<price>,] <city>, <ST>, listing <id>
```

Not every card matches that shape. City and state are frequently absent, some
sellers get a full state name, and Facebook occasionally emits a numeric make ID
in place of the make. The parser tolerates all three and falls back to whatever
it can read rather than failing the whole label.

Unrecognized labels remain in the capture with `parsed: false`; validation
reports them as warnings rather than discarding their IDs. `merge.js` re-parses
the stored raw label on every run, so fixing the parser recovers historical
cards without re-scrolling anything — run `node merge.js` after any change here.
