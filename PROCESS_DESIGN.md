# Process Design — how to draw the whole pipeline before building any of it

**This file holds no buying criteria.** `used_car_buying_playbook.md` is still
the only place those live (see `CLAUDE.md`). This is a method document: how to
avoid discovering half your pipeline by walking into it, written up from what
this project got wrong. The story is in `DEV-JOURNAL.md`, 2026-08-27.

## The mistake, in one line

**Effort followed volume when it should have followed consequence.**

Six days went into the stage that processes ~2,400 listing cards. The stage that
processes the ~40 cars a human actually talks to was invented on day 7, after
the conversations had already started. The stage that decides whether a rebuilt
car is worth driving to — reading pre-repair auction photos — is still not a
stage at all.

That is not a scraping problem. It is what happens when you build the part of
the process that is *legible* instead of the part that is *decisive*.

## Why the legible stage always wins

A scraper announces itself as a thing to build. It is mechanical, high-volume,
and you can watch it working. A judgement stage — "decide whether this damage
touched a structural member," "decide whether this owner is actually ready to
sell" — does not feel like a system. It feels like something you will simply do
when the time comes. So it never gets a state, an owner, or a gate.

Then it becomes the bottleneck, because it was always where the decision was.

## The six-step pass

Do this before writing code. It is an afternoon, and it produces the pipeline.

### 1. Write the closing checklist first

What documents are physically on the table at the moment money changes hands?

For a car: title, bill of sale, VIN history report, pre-purchase inspection
report, cold-start video, pre-repair auction photos if the title is rebuilt.

Every item on that list is **an artifact someone has to hand you**. Every
artifact implies a stage that produces it, and a person who must be asked. Write
the list, then read it backwards — that *is* your pipeline, derived rather than
guessed. Anything you cannot name a producer for is a stage you have not thought
about yet.

This is the highest-yield step by a wide margin. It takes an hour and it is the
one that would have caught `deals/` on day one.

### 2. Write the state machine before the tooling

The most valuable thing this repo produced is not the scraper. It is:

```
queued → asked-price → asked-vin → has-vin → vin-checked → ready
       → scheduled → visited → closed
```

That list arrived on day 7. It costs an afternoon: a directory, one markdown
file per live thing, a `stage:` field in frontmatter. Write it on day one, while
it is still certainly wrong. A wrong state machine beats no state machine,
because a wrong one shows you which state is missing the moment something
refuses to fit in it.

Two properties worth copying:

- **Stages are computed, not claimed.** `ready` here is derived from §11's
  pre-visit table at run time and scaled to the car's distance band. Nothing is
  hardcoded, so changing the rule changes every deal at once.
- **A claim is not verification.** "No warning lights" in a seller's message is
  recorded as a claim and the chase continues. Any pipeline that accepts
  self-reported facts as satisfied requirements will lie to you at the exact
  moment it matters.

### 3. Separate the three tiers before there is data

Volume data, judged data, and relationship data have different write patterns and
must never share a file.

| Tier | Scale | Written by | Edited by hand |
|---|---|---|---|
| Raw capture | ~10,000s of rows | Machine, every pass | Never |
| Curated tracker | ~1,000s of rows | Judgement, one row per candidate | Yes |
| Deal / conversation file | ~10s of files | Prose, one file per live thread | Freely |

This project learned it by pain. `seen_listings.md` is now over a megabyte and
one table; changing a single cell means rewriting the whole file, and what a
seller said is prose, not a cell. `CLAUDE.md` had to grow an explicit rule
forbidding conversation state from living there.

The tell that you have this wrong: your screening table starts growing columns
named `next_action`, `status`, or `last_contacted`. Those are Tier 3 facts
squatting in a Tier 2 file.

### 4. List the irreversible spends, and gate each one

Enumerate every action that costs real money, real time, or an option you cannot
get back. For each, write down what must be true *before* you spend it.

Here the expensive actions are: driving 45 minutes each way, a $100–150
pre-purchase inspection, a $350–600 structural inspection on a rebuilt car, and
handing over cash. §11's distance-scaled pre-visit table is exactly such a gate —
the bar rises with the drive. It was written *after* trips had already been
wasted, which is the normal way this gets learned and the avoidable one.

A gate is not a checklist item. It is a condition the tooling can evaluate and
refuse on.

### 5. Decide filter vs. score on day one

A hard filter throws candidates away permanently and silently. A score keeps them
and ranks them down. Getting this backwards is expensive and hard to detect,
because what you lost never appears in your output.

This project had to retire `Rejected: distance` after using a hard filter on
something that should always have been a graded penalty — Hialeah, Miami, Boca
Raton and Aventura had been discarded on a criterion that was never binary.

**Hard caps only for genuinely binary things** (title status, an absolute price
ceiling). Everything else weights. When unsure, score it — a score can be
tightened into a filter later; a filter has already destroyed the evidence you
would need to loosen it.

### 6. Assume every external filter lies until you have tested it

§8 of the playbook exists because Facebook's Make and Body-style filters are
cosmetic: they populate the sidebar and change nothing about the results. That
cost a full run to discover, and a search designed around them wastes every run
after that.

Budget the first hour on any new data source to *test its filters* rather than
trust them, and write down which ones are real. Same for fields whose meaning you
assumed: verify what the platform means by a number before designing scoring
around it.

## The checklist, condensed

Before writing code for any multi-stage acquisition process:

- [ ] Closing checklist written — every artifact, and who hands it to you
- [ ] Pipeline derived backwards from that list, stages named
- [ ] State machine written down, even though it is wrong
- [ ] Three tiers separated, with different files and different write rules
- [ ] Irreversible spends enumerated, each with a gate in front of it
- [ ] Every criterion classified as filter or score, with filters justified
- [ ] Every external filter tested rather than trusted
- [ ] Named the stage where the *decision* is, not where the *volume* is — and
      checked that it got at least as much design as the high-volume one

## Where this went next

`~/developer/personal/bizaq/PROCESS-DESIGN.md` applies the same pass to the
business-acquisition project, which as of 2026-08-27 is at precisely the point
this repo was at on 2026-08-26: a strong discovery pipeline, 107 screened
candidates, and nowhere for a conversation to live the moment an owner replies.
