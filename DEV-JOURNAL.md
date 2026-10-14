# Dev journal

Operational notes for running this repo with AI chats. Buying rules stay in
`used_car_buying_playbook.md`. Live search position stays in
`search_checkpoint.md`. Copy-paste worker prompts stay in `prompts/` (Git-ignored).

---

## 2026-08-27 — The scraper was one stage of a pipeline nobody had drawn

### What was going wrong

Nothing was broken. That is the point of this entry.

The project began as "build a scraper." The scraper works. But buying a car is
not one stage, it is roughly seven, and six of them were discovered by walking
into them rather than by being planned:

> find the pool → triage the cards → open the listing → ask the seller for a
> VIN and a running-dashboard photo → verify the VIN and the title → for a
> rebuilt title, find the pre-repair auction photos and judge whether the
> damage was cosmetic or structural → decide whether the car is worth the drive
> → inspect, negotiate, close.

Each of those stages arrived late, as a surprise, and cost a rewrite. The
repository's own build order is the evidence:

| When | What landed | Which stage |
|---|---|---|
| 2026-08-21 (first commit) | `mp.js`, the playbook, `seen_listings.md`, `WORKFLOW.md` | find |
| 2026-08-21 → 08-26 | Evidence Desk web app, `BRAND_SWEEPS_PLAN.md`, Route B sweeps | find, elaborated |
| **2026-08-27** | `deals/`, `deal.js`, `templates/deal.md`, the whole `queued → … → closed` state machine | **the seller conversation — day 7, still uncommitted** |

Six days of build went into the stage that handles ~2,400 cards. The stage that
handles the ~40 cars a human actually talks to was invented last, in an
afternoon, after the conversations had already started and had nowhere to live.

### The failure mode, named

**Effort followed volume when it should have followed consequence.**

The funnel runs 2,419 cards → ~1,700 triaged → 40 deals → maybe 3 visits → 1
purchase. Scraping operates at n≈2,400, where a mistake costs a wasted row.
Judging auction photos operates at n≈5, where a mistake costs a car you drive
for three years. The first stage got a tool, a web app, and a 93KB playbook
section. The second got two link bullets.

The reason is legibility, not laziness. A scraper announces itself as a thing to
build: mechanical, high-volume, visibly working. "Look at the pre-repair auction
photos and decide whether the damage touched a structural member" does not feel
like a system — it feels like something you will simply do when the time comes.
So it never gets a state, an owner, or a gate, and it silently becomes the
bottleneck.

### The live proof, today

The auction before/after photo check is a real decision gate — it is the thing
that separates a rebuilt car worth driving 40 minutes to see from one that
should never have been shortlisted. In this repo it currently exists as:

- two links in `used_car_buying_playbook.md` §11, inside an "At the sale" list
- one clause in §6 about the rebuilt gate

It is **not** a value in `STAGES` in `tools/marketplace-cdp/deal.js`. There is no
`auction_photos` field in the deal frontmatter. `node mp.js deal due` cannot
report it as owed, because the tool does not know the step exists.

Meanwhile `deals/INDEX.md` reads **40 open · 1 queued · 4 asked-vin · 32
has-vin · 3 vin-checked**. Thirty-two cars are one step away from a gate that
has not been built. This entry is being written before that hits, not after —
which is the first time in this project that has been true of anything.

### What changed

- `PROCESS_DESIGN.md` — the six-step pass that would have produced the whole
  pipeline on day one, written up so it transfers. It holds no buying criteria;
  the playbook is still the only place those live.
- The same document, made specific to the acquisition project, at
  `~/developer/personal/bizaq/PROCESS-DESIGN.md`, with a pointer from that
  repo's `START-HERE.md`. bizaq is at exactly the stage car-scraper was at on
  2026-08-26: a strong discovery pipeline, 107 screened candidates, and nowhere
  for a conversation to live the moment an owner replies.

### Still open

The auction-photo gate is designed but not built. It wants an `auction_photos`
field, a damage-judgement note, and a rule that blocks `ready` for any Rebuilt
title until pre-repair photos have been judged — the same shape as the existing
dashboard rule, where a seller's claim is recorded as a claim and does not
satisfy the requirement.

---

## 2026-08-23 — Packed worker chats for a large remaining-open queue

### What was going wrong

Honda Route B (`query=honda`, $4,000–$10,500, newest first) had already been
captured (2,419 cards) and partly triaged (**170/584**). Hundreds of listing
pages still needed `mp.js item`. One chat could not finish that without
compacting.

Splitting into new chats was the right instinct. The first handoff prompt was
not. It told the next chat to *rebuild remaining IDs*, *read the playbook and
tracker*, and *start yet another chat if it could not run the terminal*. That
chat burned context deciding what to do and never opened pages. Ask/Plan mode
fails the same way: no Shell, so no `mp.js`.

The expensive part of a fresh chat is startup (discover the job, reread
playbook + tracker + checkpoint, invent a queue). Item dumps are cheap: a
15-page `captures/items/items_batch40.json` was ~42KB.

### What we changed (and it worked)

Keep one long **planner** chat (this kind of chat) that does not compact. That
chat freezes the remaining ID queue from the capture JSON minus
`seen_listings.md`, then writes numbered paste files. Each **worker** chat
gets a self-contained prompt: Agent mode, this repo, exact IDs, exact
commands, stop condition. The worker does not figure out remaining IDs.

For Honda Route B that produced:

- `prompts/honda-route-b-chats/01-batches-41-42.txt` … `14-batches-67-68.txt`
- 28 batches of 15, two batches per chat, 14 worker chats
- Must-opens (2019–2021) first, then pre-2019
- Four leftover 2022+ rows dropped as non-cars (motorcycle / engine / trailer)

User flow: open the next file, copy between the `--- copy ---` lines, new
**Agent** chat in `car-scraper` (not Ask, not Plan, not another repo), paste.
If a worker dies mid-batch, re-paste **that** file, not the next one.

That packing is what started landing tracker rows instead of planning loops.

### Why two batches per chat

| Packing | Startup tax | Risk |
|---|---|---|
| 1 batch (~15 pages) | Paid once per 15 IDs | Safest, slowest |
| **2 batches (~30 pages)** | Paid once per 30 IDs | Sweet spot on this slice |
| 3+ batches | Cheaper | Tracker writes get sloppy; more likely to compact mid-write |

Two is a starting point, not a law. Stay at two until a pair finishes without
compacting or missing rows. Only then try three.

This slice was also easy to pack: most 2019–2021 pages at these prices are
known BHPH / “not cash price” templates, so scoring is cheap. A queue of
genuinely new cash cars would be heavier; still start at two batches.

---

## Guide — freeze a remaining-open queue for worker chats

Use this when capture is done, N is large, and the constraint is chat context
rather than the playbook’s “one cell per chat” rule. You are still on the
**same** cell or Route B pass. Do not start a new capture from a worker.

### 1. Planner chat (do not compact it)

In the chat that already knows the capture and tracker:

1. Rebuild remaining IDs once: capture JSON minus Listing IDs already in
   `seen_listings.md`. Keep approved brands; drop minivans, pickups,
   convertibles, motorcycles, engines, trailers.
2. Order the queue the playbook already chose for this pass (here: 2019–2021
   must-opens, then older cars).
3. Chunk ~15 IDs per `mp.js item` batch (same size as existing
   `items_batchNN.json` files). Pair two batches per worker file.
4. Write paste files under `prompts/<run>-chats/`. Put the **exact**
   `node mp.js item <ids> --out ../../captures/items/items_batchN.json`
   command in the file. The flag is `--out`, not `--output`.
5. Leave the planner chat open. Do not ask a worker to rediscover the queue.

### 2. What every worker prompt must contain

- **Agent mode, this repo.** First action is the first `mp.js item` command,
  not a plan and not “read these three files in full.”
- Frozen IDs and output paths. No “rebuild remaining from the capture.”
- “You have Shell. Use it. Do not tell me to start another chat.”
- Checkpoint: read only the current X/N line; add 1 per ID actually logged;
  checkpoint every 5. Do not recount N.
- Write a full `seen_listings.md` row per opened ID (same columns).
- User-facing output: new Actives / Worth a look, plus price changes on
  existing Actives. Everything else stays in the tracker.
- Known BHPH templates / already-found Actives for this pass, so repeats are
  not reported as new.
- Empty Marketplace shells (~1500 chars): wait, retry that ID once, else
  `Not yet evaluated`.
- Optional escape hatch: if a page is a real cash listing, read playbook
  scoring (§5, §6) before scoring it. Template BHPH pages do not need that.
- Stop after the batches in **this** file. Then `node validate.js` and a
  one-line handoff (final X/N, new Actives, next prompt filename).
- If `mp.js item` cannot connect: one sentence that remote debugging is down,
  then stop.

Do **not** put in the worker prompt:

- “If you cannot run the terminal, start a new chat”
- A remaining-ID rebuild script
- “Read the playbook, checkpoint, and tracker in full first”
- Capture / scroll / `mp.js read` / `merge.js` (those belong in a capture chat)

### 3. How to paste

1. Chrome remote debugging already allowed (`chrome://inspect/#remote-debugging`).
2. New **Agent** chat in this repo.
3. Paste only the block between `--- copy from here ---` and `--- copy to here ---`.
4. After handoff, paste the next numbered file.
5. Failed worker → same file again. Never skip ahead; later files assume
   earlier IDs were logged.

### 4. Generate the files mechanically

Sketch used on 2026-08-23 (adapt skip-words to the playbook’s non-car list):

```js
// capture JSON minus tracker IDs → queue → batches of 15 → pairs of 2
// write prompts/<run>-chats/NN-batches-A-B.txt with the mp.js item command inlined
```

Keep a `00-README.txt` index (next file, expected X, batch numbers) and a
`queue.json` freeze so you can prove which IDs were in which chat.

### 5. When not to use this

- **New capture / new grid cell.** That is still one capture chat, then triage.
  Workers only open pages from an already-merged feed.
- **Ask / Plan mode.** No Shell, so the prompt will spin.
- **Wrong repo.** `mp.js` and `captures/` are here, not in a sibling project.
- **Sweep C / URL setup.** Those need the playbook and a verified URL, not a
  frozen ID list.

### 6. After the last worker

Run `node validate.js` from `tools/marketplace-cdp`. If new Actives exist,
refresh Evidence Desk with `cd web && npm run data:build && npm run dev` in a
chat that is allowed to touch the web app. Do not put seller contact in any
of these prompts.
