## 1. Infrastructure as code
- [ ] 1.1 CDK zone app: parameters (zone id, regions), regional stack, global-table replica configuration
- [ ] 1.2 `facts` table (on-demand, PITR, streams, deletion protection), `derived` table (TTL, no PITR), `registry` table
- [ ] 1.3 S3 buckets per region, SSE-KMS, bidirectional replication rules, lifecycle for `tmp/`
- [ ] 1.4 CloudFront distribution per zone with origin group failover and OAC
- [ ] 1.5 KMS MRKs (symmetric, asymmetric P-256) replicated to each zone region; key policies per function role
- [ ] 1.6 Route 53 hosted zone, latency records, health checks; ACM certificates per region
- [ ] 1.7 API Gateway HTTP API per region with custom domain, `/health` route, JWT authorizer placeholder
- [ ] 1.8 EventBridge regional bus; SQS FIFO `roster` and `views` queues; delay queues (30 s, 60 s, 5 min, 15 min); DLQs
- [ ] 1.9 SSM parameters for zone/region configuration; cost allocation tags on every resource

## 2. Build and deploy
- [ ] 2.1 Maven multi-module build with SnapStart-ready packaging; `afterRestore` hooks for clients
- [ ] 2.2 Cargo workspace: `trellis-core-rs`, `engine` (placeholder), build for `provided.al2023` and `wasm32`
- [ ] 2.3 Pipeline: build → unit tests → shared-vector cross-language test → deploy region A → canary → deploy region B
- [ ] 2.4 Lambda defaults (memory, timeouts, architecture parameter, log retention 14 d, sampling env vars)

## 3. Shared libraries
- [ ] 3.1 Key helpers for every PK/SK pattern in project.md §5 and FLS §DynamoDB
- [ ] 3.2 HLC: 48+16 bit encoding, per-environment monotonic issuer, hex16 rendering, parsing
- [ ] 3.3 Canonical CBOR encoder, SHA-256 `fact_id`, base32 rendering; shared test vectors (Java and Rust)
- [ ] 3.4 Envelope encryption: data-key generation, `DK#` items, 5-minute plaintext cache, AES-256-GCM
- [ ] 3.5 Registry client with 60 s in-memory cache; tenant context resolution from hostname
- [ ] 3.6 Structured JSON logging with sampling; EMF metrics helper with bounded dimensions
- [ ] 3.7 Idempotent DynamoDB put helper (conditional, classify duplicate vs conflict)

## 4. Streams spike (project.md A6)
- [ ] 4.1 Observer Lambda per region subscribed to the `facts` stream writing observations to `derived`
- [ ] 4.2 Test harness: 1,000 writes in each region; assert 2,000 INSERT observations per region within 60 s
- [ ] 4.3 Record results in `spike-streams.md`; if negative, implement cross-region EventBridge fan-out and amend ADR-014

## 5. Tenant provisioning
- [ ] 5.1 Step Functions Standard workflow per ADM-01 (registry write, DNS, ACM, `tenant.v1`, `kid` facts, prefixes)
- [ ] 5.2 Operator CLI to invoke provisioning and print the tenant summary
- [ ] 5.3 Provision one test tenant per zone

## 6. Observability
- [ ] 6.1 Dashboards per region: API latency and errors, Lambda cold starts, DynamoDB throttles, stream iterator age, queue age
- [ ] 6.2 Alarms: throttles, error rate, health check failures, replication-lag proxy placeholder, budget 80%/100%
- [ ] 6.3 Status page scaffold (static page per tenant hostname, fed by health data)

## 7. Verification
- [ ] 7.1 Game day: fail one region's health check; DNS failover ≤ 2 min; recovery
- [ ] 7.2 Cross-language vector test passes on Java and Rust builds
- [ ] 7.3 Cost review: zone floor ≤ $60/month with no traffic
