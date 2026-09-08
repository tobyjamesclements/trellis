## Context

CAC spec; ADR-002, ADR-006, ADR-016, ADR-017. Structure is an op log; keys
are versions; publishing is two-phase; nothing locks.

## Goals / Non-Goals

Goals: editors never lose work; publishes are reproducible from facts;
bundles let a device work offline for a module; time-lock and server-only
keys never reach a device early.

Non-goals: real-time collaborative text editing (CRDT deferred); hosted
video.

## Decisions

- **Ordering keys.** Fractional base-62 order keys between siblings;
  `move_node` writes a new key; ties broken by `(sync_hlc, fact_id)`.
- **LWW fold.** `struct-updater` applies ops in `(sync_hlc, fact_id)` order
  per node; `set_prop` keeps the greatest; `remove_node` and a later
  `add_node` re-add; history keeps the last 200 ops per node.
- **Two-phase publish.** `publish-prepare` is pure over the snapshot at the
  editor's vector: extracts key documents, computes `key_version`,
  classifies marking against the engine profile, encrypts `time_locked`
  keys under per-(item, cohort) release keys, builds bundle manifests and
  the search index, runs accessibility checks, writes everything to S3 by
  hash and returns hashes; the editor device then appends `key.v1`,
  `rubric.v1` and `publish.v1` from its own stream so seq allocation stays
  with the writer.
- **Current publish.** `PUB#<sync_hlc>#<fact_id>` items; the latest is
  current; a publish whose vector does not dominate the previous current's
  vector is flagged `conflict` and the losing editor is notified (COM) with
  a one-click republish at the union vector.
- **DeliveryView.** Per (course, cohort): bundle hash, deadlines, policy
  version, time-lock reveal HLCs. Read once per learner session; the sync
  response's `advice.bundles` points devices at new bundles.
- **Key release.** `POST /keys/release` checks enrolment and the region
  clock against `reveal_hlc`; returns the plaintext release key; caches KMS
  decrypts per (item, cohort).
- **Content access.** CloudFront signed cookies scoped to the tenant; blob
  hashes are disclosed only through authorised manifests.
- **Search index.** Per-course inverted index blob (compact JSON) rebuilt
  at prepare; the client library searches offline.
- **Copy/template.** Step Functions Standard replays the published snapshot
  as new ops under a dedicated writer device with seqs held in state; paced
  at 500 facts/s per course.

## Risks / Trade-offs

- Snapshot fold of a 500-node course from scratch is ~10k ops; fine.
- Prepare for very large courses may exceed the 15-minute Lambda limit:
  routed to Step Functions Express above 1,000 nodes.
- Time-lock release depends on clock agreement between regions (seconds).

## Migration Plan

Greenfield. Tests: concurrent edits from two regions converge to the same
snapshot; publish conflict scenario; bundle prefetch and offline render;
time-lock key never present in a bundle before reveal (automated check of
manifests).

## Open Questions

- Whether `after_submit` should be removed as an option to avoid false
  expectations (kept, with explicit copy, for Moodle parity).
