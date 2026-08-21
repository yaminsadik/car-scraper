# Marketplace Search Checkpoint

Private cross-session state. Copy this file to `search_checkpoint.md` before
the first run; the destination is ignored by Git. Rules belong in
`used_car_buying_playbook.md`, not here.

## Current state

| Field | Value |
|---|---|
| Sweep model | Price slice × sort |
| Grid size | 4 price slices × 4 sorts = 16 checkpoints |
| Current cell | Not started |
| Listings in tracker | 0 |
| Last checkpoint date | — |

## The 16-checkpoint grid

| Price slice | `distance_ascend` | `vehicle_mileage_ascend` | `creation_time_descend` | `Suggested` |
|---|---|---|---|---|
| $4,000–$5,999 | Not started | Not started | Not started | Not started |
| $6,000–$7,499 | Not started | Not started | Not started | Not started |
| $7,500–$8,999 | Not started | Not started | Not started | Not started |
| $9,000–$10,500 | Not started | Not started | Not started | Not started |

`Suggested` is represented by omitting `sortBy`; the other columns use their
displayed value as the `sortBy` parameter.

## Maintenance sweep log

| Date run | Cards before stop | New listings | New candidates |
|---|---|---|---|

## Resume notes

- Read the playbook and tracker first.
- Resume a partially triaged cell before starting another.
- Confirm the search URL before the user scrolls.
- Checkpoint after every five listing opens.
- Run `node tools/marketplace-cdp/validate.js` before handoff.
