# Private archive

This directory holds superseded local checkpoints, trackers, manual captures,
and review notes. Its contents are ignored by Git because historical files can
contain the same seller and search data as the active private workspace.

Nothing in this directory is consulted during a normal run:

- rules come from `used_car_buying_playbook.md`;
- current progress comes from `search_checkpoint.md`;
- current deduplication comes from `seen_listings.md` and
  `captures/master.csv`.

Keep old files only when their audit history is useful. Durable lessons—such as
a confirmed filter failure or seller-pattern warning—belong in the playbook,
without retaining unnecessary personal data in public source control.
