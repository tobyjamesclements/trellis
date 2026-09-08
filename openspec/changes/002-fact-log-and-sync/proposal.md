# Change: 002 Fact log and sync protocol

## Why

The grow-only fact set is the system of record; the sync protocol is the
only way learner work enters it. Every capability after this one appends
facts through the ingest library or consumes them from the stream. This
change delivers FLS in full except cross-region anti-entropy (FLS-14), which
needs the Merkle summaries maintained by the view updater and ships with
change 008.

## What Changes

- Fact envelope, canonical encoding, `fact_id`, hash-chained per-stream
  sequences, void semantics, fact type registry and schema validation.
- `POST /sync/v1`: push with idempotent conditional puts, HLC stamping,
  lateness stamping from the deadline index, authorisation of writer and
  subject, pull by vector from rosters, pagination, advice (register,
  refork, denied, abandon).
- Blob presign with SHA-256 checksum enforcement; `body_ref` handling.
- Throttle overflow queue and drain.
- Stream router (filtered, batched) → SQS FIFO `roster` and `views` groups.
- Roster updater: HWM, pending, chain verification, forks, abandonment
  facts after 30 days.
- Envelope encryption on ingest with per-subject data keys.
- Fact export to Parquet (monthly and on demand).
- Device SDK for the PWA: local log with durable seq allocation, sync agent,
  vector bookkeeping, gap fill, region failover.
- `am.change.v1` fact type for Automerge document scopes (FLS-21).

## Impact

- New services: `sync-api`, `blob-presign`, `ingest-drain`, `stream-router`,
  `roster-updater`, `fact-export`.
- New `derived` items: rosters, deadline index, queue shadow.
- Defines the event `fact.folded` on the regional bus.

## Requirements delivered

- FLS-01
- FLS-02
- FLS-03
- FLS-04
- FLS-05
- FLS-06
- FLS-07
- FLS-08
- FLS-09
- FLS-10
- FLS-11
- FLS-12
- FLS-13
- FLS-15
- FLS-16
- FLS-17
- FLS-18
- FLS-19
- FLS-20
- FLS-21

## Dependencies

001. Authorisation checks in FLS-10/11 use IDE-09's role index; until 003
ships, the sync endpoint authorises only `subject = session principal`.

## Out of scope

FLS-14 (change 008). Any derivation.
