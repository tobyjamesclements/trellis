## Context

ADM spec; ADR-003, ADR-007, ADR-012, ADR-013, ADR-020, ADR-022. Terminal
operations are idempotent and swept; failover is a registry flip.

## Goals / Non-Goals

Goals: failover in minutes with a bounded double-emission window; erasure
provably complete across regions and backups; every admin action audited;
budgets that cannot harm learners.

Non-goals: self-service billing; cross-zone tenant moves.

## Decisions

- **Failover workflow.** Preconditions: target region healthy and its fold
  lag under threshold. Steps: mark old home `draining` (registry, if
  reachable), wait ≤ 60 s for its outbox drain, write new home region and
  `epoch + 1`, wait for registry replication (poll from target), enable
  emitters (they read the registry cache; TTL 60 s), audit fact, notify
  tenant admins. Rollback is the same workflow reversed.
- **Erasure workflow.** Append `erasure.v1` → delete `DK#` items in every
  region (each region's Lambda deletes its local copies; replication
  propagates) → delete blobs in every bucket → request MVA-15 recompute →
  wait 24 h → sweep for late `DK#` items and blobs → verify with cross-
  region reads → physical deletion of the subject's fact items (optional
  policy) → audit fact.
- **Shred.** Per-region overwrite of `body` with `{shredded: true,
  by, at}`; blob deletion; anti-entropy repair honours the marker (007
  task 4.2); re-run after the replication window.
- **Restore by re-union.** PITR restore to a scratch table → Distributed
  Map over items → idempotent put into the live table (skipping subjects
  with erasure facts and facts with shred facts) → anti-entropy run →
  report.
- **Retention.** `retention.v1` per tenant with per-subject inactivity
  rules; monthly sweeper appends `erasure.v1` for expired subjects after a
  notification period; per-course retention voids and deletes blobs only.
- **Consent.** `consent.v1` per purpose; resolvers read the derived consent
  item; Caliper emission, analytics rollups and observer digests consult
  it.
- **Break-glass.** Time-boxed IAM session via a Step Functions approval
  with two operators; every read is logged as an audit fact.
- **Budgets.** AWS Budgets per tenant tag → EventBridge → flag facts that
  reduce analytics cadence, digest frequency and anti-entropy frequency;
  never sync, folds or marking.

## Risks / Trade-offs

- Failover during a replication partition cannot consult the old region's
  ledger; the double-emission window grows to the partition's length for
  effects generated during it. Documented.
- Physical deletion after erasure trades the tombstone risk for a smaller
  residual; the sweep re-runs quarterly.

## Migration Plan

Greenfield. Game days: regional API failure; home-region failover with
in-flight AGS backlog; erasure end-to-end verification; PITR re-union
drill.

## Open Questions

- Whether the registry gets a third replica outside both zones (cheap;
  likely yes).
