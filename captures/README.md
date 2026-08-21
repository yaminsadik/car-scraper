# Private capture workspace

This directory is generated locally and ignored by Git except for this file.
It may contain personal search history and seller-provided information, so raw
files should not be committed or attached to public issues.

## Layout

```text
captures/
├── feeds/      # objects written by `mp.js read --out`
├── items/      # arrays written by `mp.js item --out`
├── legacy/     # superseded/manual local captures
└── master.csv  # chronological, deduplicated feed index from `merge.js`
```

A feed capture contains URL and timestamp metadata plus a `listings` array.
An item capture is an array of listing-page records with `id`, `url`, `title`,
and page `text`. Keeping the two shapes in separate directories prevents item
pages from being mistaken for search-card passes.

`merge.js` reads only `feeds/` by default and writes `master.csv` here.
`validate.js` reads all three active data stores and the local tracker/checkpoint
without modifying them.

Delete captures only when you no longer need their audit trail. `master.csv`
can always be regenerated from the retained feed JSON files.
