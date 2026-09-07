## Context

IDE spec; ADR-009, ADR-015, ADR-021, ADR-022. No passwords; no global
uniqueness; authorisation from region-local derived state.

## Goals / Non-Goals

Goals: login in every region for OIDC and magic link; sessions verifiable
everywhere; deterministic ids for federated identities; hard-cap
reconciliation exactly as IDE-06; all indexes recomputable from facts.

Non-goals: native SAML; MFA (delegated to IdPs); social logins beyond OIDC.

## Decisions

- **Principal ids.** `usr_` + base32(SHA-256(issuer ‖ sub))[0:26] for
  OIDC/SAML/LTI/SIS; ULID for magic-link sign-ups.
- **Tokens.** ES256 with the zone asymmetric MRK; `kid` = key fact id.
  Session 12 h, refresh 30 d bound to `device_id`. JWKS endpoint reads
  `T#t#KEYS` (cached 5 min). Revocation cache `RV#` consulted per request
  (cached 60 s); a session is rejected if `iat < before_hlc` for its device.
- **Magic link.** Token = signed JWT `{ email_hash, jti, region, exp: 15m }`;
  verify signature anywhere; single-use by conditional put on `ML#<jti>`
  with TTL; if `region ≠ self` redirect to the issuing region unless
  unhealthy.
- **State routing.** OIDC `state` carries the issuing region; callbacks
  landing elsewhere redirect (ADR-021).
- **Cognito bridge.** One user pool per SAML tenant in the home region,
  configured as an OIDC provider to Trellis; identity facts record
  `issuer = cognito:<pool>`.
- **Indexers.** Subscribed to `fact.folded` with type filters; writes are
  CAS on item version; every index is rebuildable by a Distributed Map over
  subjects.
- **Cap reconciliation.** Triggered by `cap.exceeded` from the enrol indexer
  and hourly per over-cap cohort; the workflow's task-token wait is bounded
  at 24 h; decisions are `sys.reconcile.v1` facts written as the region
  system device in the home region; idempotent re-runs recompute over the
  union and never re-waitlist a promoted learner.
- **Sub-cohorts.** Placement reads `M#<cohort>#COUNT` for the course's
  sub-cohorts; creates `cohort.v1 {split}` when all are full. Deterministic
  sub-cohort ids `<cohort>#<n>` mean two regions creating `#3` concurrently
  create the same partition.
- **Merge.** Identity indexer detects two principals with the same verified
  claim; appends `merge.v1` (survivor = smallest ULID); the stream router's
  alias map (`AL#<alias>` → survivor) redirects partition routing; MVA
  recompute of affected partitions is requested by `merge.applied` event.
- **Directory.** Two-character prefix buckets for name and email hash;
  bounded 200 results per query.

## Risks / Trade-offs

- Deterministic ids leak nothing (hash of issuer and sub) but tie a
  principal to one identity; a learner who changes IdP gets a new principal
  and a merge.
- Cognito per tenant adds a console-managed resource outside CDK's
  fast path; provisioning workflow step.
- The 60 s authz cache makes revocation slightly slower than replication.

## Migration Plan

Greenfield. Test: concurrent first logins in two regions for a federated
user → one principal; for a magic-link user → two principals then a merge
within 5 minutes.

## Open Questions

- Whether observers need their own consent flow (assume tenant terms cover
  them).
