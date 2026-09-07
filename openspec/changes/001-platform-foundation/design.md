## Context

The architecture is fixed by project.md §3 and ADR-001, ADR-003, ADR-004,
ADR-013, ADR-014, ADR-017, ADR-020, ADR-021, ADR-022. This change turns
those decisions into deployable infrastructure and verifies the one
empirical assumption they rest on.

## Goals / Non-Goals

Goals: reproducible multi-region deployment of the substrate; the streams
spike answered; shared libraries with the exact key, HLC, hashing and
encryption semantics of FLS; a provisioned test tenant in each zone; cost
tags and budget alarms from day one.

Non-goals: any domain behaviour; performance tuning beyond SnapStart
defaults; WAF (optional, costed in ADM-15, decided later).

## Decisions

- **CDK, one app per zone.** A zone app takes the region list and deploys
  identical regional stacks plus the global-table replica configuration. The
  registry is its own app deployed to the union of all zone regions.
- **Table definitions.** `facts`: PK/SK strings, on-demand, PITR on, stream
  NEW_AND_OLD_IMAGES, no GSI, no LSI, deletion protection on. `derived`:
  PK/SK strings, on-demand, TTL on `ttl`, no PITR, no stream (EventBridge
  events come from updaters, not streams). `registry`: PK/SK, PITR on.
- **Streams spike protocol.** A Lambda in each region subscribes to its
  `facts` stream and writes observed `(fact_id, eventName, region)` to
  `derived`. A test writes 1,000 items in A and 1,000 in B and asserts both
  regions observe 2,000 INSERTs within 60 s. Result recorded in
  `openspec/changes/001-platform-foundation/spike-streams.md`. If negative:
  the router in each region publishes `fact.ingested` to the peer regions'
  EventBridge buses (cross-region event bus targets) and ADR-014 is amended.
- **Key material.** One symmetric MRK per zone for data keys; one asymmetric
  ECC P-256 MRK per zone for signing (sessions, LTI, credentials) with `kid`
  facts registered by the provisioning workflow. Per-tenant keys are not
  created by default (ADM-15 costs both).
- **Edge.** Route 53 latency records → regional HTTP API custom domains
  (ACM certificates per region) with health checks on `/health` (which reads
  the region's `derived` table and the registry). TTL 60 s.
- **Blob buckets.** Versioning off, SSE-KMS with the zone MRK, replication
  both ways with RTC off (cost), lifecycle rules for `tmp/` uploads.
  CloudFront origin group per zone with failover on 403/404/5xx.
- **Shared libraries.** Java: `trellis-core` (keys, HLC, CBOR, hashing,
  crypto, registry cache, logging). Rust: `trellis-core-rs` with the same
  test vectors; the two must agree on `fact_id` for the shared vector suite.
- **Provisioning workflow.** Steps: validate hostname; write registry
  items; create Route 53 records; request ACM certificate (DNS validation);
  create tenant `tenant.v1` facts and default policies; generate signing
  `kid` facts; provision S3 prefixes; emit `tenant.provisioned`. The
  workflow is the only writer of the registry.

## Risks / Trade-offs

- If the streams spike is negative the router design changes (cross-region
  EventBridge, ~$1/M events, and a second delivery path to make idempotent).
  This is why the spike is the first task.
- SnapStart on arm64 may not be available for Java at build time; the
  pipeline parameterises architecture per function.
- Global table creation order and replica addition are slow (minutes) and
  not idempotent in all CDK versions; the pipeline retries.

## Migration Plan

Greenfield. Deploy `eu` zone first (two regions), then registry, then a
test tenant. Game-day: kill one region's API (health check fails) and
confirm DNS failover within 2 minutes.

## Open Questions

- arm64 SnapStart availability for Java 21 at build time.
- Whether the registry needs a third replica region outside both zones for
  operator-plane availability (cost: negligible; decide during 012).
