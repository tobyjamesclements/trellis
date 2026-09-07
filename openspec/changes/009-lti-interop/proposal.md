# Change: 009 LTI interoperability

## Why

The fastest route to learners is inside the LMSs institutions already run,
and the Moodle baseline requires hosting external tools. This change
delivers LTI 1.3 Core, NRPS, AGS, Deep Linking, Dynamic Registration and
Submission Review in both Platform and Tool roles, with the AGS write-back
emitter that embodies Known Tension §1.

## What Changes

- Platform role: OIDC login/auth endpoints, `id_token` issuance, tool
  registrations and deployments, service token endpoint, NRPS, AGS
  (lineitems, scores as facts, results), Deep Linking, Dynamic
  Registration, Caliper endpoint claim.
- Tool role: launch validation, context auto-binding with deterministic
  course ids, platform registrations, NRPS pull, lineitem creation, AGS
  write-back emitter with ledger-continued timestamps, Deep Linking
  response, Submission Review, Dynamic Registration.
- Interop status views and controls.

## Impact

- Consumes `effect.ready` intents of kind `ags_score` (007) and adds the
  intent producer in the fold (LTI-12).
- Adds `lti.launch.v1`, `lti.lineitem.v1` fact types to the registry.

## Requirements delivered

- LTI-01
- LTI-02
- LTI-03
- LTI-04
- LTI-05
- LTI-06
- LTI-07
- LTI-08
- LTI-09
- LTI-10
- LTI-11
- LTI-12
- LTI-13
- LTI-14
- LTI-15
- LTI-16
- LTI-17
- LTI-18
- LTI-19
- LTI-20

## Dependencies

003 (sessions, roles), 004 (structure placements), 006 (activities to
launch and grade), 007 (folds and intents), 008 (notifications for
failures). The Caliper endpoint claim points at 010's endpoint; until 010
ships the claim is omitted.

## Out of scope

Course Groups Service, Platform Notification Service (roadmap).
