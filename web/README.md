# Evidence Desk

Static used-car review frontend for the repository's Marketplace evidence snapshots. The approved-brand snapshot and German exploratory sweep stay separate in the interface and in the generated data.

## Run the demo

A fresh clone has no private captures. `demo/` holds a small synthetic copy of the same
four inputs — every listing, ID and price in it is invented — so the whole pipeline runs
without a Marketplace account:

```bash
npm ci
npm run data:demo   # build public/data from demo/, then run the snapshot scan
npm run dev
```

`data:demo` refuses to run when real captures are present, because it would overwrite
their snapshot.

## Refresh the listings

1. Replace or refresh `../captures/master.csv` and update `../seen_listings.md` as usual.
2. For the German section, refresh `../captures/german_brands.csv` and `../german_seen_listings.md`.
3. Run `npm run data:build` from this folder.
4. Review the refreshed app with `npm run dev`.

The builder reads buying rules and distance bands from `../used_car_buying_playbook.md`, then writes both sanitized collections to `public/data/`. Only rows marked `Candidate` in the German capture appear in the German section.

`data:build` prints the headline counts and the size of each payload, so a refresh that
changed nothing is visible. It fails rather than falling back if only *some* private
sources are present, because a partial set would silently republish stale data.

It also reports any scored listing whose points cannot be reconciled with playbook §5.
Those are tracker rows worth re-checking, not app bugs.

### What reaches the browser

Seller fingerprints, VIN values, evaluation notes, and raw listing text are excluded.
Seller-written card titles are stripped of phone numbers, contact pitches, and email
addresses before publishing, and quoted fragments of seller descriptions are removed
from the tracker-derived fields.

`npm run data:scan` enforces this and runs automatically as part of `npm run build`. It
fails the build on any phone number, email address, contact solicitation, VIN, or
forbidden field. Never publish a snapshot that has not passed it.

## Build and deploy

- Production build: `npm run build` (data build, snapshot scan, Vite build, Sites packaging)
- Static output: `dist/client`
- Vercel project root: `web`

`vercel.json` points Vercel at the build command and output directory. A remote build has
no private captures, so it reuses the committed snapshot. In this repository that is the
synthetic demo snapshot; a real search keeps its snapshot in a private repository and runs
`npm run data:build` locally whenever either collection changes.

The snapshot is fetched as a static asset rather than bundled, so listing data is cached
separately from the app code and never enters the JavaScript chunk. It is split in two:
`evidence-core.json` covers every view except "All listings", which lazily fetches
`evidence-rest.json`.

Deploying a real snapshot makes its listing IDs, Marketplace URLs, prices and cities
reachable by anyone with the site URL. The site sends `noindex` and ships a disallow-all
`robots.txt`, but that only discourages crawlers — it is not access control. Put access
protection in front of a real deployment.
