## 1. Failover and DR
- [ ] 1.1 Failover workflow (preconditions, draining, registry flip, epoch bump, emitter enablement, audit, notify)
- [ ] 1.2 Emitter home-region checks audited across COM, LTI, DIO, CRD
- [ ] 1.3 Restore-by-re-union tooling with erasure/shred skips and anti-entropy run
- [ ] 1.4 DR runbooks; quarterly game-day schedule and RPO/RTO recording

## 2. Admin console
- [ ] 2.1 Directory, catalogue, integrations, policy defaults, reports views over derived indexes
- [ ] 2.2 Operator roles; break-glass approval workflow with audit facts
- [ ] 2.3 Audit fact writer and audit trail view
- [ ] 2.4 Per-tenant rate limits; optional WAF stack; leading-key IAM conditions for admin tooling

## 3. Data protection
- [ ] 3.1 Erasure workflow with cross-region key deletion, blob deletion, MVA-15 recompute, sweep, verification, optional physical deletion
- [ ] 3.2 Single-fact shred with anti-entropy cooperation
- [ ] 3.3 Tenant deletion with cooling-off
- [ ] 3.4 Retention facts and sweeper; per-course retention behaviour
- [ ] 3.5 Consent facts, resolver, consumer integration (Caliper, analytics, observer digests)
- [ ] 3.6 Decrypted export two-person authorisation and time-boxed URLs

## 4. Cost governance
- [ ] 4.1 Cost allocation tags verified on every resource; cost-per-active-learner rollup
- [ ] 4.2 Budgets → flag facts → non-essential throttling; anomaly alarms
- [ ] 4.3 Zone floor and per-tenant increment report

## 5. Verification
- [ ] 5.1 Failover game day with AGS backlog: monotone timestamps, ≤ 1 duplicate per entity
- [ ] 5.2 Erasure verification across regions and a PITR restore
- [ ] 5.3 Budget throttle test: learner sync unaffected
