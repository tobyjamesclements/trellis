## Context

MVA spec; ADR-004, ADR-010, ADR-011, ADR-012, ADR-014, ADR-019. Views are
regional, vector-stamped, recomputable; non-monotone results are never
merged; side effects wait.

## Goals / Non-Goals

Goals: fold latency p50 < 2 s from ingest to row; batch coalescing; exact
dominance; byte-identical recompute; Merkle maintenance in the fold; anti-
entropy hourly.

Non-goals: cross-region view replication; real-time push of view changes
to browsers (polling with dominance is enough initially).

## Decisions

- **Fold loop.** Per FIFO batch (one partition): load header (strong read),
  load touched rows, apply facts in seq order per stream with HWM logic,
  call engine `fold` for monotone aggregates or `derive` for voids, write
  rows and item rows with CAS, update Merkle leaf/level/root nodes, write
  header with CAS and new `vector_digest`, publish `view.updated`. On any
  CAS failure the batch is retried from the start (idempotent by HWM).
- **Row layout.** Item summaries compressed (CBOR) in the row; rows over
  350 KB split into `L#<subject>#<k>` continuation items (rare).
- **Vector digest.** Additive digest over `(stream_id_hash, hwm)` pairs;
  updated incrementally as HWMs advance (subtract old, add new).
- **Merkle.** Leaf = 3-hex-prefix bucket; nodes stored as items with child
  digests; batched per fold.
- **NM recompute.** `view.updated` → SQS delay 30 s (debounce by dedupe id
  = partition + minute) → read all rows (paginated) → compute rank,
  percentile, at-risk, mastery → write `NM#` items with the header's
  digest → create/update `SideEffectIntent`s.
- **Intents.** Stored with `decided_at_vector` (digest + per-subject
  cursors), `window`, `expires`; scheduled via delay queue (≤ 15 min) or
  Step Functions Wait (longer). Evaluator re-reads the row and header,
  checks dominance and predicate and "no facts for subject in last W", then
  publishes `effect.ready` or drops.
- **Generations.** `partition-recompute` Distributed Map writes `G#<n+1>`
  rows; the header flips when the map completes; a janitor deletes `G#<n>`
  rows lazily. Readers always use the header's generation.
- **Anti-entropy.** Scheduler → per-partition run: read local root, read
  peer root via cross-region DynamoDB endpoint (IAM role assumable across
  regions), descend, pull members, put missing facts through the ingest
  library's repair path (unconditional put, skip if local copy shredded).
- **Verifier.** Daily 1% sample; recompute at the header's vector into a
  scratch generation; compare; alarm and swap on mismatch.
- **APIs.** Pagination 200 rows; `freshness` block on every response;
  `?consistent=true`; `?freshest=true` reads peer headers.

## Risks / Trade-offs

- Cross-region reads for anti-entropy and `freshest` cost latency
  (~100 ms) and require cross-region IAM; acceptable at hourly cadence.
- Very large NM payloads (2,000-learner rank list) are ~200 KB; read on
  demand only.
- The debounce means NM results lag the header by ≥ 30 s; shown in the
  freshness block.

## Migration Plan

Greenfield. Verification: synthetic fact generator for 100 partitions;
assert fold == recompute; assert dominance API answers match roster HWMs;
kill replication (simulate) and confirm anti-entropy repairs.

## Open Questions

- Whether learners' own rows should be pushed to devices via sync pull
  (candidate: a `derived` pull channel in a later change).
