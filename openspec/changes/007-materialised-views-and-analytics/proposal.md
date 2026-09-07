# Change: 007 Materialised views and analytics

## Why

Instructors need cohort views, learners need progress, interop needs derived
results, and at-risk alerts need a safe trigger. This change delivers the
region-owned view updater with the version vector as cursor, headers and
rows, per-item statistics, non-monotone recompute, stability-window
intents, freshness and dominance APIs, generation-based recompute, the
verifier, analytics rollups, staleness telemetry, erasure fan-out, and the
Merkle summaries that make cross-region anti-entropy (FLS-14) possible.

## What Changes

- `view-updater` (Rust) consuming SQS FIFO `views` with HWM-cursor folding,
  pending stashes, CAS writes, Merkle node updates, `view.updated` events.
- `nm-recompute`, `intent-evaluator`, `partition-recompute`,
  `view-verifier`, `analytics-rollup`, `anti-entropy`.
- `view-api`: cohort and course gradebooks, learner progress, dominance,
  freshest-across-regions, explain links, consistent reads.
- At-risk rule evaluation and cool-down.
- Subject → partitions index and erasure recompute.

## Impact

- Consumes 005's `fold`/`derive`.
- Emits `view.updated`, `effect.ready`, `version.changed` handling.
- First user-visible instructor surface.

## Requirements delivered

- MVA-01
- MVA-02
- MVA-03
- MVA-04
- MVA-05
- MVA-06
- MVA-07
- MVA-08
- MVA-09
- MVA-10
- MVA-11
- MVA-12
- MVA-13
- MVA-14
- MVA-15
- MVA-16
- MVA-17
- MVA-18
- FLS-14

## Dependencies

002, 003, 004, 005. Activities (006) produce the facts the views fold;
views can be verified with synthetic facts before 006.

## Out of scope

Emitters that consume `effect.ready` (008, 009, 010, 011).
