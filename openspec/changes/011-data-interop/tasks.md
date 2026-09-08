## 1. OneRoster
- [ ] 1.1 Connection configuration facts and secrets; OAuth 2.0 client for SIS
- [ ] 1.2 Pull workflow (Step Functions) with delta/full modes and quirks config
- [ ] 1.3 CSV import workflow (Distributed Map), validation report, paced writes
- [ ] 1.4 Entity index and change log; provider API (rostering) with filters, pagination, fields, epoch
- [ ] 1.5 Gradebook provider (lineItems, categories, scoreScales, results) from views
- [ ] 1.6 SIS write acceptance (`PUT results`, `PUT lineItems`) → facts
- [ ] 1.7 Push emitter with ledger-continued `dateLastModified` and lock handling
- [ ] 1.8 SIS unenrol flagging (DIO-18)

## 2. Caliper
- [ ] 2.1 Projector (all mapped fact types) with deterministic ids and extensions
- [ ] 2.2 Emitter (home region), batching, ledger per envelope, retries
- [ ] 2.3 GradeEvent production from stable intents
- [ ] 2.4 Endpoint: validation, actor mapping, `caliper.in.v1`, duplicate flagging
- [ ] 2.5 Admin configuration UI listing profiles and out-of-scope profiles; projection-not-log statement

## 3. Common Cartridge
- [ ] 3.1 Import workflow: unzip, manifest, resources, QTI 1.2 → 3.0, LTI link matching, structure ops, report
- [ ] 3.2 Export workflow: CC 1.3 and Thin CC with QTI 3.0 → 1.2.1 and provenance file
- [ ] 3.3 Course copy via export/import

## 4. Edu-API and webhooks
- [ ] 4.1 Edu-API provider endpoints from derived indexes with epoch
- [ ] 4.2 Webhook subscriptions, emitter, signatures, retry and failing state

## 5. Cross-cutting
- [ ] 5.1 API client registrations and scopes (DIO-19)
- [ ] 5.2 Epoch registry field and `409 epoch_changed` handling
- [ ] 5.3 Reconciliation views (SIS differences, Caliper backlog, webhook failures, CC reports)
- [ ] 5.4 Certification runs; sample cartridges; mock-SIS failover test
