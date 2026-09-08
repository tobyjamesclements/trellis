# Change: 001 Platform foundation

## Why

Nothing else can be built or costed until the two-table, two-region,
Lambda-only substrate exists and the one assumption the whole propagation
design rests on (replicated writes appear in each region's DynamoDB stream,
project.md A6) has been verified. This change lays down residency zones,
the `facts` global table, the regional `derived` tables, the global
`registry`, the API edge, blob storage with replication, keys, observability
and the tenant provisioning workflow, and it runs the spike.

## What Changes

- Infrastructure as code (AWS CDK, one app per zone plus one for the
  registry) creating: `facts` global table (on-demand, PITR, streams
  NEW_AND_OLD_IMAGES), `derived` regional tables (on-demand, TTL attribute,
  no backups), `registry` global table, S3 buckets per region with
  bidirectional replication, CloudFront distributions with origin groups,
  KMS multi-Region keys (one symmetric, one asymmetric per zone), Route 53
  hosted zone and latency records with health checks, API Gateway HTTP API
  per region with JWT authorizer scaffold, regional EventBridge buses, SQS
  FIFO queues (`roster`, `views`) and delay queues, SSM parameters.
- Build and deploy pipeline for the Java 21 backend (Maven, SnapStart,
  JNI artefacts for the Automerge binding) and the TypeScript client and
  engine packages (npm), with per-region deployment, canaries and the
  secure-by-design gates of SEC-01.
- Shared libraries: single-table key helpers, HLC, canonical CBOR and
  `fact_id`, envelope encryption with data-key cache, tenant context
  resolution from the registry, structured logging with sampling, EMF
  metrics.
- The Streams spike: write in region A, assert an INSERT stream record in
  region B; document the result and, if negative, implement the
  cross-region EventBridge fan-out fallback.
- Tenant provisioning workflow (Step Functions Standard) and the registry
  writer.
- Observability baseline: dashboards, alarms, status page scaffold.
- Security substrate: operator identity with MFA and least-privilege roles
  (SEC-02), the unsampled immutable security log (SEC-03), data
  classification and transport encryption (SEC-08), secrets handling
  (SEC-13), and the IaC-derived asset inventory with the Config
  conformance pack (SEC-16).

## Impact

- New: everything under `infra/`, `libs/`, `pipelines/`.
- Establishes the key conventions every later change uses (project.md §5).
- Cost: the fixed zone floor (~$60/month) starts here.

## Requirements delivered

- ADM-01
- ADM-02
- ADM-05
- ADM-08
- ADM-18
- ADM-19
- ADM-21
- SEC-01
- SEC-02
- SEC-03
- SEC-08
- SEC-13
- SEC-16

## Dependencies

None. Every later change depends on this one.

## Out of scope

Any fact ingestion (002), identity (003), and all capability APIs.
