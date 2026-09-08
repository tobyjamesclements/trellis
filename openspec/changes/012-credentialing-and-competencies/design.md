## Context

CRD spec; ADR-009, ADR-012, ADR-022. Issuance is a side effect; mastery is
non-monotone; status lists are derived.

## Goals / Non-Goals

Goals: credentials that verify anywhere; no double issuance except during
a flip, and then with identical ids; revocation as the apology path;
mastery views with visible vectors.

Non-goals: accepting external badges; Data Integrity proofs in the first
release (VC-JWT only).

## Decisions

- **Signing.** ES256 through KMS `Sign` with the zone asymmetric MRK;
  `kid` from `T#t#KEYS`; `did:web` document lists all active and
  verify-only keys; verification endpoint resolves keys from the registry
  cache.
- **Credential id.** `urn:uuid:` v5 over `(issuer DID ‖ achievement id ‖
  subject ‖ award fact_id)`; the award fact is the idempotency root.
- **Issuance workflow.** `award.v1` (rule-based awards are appended only
  after the MVA intent fires; manual awards immediately) → Step Functions
  Standard in the home region: wait 24 h (rule) or 0 (manual, tenant
  policy), re-check the predicate at a dominating vector, build the VC,
  sign, store blob, append `issue.v1`, ledger, notify.
- **Status lists.** Per issuer, a bitstring where each credential has an
  index assigned at issuance (recorded in `issue.v1`); the list blob is
  rebuilt by a region-local job from `revoke.v1` facts and published at a
  stable URL from every region.
- **OB 3.0 API.** Authorization server pieces (authorize with consent,
  token, dynamic registration) reuse IDE-03 signing; resource endpoints
  read the backpack index.
- **Backpack.** `BP#<subject>` derived items with credential blobs,
  status, share links (capability tokens with revocation facts).
- **Duplicates.** Same award fact → same id → identical VC except
  signature bytes; the ledger records both; the backpack shows one. Two
  award facts for one achievement → the later is revoked as superseded
  with a learner-facing note.

## Risks / Trade-offs

- 24 h window delays badges; tenant policy may shorten to ≥ 1 h for
  rule-based awards.
- Status list lag between regions (seconds) is documented.
- CASE providers vary in REST conformance; JSON upload is the fallback.

## Migration Plan

Greenfield. Conformance: OB 3.0 issuer test suite; CLR 2.0 issuer; CASE
consumer. Flip test: issue during a home-region flip; assert one id, ≤ 2
emails.

## Open Questions

- Whether learners may self-issue CLRs on demand without instructor
  involvement (default yes, tenant policy).
