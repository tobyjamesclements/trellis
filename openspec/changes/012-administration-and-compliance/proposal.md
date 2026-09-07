# Change: 012 Administration console and compliance

## Why

A multi-tenant service needs an operator plane that respects the model:
failover that flips the home region and bumps the epoch, restore that
re-unions facts, erasure that destroys keys, takedown that shreds a body,
retention and consent as facts, audited break-glass, budgets that never
throttle learner work, and game days that measure RPO and RTO. This change
completes ADM.

## What Changes

- Home-region failover workflow with epoch bump, outbox drain and ledger
  consultation; runbooks and quarterly game days.
- Admin console: directory, catalogue, integrations, policy defaults,
  reports, audit trail; operator roles and break-glass.
- Erasure, takedown (shred), tenant deletion, retention sweeper, consent
  resolution, decrypted export authorisation.
- Backup verification and restore-by-re-union tooling.
- Cost governance: allocation tags, cost-per-active-learner rollup,
  budgets with non-essential throttling, anomaly alarms.
- Tenant isolation hardening: leading-key IAM conditions, per-tenant rate
  limits, optional WAF.

## Impact

- Consumes `erasure.v1`, `retention.v1`, `consent.v1`, `audit.v1`,
  `tenant.v1` facts.
- Touches every capability's derived state through recompute and sweeps.

## Requirements delivered

- ADM-03
- ADM-04
- ADM-06
- ADM-07
- ADM-09
- ADM-10
- ADM-11
- ADM-12
- ADM-13
- ADM-14
- ADM-15
- ADM-16
- ADM-17
- ADM-20

## Dependencies

All previous changes; failover depends on every emitter honouring the
home-region check (008, 009, 010, 011).

## Out of scope

New product features; a self-service tenant sign-up flow (operator
provisioning only in the initial build).
