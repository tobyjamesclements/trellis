# Change: 003 Identity and enrolment

## Why

Every fact needs an authenticated writer; every view needs cohort
membership; every interop surface needs roles. This change delivers IDE in
full: passwordless authentication in every region, stateless sessions,
deterministic principals for federated identities, enrolment and roles as
facts with region-local indexes, cap reconciliation with the instructor in
the loop, sub-cohort splitting, account merge, and the user directory.

## What Changes

- Auth endpoints: OIDC RP, magic link, token refresh, JWKS, revoke; Cognito
  SAML bridge per tenant in the home region.
- `authz` library used by every API function.
- Identity, profile, enrolment and role indexers; cohort members and count;
  directory index.
- `cap-reconcile` and `cohort-sync` workflows.
- Enrolment, roles, cohorts and directory APIs; consent prompts; device and
  session management UI.
- Identity modes on tenants (IDE-19) and the strict-organisation identity
  lifecycle (IDE-22); the consumer realm and soft organisations follow in
  change 013.

## Impact

- Unlocks FLS-10/11 full authorisation.
- Defines partitions (module, cohort) for views (008).
- Adds `E#`, `M#`, `RL#`, `RV#`, `IDX#`, `DIR#`, `CAP#`, `PR#` items.

## Requirements delivered

- IDE-01
- IDE-02
- IDE-03
- IDE-04
- IDE-05
- IDE-06
- IDE-07
- IDE-08
- IDE-09
- IDE-10
- IDE-11
- IDE-12
- IDE-13
- IDE-14
- IDE-15
- IDE-16
- IDE-17
- IDE-18
- IDE-19
- IDE-22

## Dependencies

001, 002. Notifications for reconciliation and merges use a minimal SES
sender until 009 delivers the gated emitter; the sender writes the sent
ledger from the start so 009 inherits it.

## Out of scope

LTI login (010), SIS import (011).
