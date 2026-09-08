## 1. Fold
- [ ] 1.1 `view-updater`: batch loading, HWM logic, pending stash, engine `fold`/`derive` calls
- [ ] 1.2 Row/item/header CAS writes; vector digest maintenance; `view.updated` event
- [ ] 1.3 Merkle node maintenance (leaf members, additive digests, level and root)
- [ ] 1.4 Subject → partitions index

## 2. Non-monotone and intents
- [ ] 2.1 `nm-recompute` with debounce; rank, percentile, at-risk rules, mastery hook (CRD-04)
- [ ] 2.2 SideEffectIntent storage, scheduling (delay queues / Step Functions Wait), `intent-evaluator`
- [ ] 2.3 At-risk cool-down and explainability payload

## 3. Recompute and verification
- [ ] 3.1 `partition-recompute` Distributed Map with generations and header flip
- [ ] 3.2 `version.changed` handling (key, rubric, policy, engine)
- [ ] 3.3 `view-verifier` daily sample with alarm and swap
- [ ] 3.4 Erasure fan-out recompute (MVA-15)

## 4. Anti-entropy (FLS-14)
- [ ] 4.1 Cross-region peer read client and IAM
- [ ] 4.2 Root compare, descend, member diff, pull-and-put repair with shred check
- [ ] 4.3 Scheduler wiring per active partition; `fact.repaired` metric

## 5. APIs and UI
- [ ] 5.1 Cohort and course gradebook endpoints with pagination and freshness block
- [ ] 5.2 Learner progress endpoint; device-side source labelling contract
- [ ] 5.3 Dominance endpoint; freshest-across-regions option; consistent reads
- [ ] 5.4 Instructor UI: freshness banner, in-transit markers, holes, explain links, confirmation on punitive actions

## 6. Analytics and telemetry
- [ ] 6.1 Daily rollups to `AN#` items and tenant dashboard
- [ ] 6.2 Staleness metrics and alarms; replication-lag proxy banner
- [ ] 6.3 Athena table definitions over exports (ADR-016)

## 7. Tests
- [ ] 7.1 Fold == recompute property test over random fact interleavings
- [ ] 7.2 Stability window tests (flicker dropped, stable fires once)
- [ ] 7.3 Header write-rate test at 2,000-learner burst; sharded-group fallback verified
