## Context

LTI spec; ADR-012, ADR-018, ADR-021. Stateless where possible; deterministic
identifiers; single-writer egress.

## Goals / Non-Goals

Goals: pass 1EdTech certification suites for both roles; write-back that is
correct under failover; launches served from every region.

Non-goals: LTI 1.1 compatibility beyond claim pass-through.

## Decisions

- **Message signing.** `id_token` signed with the zone asymmetric MRK via
  KMS `Sign` (ES256); `kid` from the key registry; JWKS from `T#t#KEYS`.
- **Nonce/state.** `state` = signed JWT with `region`, `nonce`, `link`,
  `exp: 10 min`; `NONCE#` conditional put on redemption; wrong-region
  callbacks redirected with 307 (POST preserved).
- **Tool-role context binding.** Deployment policy `auto_bind_context`
  (default on): first launch appends structure facts creating the course
  with the deterministic id; the instructor role from the launch grants
  editing. Both regions may append equivalent creation facts; the derived
  structure folds both.
- **Write-back emitter.** SQS consumer in every region; each message checks
  `home_region == self` (registry cache) and otherwise returns the message
  to the queue with a 60 s delay (so a flip picks it up). Timestamp
  continuation reads `LEDGER#<r>#ags#<shard>` for every region in the zone
  (N GetItems by the last-known key). Retry policy: `429` honour
  `Retry-After`; `5xx` exponential backoff up to 24 h; other `4xx` stop
  and raise `interop.reconciliation`.
- **Results (platform).** `GET /results` queries `ext.score` facts for the
  lineitem's activity per user (strongly consistent) rather than a derived
  row, to guarantee read-your-writes within the region.
- **NRPS differences.** `C#<seq>` change log per context written by the
  enrol indexer (region-local atomic ADD on `HDR`); cursor = base64 of
  `(epoch, region, seq)`.
- **Dynamic registration.** Pending registrations are facts; activation is a
  superseding fact by an admin; the platform-configuration document lists
  supported messages, variables and scopes.
- **Privacy.** Pairwise `sub` HMAC key per tenant in the key registry.

## Risks / Trade-offs

- Certification suites expect some rejections (e.g. invalid nonce) that
  Trellis implements per region; documented.
- Tool-role launch cold start is user-visible; measured in canary; Rust
  rewrite path per ADR-001.

## Migration Plan

Greenfield. Test against the 1EdTech reference implementation and Moodle,
Canvas and Blackboard sandboxes in both roles. Failover test: flip home
region mid write-back backlog; assert monotone timestamps and ≤ 1 duplicate
per (lineitem, user).

## Open Questions

- Whether to accept `lti1p1` migration claims to map legacy user ids
  (default: pass through only).
