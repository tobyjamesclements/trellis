## Context

FLS spec; ADR-002, ADR-003, ADR-008, ADR-010, ADR-014, ADR-022. The design
must make version vectors a proof (dense per-stream seqs), keep every
global-table item immutable or region-owned, and never reject learner work.

## Goals / Non-Goals

Goals: correct idempotent ingest under retries and region switches; HWM
semantics exactly as FLS-09; sync round trip p50 < 150 ms warm; device SDK
that never loses a fact once written locally.

Non-goals: views (008), anti-entropy (008), CBOR content negotiation
(JSON first; CBOR later change), signed facts (device signatures deferred).

## Decisions

- **Canonical encoding.** Deterministic CBOR (RFC 8949 §4.2.1: sorted keys,
  shortest ints, no indefinite lengths). `fact_id` = `f_` + base32-lower of
  the first 130 bits of SHA-256. Both language libraries share the vector
  suite from change 001.
- **Sequence allocation on device.** IndexedDB transaction: read counter
  for `(subject, scope)`, increment, write fact with `seq` and `prev`, commit.
  Counter and fact are in the same object store transaction.
- **Ingest algorithm per fact.** Validate schema for known types; recompute
  hash; check writer = session principal and subject authority; resolve
  data key (cache); encrypt body; stamp envelope (HLC, region, lateness from
  deadline index, skew); conditional put; classify result (stored |
  duplicate | seq_conflict). Batch facts in `BatchWriteItem` where no
  condition is needed? No: conditions require `PutItem`; 100 puts per call
  are parallelised (10 concurrent) inside the Lambda.
- **Lateness stamp.** Deadline index items are read once per `(scope,
  item)` per call and cached in memory for 60 s.
- **Throttle overflow.** On `ProvisionedThroughputExceededException` or
  `ThrottlingException` after one retry, the stamped fact is enqueued to
  the regional SQS standard `ingest-overflow` queue; the response marks it
  `queued`. The drain Lambda uses the same conditional put.
- **Router.** Event source mapping with filter `dynamodb.Keys.SK.S begins_with F#`,
  batch 100, window 1 s, parallelization 4, bisect on error, DLQ. Dedupe by
  `fact_id` within batch. Two `SendMessageBatch` calls per batch: roster
  group `(tenant, subject, scope)`, view group per partition from the
  enrolment index (cached; for subjects with no enrolment, the view message
  is skipped and the fact is picked up by the enrolment fold later).
- **Roster updater.** Per message: load roster item (strongly consistent
  read), apply HWM logic, verify chain, write with CAS on `version`; on
  conflict re-read and retry (bounded). Abandonment scan is a daily
  Scheduler job over rosters with `pending` older than 30 days; it appends
  `sys.abandon.v1` through the ingest library as the region system device.
- **Pull planning.** For each pull request: read roster; compute streams
  where `hwm > vector[stream]`; issue range queries bounded by `limit`;
  encode continuation as `(subject, scope, stream, seq)`. Cohort pulls
  iterate members from `M#<cohort>`.
- **Encryption.** `dk_id` selection: lowest `dk_id` visible for the subject;
  create one if none. Plaintext keys cached ≤ 5 min per execution environment.
- **Export.** DynamoDB export to S3 (full monthly; incremental where the
  account supports it) → Step Functions Express → Lambda transform to
  Parquet by `tenant/scope/month`; manifest with per-partition vector
  summaries read from headers (available after 008; until then the
  manifest carries fact counts only).

## Risks / Trade-offs

- 100 conditional puts per call at 1024 MB: ~120 ms warm; acceptable.
- Rosters with many instructor streams (large cohorts, many markers) can
  exceed 20 streams; overflow items per stream (FLS §DynamoDB) handle it.
- The device SDK's durability depends on the browser's IndexedDB
  guarantees; Safari's eviction policy requires the `persistent` storage
  permission request (ACT covers UX).

## Migration Plan

Greenfield. Load test: 2,000 simulated devices × 20 facts within 60 s in one
region; assert zero rejected, throttled facts queued and drained, rosters
converge in both regions.

## Open Questions

- Whether to add `GSI-FactId` for support tooling (currently no consumer
  needs it).
