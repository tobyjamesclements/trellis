## Context

DIO spec and `caliper-mapping.md`; ADR-012, ADR-018. Inbound as facts;
outbound from the home region with monotone times and an epoch.

## Goals / Non-Goals

Goals: certification-ready OneRoster consumer/provider and Caliper sensor;
idempotent imports; correct epoch behaviour on failover.

Non-goals: serving deltas from every region.

## Decisions

- **OneRoster ids.** SIS-originated entities keep their `sourcedId`; Trellis
  entities use `tr_` + hash. The mapping table `OR#<entity>` stores both
  directions.
- **Change log for deltas.** `ORD#<entity>#HDR` region-local counter with
  atomic ADD; each folded change writes `C#<seq>` → `sourcedId`; the
  provider translates `filter=dateLastModified>t` into a scan of `C#` items
  with `folded_at > t` (bounded by the 90-day prune) so the time filter is
  honoured exactly in this region.
- **Results view.** Rebuilt per LearnerRow change from `view.updated`
  payloads (which include changed subjects) rather than full rescans.
- **Push emitter.** Same shape as the AGS emitter (009): home-region check,
  ledger-continued `dateLastModified`, stop-and-reconcile on lock responses.
- **Caliper projector.** Runs in every region (cheap, deterministic) so a
  flip needs no backfill; only the home region's emitter sends. Envelope
  assembly in a Rust function; JSON-LD contexts embedded; batching by
  `(tenant, 30 s window, 100 events)`. GradeEvents from `effect.ready`
  kind `caliper_grade` produced by the intent evaluator (007).
- **Caliper endpoint.** Bearer tokens from DIO-19; actor resolution by
  pairwise `sub` mapping (`CALMAP#`) populated on LTI launches (009).
- **CC import.** Step Functions Standard: `unzip` (Lambda with 10 GB
  ephemeral), `parse manifest`, Distributed Map over resources (blobs,
  links, forums, LTI links, QTI conversion), then structure ops in a paced
  loop, then report. `import_id` prevents duplicates; per-resource ops are
  keyed by `(import_id, resource identifier)`.
- **QTI conversion.** 1.2 → 3.0 mapping table with explicit lossy list;
  3.0 → 1.2.1 for export with degradations reported.
- **Webhooks.** Subscriptions as facts; deliveries via the emitter pattern;
  signature `X-Trellis-Signature: sha256=<hmac>` over body with the
  subscription secret from SSM.
- **Epoch.** Registry field `epoch` per tenant, bumped by 012's failover
  workflow; providers read it from the registry cache.

## Risks / Trade-offs

- SIS products differ in OneRoster conformance; the pull workflow has
  per-connection quirks configuration (page size, filter support).
- CC cartridges up to 2 GB take minutes; Step Functions Standard handles
  the wait.

## Migration Plan

Greenfield. Certification runs for OneRoster and Caliper; import the 1EdTech
CC sample cartridges; failover test for epoch behaviour with a mock SIS.

## Open Questions

- Whether to expose the vector digest as an official delta cursor
  extension (Known Tension option D) in the first release.
