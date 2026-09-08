## 1. Fact model and libraries
- [ ] 1.1 Fact envelope types, canonical CBOR, `fact_id`, chain (`prev`) helpers in Java and TypeScript with shared vectors
- [ ] 1.5 `am.change.v1` type: actor/seq/deps alignment checks at ingest (FLS-21)
- [ ] 1.2 Fact type registry loader and JSON-schema validation per `fact-types.md`
- [ ] 1.3 Void effectiveness evaluator (effective-fact rule, void chains)
- [ ] 1.4 Ingest library: authorisation hooks, encryption, envelope stamping, conditional put classification

## 2. Sync API
- [ ] 2.1 `POST /sync/v1` request/response schema; limits (100 facts, 1 MiB)
- [ ] 2.2 Push path with parallel conditional puts; duplicate and seq-conflict handling
- [ ] 2.3 Lateness stamp from deadline index with 60 s cache
- [ ] 2.4 Pull planning from rosters; range queries; continuation cursor; cohort pulls
- [ ] 2.5 Advice block (register, refork, denied, abandon, retry_after)
- [ ] 2.6 Throttle overflow to SQS; `ingest-drain` consumer

## 3. Blobs
- [ ] 3.1 `POST /blobs/presign` with SHA-256 checksum; prefix rules per blob class
- [ ] 3.2 `body_ref` support in ingest and pull; `blob_pending` signalling

## 4. Propagation
- [ ] 4.1 `stream-router` with filter, batch dedupe, roster and view group routing
- [ ] 4.2 `roster-updater` with HWM/pending/chain logic and CAS
- [ ] 4.3 `fact.folded` EventBridge event with type filter attributes
- [ ] 4.4 Daily abandonment scan appending `sys.abandon.v1`

## 5. Encryption and keys
- [ ] 5.1 Data-key creation and selection; `DK#` items; cache
- [ ] 5.2 Body encryption on ingest; decryption helper for consumers

## 6. Export
- [ ] 6.1 DynamoDB export → Parquet transform → manifest
- [ ] 6.2 On-demand export API for admins (decrypted path gated by ADM-13 in 015)

## 7. Device SDK
- [ ] 7.1 IndexedDB store with durable seq allocation and chain
- [ ] 7.2 Sync agent: batching, retries, region failover, vector bookkeeping, gap fill, refork handling
- [ ] 7.3 Multi-profile device ids (FLS-19)

## 8. Tests and verification
- [ ] 8.1 Property tests: any interleaving of pushes across two regions converges rosters
- [ ] 8.2 Load test per design §Migration Plan
- [ ] 8.3 Chaos: kill router mid-batch; assert no double fold
- [ ] 8.4 Cost check against FLS cost model at simulated L10k
