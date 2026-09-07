## 1. Platform role
- [ ] 1.1 Registration and deployment facts, indexes, admin UI, deterministic ids
- [ ] 1.2 OIDC login/auth endpoints, `id_token` builder with all claims, substitution variables
- [ ] 1.3 Nonce/state handling with region routing
- [ ] 1.4 Service token endpoint (client assertion validation, scopes)
- [ ] 1.5 NRPS with filters, pagination, differences cursor and change log
- [ ] 1.6 AGS: lineitems (derived + created), scores → `ext.score.v1`, results with strong reads, DRV integration (LTI-18)
- [ ] 1.7 Deep Linking request/response → `lti.link.v1` + structure ops
- [ ] 1.8 Dynamic Registration endpoint and platform configuration document
- [ ] 1.9 Caliper endpoint claim wiring (after 010)

## 2. Tool role
- [ ] 2.1 Platform registration facts, JWKS cache, deployment lists, admin UI
- [ ] 2.2 Launch validation, principal mapping (IDE-01), role mapping, context auto-binding, `lti.launch.v1`
- [ ] 2.3 NRPS pull job → enrolment facts
- [ ] 2.4 Lineitem creation (idempotent via ledger) and recording
- [ ] 2.5 Intent producer in the fold for AGS-linked rows (LTI-12)
- [ ] 2.6 AGS write-back emitter with ledger-continued timestamps, home-region check, retry/stop policy
- [ ] 2.7 Deep Linking response builder
- [ ] 2.8 Submission Review launch handling
- [ ] 2.9 Dynamic Registration (tool side)

## 3. Operations
- [ ] 3.1 Interop status view and controls (resend, re-create, pause) with audit facts
- [ ] 3.2 Epoch header on all service responses
- [ ] 3.3 Certification test runs (both roles) and sandbox integrations
- [ ] 3.4 Failover test for write-back monotonicity
