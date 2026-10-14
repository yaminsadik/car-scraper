---
listing_id: 0000000000000000
vehicle: 0000 Make Model Trim
url: https://www.facebook.com/marketplace/item/0000000000000000/
price: —
effective_cash_price: —
mileage: —
title_status: —
location: —
band: —
seller: —
stage: queued
next_action: send §11 price-verification message
next_action_date: —
vin: —
vin_report: —
thread_key: —
photos_seen: —
photos_reviewed: —
dashboard: —
coldstart_video: —
odometer_photo: —
title_confirmed: —
price_confirmed: —
appointment: —
appointment_place: —
outcome: —
first_contact: —
updated: —
---

# 0000 Make Model Trim — $0,000

Tier 3 of the log (playbook §12). One file per conversation with a seller.
Don't copy this by hand — `node mp.js deal open <listing id>` seeds it from the
`seen_listings.md` row and from the listing description already in `captures/`.

`stage` moves through: `queued` → `asked-price` → `asked-vin` → `has-vin` →
`vin-checked` → `ready` → `scheduled` → `visited` → `closed`. `ready` is
computed from §11's pre-visit table for this car's `band`, not claimed —
`node mp.js deal due` reports the gap.

`thread_key` binds this deal to one Marketplace conversation. Facebook puts no
listing ID in the inbox, so the binding is confirmed by hand once
(`node mp.js deal thread <id> "<name>|<listing>"`) and reused forever after.

## Listing description

_The seller's own words, copied here because listings get edited and deleted._

## VIN & history

_The 17-character VIN, what it decoded to, and what the history report showed._
_§11: a partial VIN or a refusal means don't schedule._

## Photos

_What the dashboard photo showed — engine running, in Park, odometer and_
_warning-light area visible. A seller's "no warning lights" in a message is a_
_claim, not verification._

_`photos_seen` is how many images `node mp.js thread` has pulled out of the_
_conversation; `photos_reviewed` is how many a human has actually looked at._
_While they differ the deal reads BLOCKED on the board — the tool can tell an_
_image arrived and that nobody read it, and it cannot read it itself._
_`node mp.js deal note <id> photos "…"` clears the gap._

## Appointment

_When, where, and what you agreed. §11: public place, daylight, bring someone,_
_never send money before seeing the car._

## Timeline

- YYYY-MM-DD — what happened.
