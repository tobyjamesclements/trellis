# Data Interoperability Specification

Capability ID prefix: **DIO**

## Purpose

Rostering and gradebook exchange with student information systems
(OneRoster 1.2 REST and CSV), learning analytics emission and ingestion
(Caliper Analytics 1.2), course package import and export (Common
Cartridge 1.1–1.3 and Thin CC 1.3), higher-education course and enrolment
data (Edu-API 1.0), and Trellis-specific signed webhooks. Every inbound
payload becomes facts; every outbound payload is a projection of derived
state emitted from the tenant's home region with monotone timestamps and an
epoch that tells consumers when their cursors are void.

## Consistency boundary

- **Inbound** records are snapshot facts (`sis.v1`, `caliper.in.v1`,
  `cc.import.v1`, `ext.result.v1`) plus the domain facts they imply
  (`enrol.v1`, `identity.v1`, structure operations). Re-importing the same
  data is a no-op because facts are content-addressed and the structure
  operations are keyed by a deterministic import id.
- **Outbound reads** (OneRoster and Edu-API providers) are served from
  region-owned derived indexes. `dateLastModified` is the *fold time in the
  serving region*; delta cursors are therefore only meaningful within one
  region and one epoch. The tenant's interop hostname resolves to the home
  region with failover; a failover bumps the epoch and forces consumers to
  full-sync.
- **Outbound writes** (OneRoster push to an SIS, Caliper envelopes,
  webhooks) are side effects: home region only, sent ledger, stability
  window for anything derived from a non-monotone predicate, and
  deterministic ids so a duplicate emission is detectable by the consumer.
- **The fact log is not the Caliper log.** Caliper is a projection (DIO-08).

## Domain model

```
SISRecord      sis.v1       { entity: org|academicSession|course|class|user|enrollment|demographics|
                              lineItem|result|category|scoreScale, sourcedId, dateLastModified, status, payload }
                              subject: user → learner (deterministic id from sis sourcedId, IDE-01);
                              class/course → course; org/session → tenant
ExternalResult ext.result.v1 { lineItem_sourcedId, learner, score, scoreStatus, scoreDate, comment, payload }
CaliperIn      caliper.in.v1 { sensor, envelope_hash, event_id, actor_ref, event_type, action, event_time, payload }
CCImport       cc.import.v1  { import_id = hash(cartridge sha256 ‖ course ‖ options), manifest_hash, report_ref }
Webhook        webhook.v1    { subscription_id, url, secret_ref, event_kinds[], status }   (T, _admin, admin, S)
OneRoster ids  sourcedId for Trellis-originated entities = "tr_" + hash(tenant ‖ entity kind ‖ internal id)
Epoch          per tenant, in registry; `X-Trellis-Epoch` on every interop response
Caliper event id = urn:uuid (v5, namespace = tenant) over (fact_id ‖ profile ‖ action)
```

New fact type beyond the registry: `webhook.v1` (T, `_admin`, admin, S).

---

## Requirements

### Requirement: The system SHALL pull rostering data from OneRoster 1.2 REST providers into snapshot and enrolment facts on a schedule, with delta requests where the provider supports them [DIO-01]

The system SHALL pull rostering data from OneRoster 1.2 REST providers into snapshot and enrolment facts on a schedule, with delta requests where the provider supports them.
A Step Functions Standard workflow per SIS connection (home region,
default hourly) authenticates with OAuth 2.0 client credentials, pages
through `orgs`, `academicSessions`, `courses`, `classes`, `users`,
`enrollments` (and `demographics` if enabled), using
`filter=dateLastModified>'<last run>'` when the previous run completed,
and appends `sis.v1` facts for changed records plus the implied
`identity.v1`, `enrol.v1`/`unenrol.v1`, and `cohort.v1` facts. Users get
deterministic principal ids from `(sis:<tenant>, sourcedId)`.

#### Scenario: Nightly delta
- **WHEN** the SIS reports 40 changed enrollments since the last run
- **THEN** 40 `sis.v1` facts and the corresponding enrolment facts are appended and every other record is untouched

#### Scenario: Provider without delta support
- **WHEN** the provider rejects the `dateLastModified` filter
- **THEN** the workflow falls back to a full pull and the content-addressed facts make unchanged records no-ops

### Requirement: The system SHALL import OneRoster 1.2 CSV bundles in bulk and delta modes with validation reports and paced fact writes [DIO-02]

The system SHALL import OneRoster 1.2 CSV bundles in bulk and delta modes with validation reports and paced fact writes.
An admin uploads a zipped bundle (`manifest.csv`, `orgs.csv`, `users.csv`,
`courses.csv`, `classes.csv`, `enrollments.csv`, `academicSessions.csv`,
optional `demographics.csv`, `userProfiles.csv`, `roles.csv`) to a presigned
S3 URL; a Step Functions Distributed Map validates each file against the
1.2 CSV specification, reports errors per row, and appends facts at ≤ 500
facts/s per course PK and ≤ 200 facts/s per subject PK. `manifest.csv`
`processingMode` (`bulk` or `delta`) is honoured; `delta` rows with status
`tobedeleted` become `unenrol.v1` or superseding status facts.

#### Scenario: Bundle with one malformed row
- **WHEN** `enrollments.csv` has a row whose `classSourcedId` is unknown
- **THEN** every other row is imported, the report lists the row and reason, and the admin can re-upload a corrected bundle whose valid rows are no-ops

### Requirement: The system SHALL serve OneRoster 1.2 rostering as a provider from region-owned indexes with region-relative modification times and an epoch header [DIO-03]

The system SHALL serve OneRoster 1.2 rostering as a provider from region-owned indexes with region-relative modification times and an epoch header.
Endpoints for `orgs`, `academicSessions`, `courses`, `classes`, `users`,
`enrollments`, `demographics` (permission-gated) and their nested forms
support `limit`/`offset`, `sort`/`orderBy`, `filter`, and `fields`.
`sourcedId` for Trellis-originated entities is deterministic; SIS-originated
entities keep the SIS `sourcedId`. `dateLastModified` is the fold time in
the serving region. The tenant's interop hostname resolves to the home
region; responses carry `X-Trellis-Epoch`, and a delta request whose
epoch (in the `X-Trellis-Epoch-Expected` request header or the consumer's
stored value) mismatches receives `409 epoch_changed`.

#### Scenario: SIS delta pull
- **WHEN** an SIS requests `users?filter=dateLastModified>'2026-09-01T00:00:00Z'` with the current epoch
- **THEN** the region returns users whose derived profile or enrolment folded after that instant in this region

#### Scenario: Epoch changed by failover
- **WHEN** the consumer sends the previous epoch
- **THEN** the response is `409 epoch_changed` with the new epoch and the consumer performs a full pull

### Requirement: The system SHALL serve the OneRoster 1.2 gradebook as a provider with lineitems, categories, score scales and results derived from views [DIO-04]

The system SHALL serve the OneRoster 1.2 gradebook as a provider with lineitems, categories, score scales and results derived from views.
`lineItems` are gradable activities (deterministic `sourcedId`),
`categories` are gradebook categories from `policy.v1`, `scoreScales` from
policy scales, and `results` are derived per `(lineItem, learner)` from the
LearnerRow: `score` (decimal, exact), `scoreStatus` mapped from derivation
(`not submitted`, `submitted`, `partially graded`, `fully graded`, `exempt`
for overrides marked exempt), `scoreDate` = the derivation's `sync_hlc`
physical time, `dateLastModified` = fold time in the serving region,
`metadata.trellis.vector` = the row's vector digest, and
`metadata.trellis.provenance` = a link to DRV-15. Results for a learner with
pending streams carry `metadata.trellis.pending = true`.

#### Scenario: SIS pulls results
- **WHEN** an SIS requests `classes/{id}/results`
- **THEN** every learner-lineitem pair with a derived outcome is returned with its status, score and vector digest, paginated

#### Scenario: Re-derivation after the SIS pulled
- **WHEN** a key correction changes a `fully graded` result after the SIS stored it
- **THEN** the result's `dateLastModified` advances in the serving region and the next delta pull returns it again with the new score

### Requirement: The system SHALL accept OneRoster 1.2 gradebook writes from an SIS as external result facts [DIO-05]

The system SHALL accept OneRoster 1.2 gradebook writes from an SIS as external result facts.
`PUT /results/{sourcedId}` and `PUT /lineItems/{sourcedId}` append
`ext.result.v1` and `lti.lineitem.v1`-equivalent structure facts. An
external result is an input to derivation (DRV-09 semantics as an
"external override" ranked below an instructor override).

#### Scenario: SIS posts a moderated score
- **WHEN** the SIS PUTs a result with `scoreStatus = fully graded`
- **THEN** an `ext.result.v1` fact is appended and the gradebook shows the SIS value with "external (SIS)" provenance unless an instructor override exists

### Requirement: The system SHALL push results to an SIS, emit Caliper envelopes, and deliver webhooks only from the home region, behind stability windows, with a sent ledger and monotone modification times [DIO-06]

The system SHALL push results to an SIS, emit Caliper envelopes, and deliver webhooks only from the home region, behind stability windows, with a sent ledger and monotone modification times.
Push targets are `PUT /results/{sourcedId}` on the SIS (OneRoster
gradebook push), Caliper endpoints, and webhook URLs. Each push is an
`effect.ready` intent (window 60 s for results, 0–60 s coalescing for
Caliper, 0 for monotone webhooks) consumed in the home region. The ledger
records `(target, entity, dateLastModified sent)`; the next push uses
`max(previous + 1 ms, now)`. Push failures with `4xx` create a
reconciliation item (DIO-17); `429`/`5xx` retry with backoff. SIS rejections
after a grade-posting lock are recorded, never retried automatically, and
shown as "SIS value differs".

#### Scenario: Result pushed then corrected
- **WHEN** a result is pushed and later re-derived
- **THEN** a second push with a strictly later `dateLastModified` follows the window

#### Scenario: SIS locked the term
- **WHEN** the SIS responds `403 locked` to a corrected result
- **THEN** the push is not retried, the reconciliation view lists the learner, the Trellis value and the SIS value, and the instructor is notified once

### Requirement: The system SHALL emit Caliper 1.2 events as a deterministic projection of facts and stable derivations, batched, at least once, with consumer-deduplicable ids [DIO-07]

The system SHALL emit Caliper 1.2 events as a deterministic projection of facts and stable derivations, batched, at least once, with consumer-deduplicable ids.
The projection table (`caliper-mapping.md`) maps fact types to profiles and
actions. Event `id` is a v5 UUID over `(fact_id, profile, action)`;
`eventTime` is the fact's `device_hlc` physical time; extensions carry
`trellis:syncTime` (`sync_hlc`), `trellis:factId`, `trellis:keyVersion` and
`trellis:vector` where applicable. Envelopes hold ≤ 100 events and ≤ 1 MB,
`sensor` = the tenant's sensor id, `sendTime` = emission time. GradeEvents
are emitted only from stable derivations (60 s window) and re-emitted with a
new `eventTime` on change. Delivery is at least once from the home region;
the ledger records envelope ids.

#### Scenario: Offline responses synced next day
- **WHEN** 30 responses with yesterday's `device_hlc` sync today
- **THEN** 30 `AssessmentItemEvent Completed` events are emitted with yesterday's `eventTime` and today's `trellis:syncTime`

#### Scenario: Duplicate after failover
- **WHEN** both regions emit the same envelope during a flip
- **THEN** the events carry identical ids and a conforming endpoint deduplicates them

### Requirement: The system SHALL document and enforce that the fact log is the source and Caliper is a projection, not the same log [DIO-08]

The system SHALL document and enforce that the fact log is the source and Caliper is a projection, not the same log.
Differences stated in `caliper-mapping.md` and enforced by the projector:
voids emit no retraction (Caliper has none); instead the re-derived
GradeEvent follows and the voided response's AssessmentItemEvent stands
with a later `trellis:voidedBy` extension on subsequent GradeEvents; device
identity, key versions, envelopes and pending state exist only as
extensions; ordering is by emission, not `eventTime`; late facts produce
events with old `eventTime`; only the home region emits. No consumer can
reconstruct the fact set from Caliper alone, and Trellis never re-derives
anything from its own Caliper output.

#### Scenario: Instructor asks "is Caliper my audit log?"
- **WHEN** the admin console describes the Caliper integration
- **THEN** it states that the fact export (FLS-20) is the record and Caliper is a lossy projection with the listed differences

### Requirement: The system SHALL host a Caliper 1.2 endpoint per tenant that stores received events as facts attributed to resolved principals [DIO-09]

The system SHALL host a Caliper 1.2 endpoint per tenant that stores received events as facts attributed to resolved principals.
The endpoint accepts envelopes with a bearer token scoped to a sensor (an
LTI tool deployment or an admin-issued sensor), validates JSON-LD context
and required properties, resolves `actor` through the deployment's
pairwise `sub` mapping (LTI-14) or an explicit actor mapping, and appends
`caliper.in.v1` facts (subject = resolved learner, else tenant). Duplicate
event ids within 24 hours are stored and marked `duplicate = true`.

#### Scenario: Tool sends assessment events
- **WHEN** an LTI tool posts an envelope with `AssessmentEvent Submitted` for a pairwise `sub`
- **THEN** the fact is appended for the mapped learner and the at-risk rule "no activity in N days" counts it

### Requirement: The system SHALL cover the Caliper profiles listed in the projection table and state which are out of scope [DIO-10]

The system SHALL cover the Caliper profiles listed in the projection table and state which are out of scope.
In scope: Basic, Session, ToolLaunch, ToolUse, Assessment, AssessmentItem,
Assignable, Grading, Feedback, Forum, Reading, Navigation, Survey (for
choice and feedback activities). Out of scope: Annotation (no annotation
feature), Media (no native player), Search (no server search), Resource
Management (authoring events are a candidate later change).

#### Scenario: Profile coverage listed
- **WHEN** an admin enables Caliper
- **THEN** the configuration screen lists the profiles emitted and the out-of-scope ones with reasons

### Requirement: The system SHALL import Common Cartridge 1.1–1.3 and Thin CC 1.3 packages into structure operations, blobs, forums, LTI links and QTI 3.0 items, idempotently and paced [DIO-11]

The system SHALL import Common Cartridge 1.1–1.3 and Thin CC 1.3 packages into structure operations, blobs, forums, LTI links and QTI 3.0 items, idempotently and paced.
A Step Functions Standard workflow (home region) unzips to S3, validates
`imsmanifest.xml`, walks `organizations` into `struct.v1` operations keyed
by `import_id`, stores `webcontent` as content-addressed blobs, maps
`imswl` web links, `imsdt` discussion topics (forum creation), `imsbasiclti`
descriptors to `lti.link.v1` with registration matching by launch URL
(unmatched → pending registration), and converts QTI 1.2 assessments to
QTI 3.0 items, recording every lossy element in the report. A re-run with
the same cartridge and options is a no-op.

#### Scenario: Cartridge with LTI links and a quiz
- **WHEN** an editor imports a CC 1.3 cartridge containing 3 LTI links and a 20-question QTI 1.2 quiz
- **THEN** 3 `lti.link.v1` facts (two matched, one pending registration), 20 items with `key.v1` versions, and the section structure appear after the fold, and the report lists any unsupported QTI 1.2 constructs

#### Scenario: Import re-run
- **WHEN** the same cartridge is imported again into the same course
- **THEN** no new facts are appended and the report says "already imported"

### Requirement: The system SHALL export Common Cartridge 1.3 and Thin CC 1.3 packages from a published snapshot at a vector, excluding learner data [DIO-12]

The system SHALL export Common Cartridge 1.3 and Thin CC 1.3 packages from a published snapshot at a vector, excluding learner data.
Export builds from the current published structure snapshot: web content,
web links, discussion topic stubs, LTI links, and assessments as QTI 1.2.1
where representable (CC 1.3 mandates QTI 1.2.1; QTI 3.0-only features are
listed as lossy in the export report). Thin CC contains LTI and web links
only. The package includes `trellis/provenance.json` with the publish
`fact_id` and vector digest.

#### Scenario: Export with unrepresentable item
- **WHEN** a course contains a `gapMatchInteraction` item
- **THEN** the CC 1.3 export omits or degrades it per the conversion table and the report names it

### Requirement: The system SHALL support course copy and backup/restore through cartridge export/import and the fact export, never by copying derived state [DIO-13]

The system SHALL support course copy and backup/restore through cartridge export/import and the fact export, never by copying derived state.
Copy = export at vector → import into a new course. Backup = CC export +
FLS-20 fact export scoped to the course. Restore = import + idempotent fact
re-ingest (ADM-10).

#### Scenario: Copy course for the next term
- **WHEN** an instructor copies a course
- **THEN** the new course has equivalent structure and content facts, its own cohorts, and no learner facts

### Requirement: The system SHALL provide an Edu-API 1.0 read provider for courses, course offerings, sections, enrolments and persons from derived indexes with the same epoch semantics as OneRoster [DIO-14]

The system SHALL provide an Edu-API 1.0 read provider for courses, course offerings, sections, enrolments and persons from derived indexes with the same epoch semantics as OneRoster.
Endpoints follow the Edu-API 1.0 core model (persons, courses,
courseOfferings, courseSections, enrollments, academicSessions, programs
where mapped). Served from the home region with `X-Trellis-Epoch`;
modification times are region-relative.

#### Scenario: HE integration pulls sections
- **WHEN** a student system requests `courseSections?filter=...`
- **THEN** sections map from cohorts with deterministic ids and the epoch header

### Requirement: The system SHALL deliver signed webhooks for a documented set of domain events from the home region with the sent ledger [DIO-15]

The system SHALL deliver signed webhooks for a documented set of domain events from the home region with the sent ledger.
`webhook.v1` subscriptions name a URL, secret and event kinds
(`view.updated`, `at_risk.stable`, `submission.received`,
`enrolment.changed`, `credential.issued`, `interop.reconciliation`).
Deliveries carry an HMAC-SHA256 signature, `X-Trellis-Delivery-Id`
(deterministic per intent), and retries with backoff for 24 hours.

#### Scenario: Subscriber down
- **WHEN** a webhook URL returns `503` for an hour
- **THEN** deliveries retry with backoff and the ledger shows each attempt; after 24 hours the subscription is marked `failing` and the admin notified

### Requirement: The system SHALL bump the tenant epoch on home-region failover and reject cursor-based delta requests carrying a stale epoch [DIO-16]

The system SHALL bump the tenant epoch on home-region failover and reject cursor-based delta requests carrying a stale epoch.
The epoch lives in the registry (ADM-03). Every interop provider response
carries it; delta requests validate it; a mismatch is `409 epoch_changed`.
Full pulls never require an epoch.

#### Scenario: Consumer ignores the epoch
- **WHEN** a consumer never sends the expected-epoch header
- **THEN** delta requests are still served, and the documentation states the consumer risks missing changes across a failover

### Requirement: The system SHALL provide reconciliation views listing differences between Trellis derivations and what external systems last accepted [DIO-17]

The system SHALL provide reconciliation views listing differences between Trellis derivations and what external systems last accepted.
Views per connection: SIS results that differ from the last pushed value
(with rejection reason), Caliper backlog and last envelope, webhook
failures, and CC import reports. Each row shows the vector digest of the
Trellis value.

#### Scenario: Term-end grade audit
- **WHEN** an admin opens the SIS reconciliation view
- **THEN** every learner whose Trellis result differs from the last SIS-accepted value is listed with both values and the derivation provenance

### Requirement: The system SHALL apply SIS-sourced unenrolments while preserving learner facts and flagging active learners removed by the SIS [DIO-18]

The system SHALL apply SIS-sourced unenrolments while preserving learner facts and flagging active learners removed by the SIS.
An SIS delta that removes an enrolment appends `unenrol.v1 { reason: sis
}`. If the learner has activity facts in the last 14 days, the instructor's
enrolment view flags "removed by SIS, recently active" and offers a manual
re-enrolment that the next SIS run will not undo unless the SIS still says
removed.

#### Scenario: SIS removes an active learner
- **WHEN** the SIS reports a learner as `tobedeleted`
- **THEN** the enrolment ends, the learner's facts and derived rows remain readable to instructors, and the flag appears

### Requirement: The system SHALL authenticate all interop provider endpoints with OAuth 2.0 client credentials per the 1EdTech Security Framework and scope tokens per service [DIO-19]

The system SHALL authenticate all interop provider endpoints with OAuth 2.0 client credentials per the 1EdTech Security Framework and scope tokens per service.
Consumers register as clients (admin-created, `lti.reg.v1`-style facts
with `role: api_client`) with per-service scopes
(`roster.readonly`, `gradebook.readonly`, `gradebook.createput`,
`caliper.send`, `eduapi.readonly`). Tokens are stateless JWTs (LTI-03).

#### Scenario: Roster-only client tries results
- **WHEN** a client with `roster.readonly` requests `results`
- **THEN** the response is `403 insufficient_scope`

### Requirement: The system SHALL provide a SCIM 2.0 service provider for strict organisations that turns provisioning calls into identity, profile and enrolment facts with read-your-writes for the provisioning client [DIO-20]

The system SHALL provide a SCIM 2.0 service provider for strict organisations that turns provisioning calls into identity, profile and enrolment facts with read-your-writes for the provisioning client.
Endpoints `/scim/v2/Users`, `/scim/v2/Groups`, `/ServiceProviderConfig`,
`/Schemas` and `/ResourceTypes` implement the core schema (RFC 7643) and
protocol (RFC 7644) with `filter`, `PATCH`, pagination and `externalId`.
A User becomes a `scim.v1` snapshot fact plus `identity.v1` (issuer
`scim:<tenant>`, deterministic principal id per IDE-01), `profile.v1` and,
for `active = false`, the suspension facts of IDE-22; a Group becomes a
tenant cohort (IDE-16) and its members enrolment facts. The API writes
through to the serving region's identity and status index so an immediate
GET returns what was just written; the indexer later confirms idempotently.
Only tenants with `identity_mode = strict` expose SCIM; tokens carry the
`scim.manage` scope (DIO-19).

#### Scenario: IdP provisions a user
- **WHEN** an identity provider POSTs a User with `externalId`
- **THEN** the facts are appended, the response carries the SCIM `id` (the deterministic principal id), and a GET for that id in the same region succeeds immediately

#### Scenario: Group membership drives cohorts
- **WHEN** a Group's members are patched
- **THEN** the tenant cohort's `enrol.v1`/`unenrol.v1` facts are appended and course enrolments follow through cohort sync (IDE-16)

#### Scenario: SCIM on a soft organisation
- **WHEN** a client calls SCIM on a tenant whose identity mode is `soft`
- **THEN** the response is `404` with a problem document explaining that soft organisations do not own identities

---

## DynamoDB access patterns

### `facts` (global)

| # | Pattern | Keys | Notes |
|---|---|---|---|
| 1 | SIS snapshot facts (users, enrolments) | `PK = T#t#S#L#<usr>`, `SK = F#_enrol#<dev_sys>#<seq10>` | Region system device stream per subject |
| 2 | SIS course/class facts | `PK = T#t#S#C#<course>`, `SK = F#_struct#<dev_sys>#<seq10>` | |
| 3 | Import manifests, webhook subscriptions | `PK = T#t#S#T#t`, `SK = F#_admin#<dev>#<seq10>` | |
| 4 | Caliper inbound, external results | `PK = T#t#S#L#<usr>`, `SK = F#<module>#<dev_sys>#<seq10>` | |
| 5 | Push / Caliper / webhook ledgers | `PK = T#t#LEDGER#<region>#<channel>#<shard>`, `SK = <entity>#<timestamp>` | Region-owned; 16 shards |

### `derived` (regional)

| Item | PK | SK | Size | Access |
|---|---|---|---|---|
| OneRoster entity index | `T#t#OR#<entity>` | `S#<sourcedId>` | 1–3 KB | GetItem; Query with filter |
| OneRoster change log (delta) | `T#t#ORD#<entity>` | `<region_seq10>` → sourcedId, folded_at | small | Range query from consumer cursor; counter item `HDR` with atomic ADD |
| Gradebook results view | `T#t#ORR#<class>` | `<lineItem>#<usr>` | small | Query per class; rebuilt from LearnerRows on `view.updated` |
| Caliper outbox (home) | `T#t#OUT#caliper` | `<sync_hlc>#<fact_id>` | small | Batch drain; TTL 7 d |
| Caliper actor mapping | `T#t#CALMAP#<sensor>` | `<actor_id_hash>` | small | GetItem on ingest |
| CC import state | Step Functions state; report in S3 | — | — | |
| Webhook subscriptions index | `T#t#WH` | `<subscription_id>` | small | Query on event |
| Reconciliation rows | `T#t#RECON#<connection>` | `<entity>` | small | Query for the view |

**Item collection sizing.** `ORD#<entity>` per region grows with churn;
pruned after 90 days (consumers behind 90 days must full-pull). The
results view for a class ≤ 2,000 × 50 lineitems = 100k items ≈ 30 MB;
paginated at 1,000.

**Hot-partition risk.** The `ORD#…#HDR` counter receives one atomic ADD
per folded entity change (≤ hundreds/s at 1M learners). The Caliper outbox
PK is per tenant: 2.5M events/month ≈ 1/s at L10k, 100/s at 1M, both under
the ceiling; shard by `fact_id` prefix if a tenant exceeds 500/s.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `oneroster-api` | HTTP API `/ims/oneroster/v1p2/*` | Java 21 SnapStart, 1024 MB | 30–150 ms | 350 / 800 ms | Filters, pagination, epoch header |
| `oneroster-pull` | Step Functions Standard per connection (Scheduler) | Java 21, 1024 MB | — | — | Pages; appends facts |
| `oneroster-csv-import` | Step Functions Distributed Map | Java 21, 2048 MB | — | — | Row validation; paced writes |
| `oneroster-push` | SQS from `effect.ready` kind `or_result`, home region | Java 21, 512 MB | 120 ms | 400 / 900 ms | Ledger |
| `caliper-projector` | EventBridge `fact.folded` and `view.updated` (stable) → SQS (batch 100, window 30 s) | Java 21 SnapStart, 512 MB | 25 ms/batch | 400 / 900 ms | Builds envelopes; home region check |
| `caliper-emitter` | SQS, home region | Java 21, 512 MB | 200 ms | 400 / 900 ms | POST; ledger per envelope |
| `caliper-endpoint` | HTTP API `/ims/caliper/v1p2/*` | Java 21 SnapStart, 1024 MB | 40 ms | 350 / 800 ms | Validation; facts |
| `cc-import` | Step Functions Standard | Java 21, 3008 MB, 10 GB ephemeral | — | — | Unzip, parse, convert QTI |
| `cc-export` | Step Functions Express | Java 21, 3008 MB | — | — | Package build to S3 |
| `eduapi-api` | HTTP API `/ims/eduapi/v1p0/*` | Java 21 SnapStart, 1024 MB | 30–150 ms | 350 / 800 ms | |
| `webhook-emitter` | SQS from `effect.ready`, home region | Java 21, 512 MB | 100 ms | 400 / 900 ms | HMAC; retries |
| `or-index-updater` | EventBridge `fact.folded` (enrol/profile/cohort/struct) and `view.updated` | Java 21, 512 MB | 20 ms | 400 / 900 ms | Writes OR/ORD/ORR |
| `scim-api` | HTTP API `/scim/v2/*` (strict tenants) | Java 21 SnapStart, 1024 MB | 40 ms | 350 / 800 ms | Facts + write-through to identity/status index |

## Propagation path

1. SIS pull/CSV → facts → stream → roster → `fact.folded` → `enrol-indexer` (IDE) and `or-index-updater` (OR entity index + change log).
2. LearnerRow changes (`view.updated`) → `or-index-updater` rebuilds affected `ORR` rows; `SideEffectIntent{or_result}` for push connections → 60 s → `effect.ready` → `oneroster-push` (home).
3. Facts → `caliper-projector` (every region computes the projection; only the home region's SQS consumer emits) → `caliper-emitter` → endpoint → ledger.
4. Stable GradeEvents originate from `intent-evaluator` (MVA-08) as `effect.ready{kind: caliper_grade}`.
5. CC import → structure facts → CAC snapshot → publish → bundles.

## Cost model

| Component | L10k | 1M | Basis |
|---|---|---|---|
| OneRoster provider reads | daily SIS pulls: 10 k users + 200 k results ≈ 6 M RRU/month ≈ **$0.8** + Lambda **$0.5** | $130 | |
| OneRoster pull / CSV import | 30 runs × ~50 transitions × $25/M + Lambda ≈ **$0.2** | $20 | |
| OR index writes | ~1 M WRU ≈ **$0.6** | $60 | |
| Result push | 200 k pushes × 0.12 s × 0.5 GB ≈ **$0.2**; ledger 200 k × 2 rWRU ≈ **$0.4** | $60 | |
| Caliper projection + emission | 2.5 M events / 100 per envelope = 25 k envelopes; Lambda ≈ **$0.3**; egress 5 GB ≈ **$0.45**; ledger ≈ **$0.05** | $80 | both regions project; one emits |
| Caliper endpoint (inbound) | 500 k events ≈ **$1** (facts + Lambda) | $100 | |
| CC import/export | 20 per month × ~$0.05 ≈ **$1** | $30 | 3 GB Lambda, minutes each |
| Edu-API | ≈ **$0.2** | $20 | |
| Webhooks | 100 k deliveries ≈ **$0.3** | $30 | |
| **Total** | **≈ $6** | ≈ $530 | |

## Standards conformance

| Standard | Role | Target conformance | In scope | Out of scope / why | EC conflict and resolution |
|---|---|---|---|---|---|
| OneRoster 1.2 Rostering | Consumer (REST + CSV) | 1EdTech certification, Rostering Consumer (Core) | Orgs, sessions, courses, classes, users, enrollments, demographics (opt-in), delta and bulk | Resources service (Common Cartridge covers content) | SIS-first learners get deterministic ids; OIDC link via mapping (IDE-11) |
| OneRoster 1.2 Rostering | Provider (REST) | Certification, Rostering Provider | All core endpoints, filters, pagination | Write endpoints for rostering (SIS is the source) | `dateLastModified` region-relative; home-region serving; epoch (DIO-03, DIO-16) |
| OneRoster 1.2 Gradebook | Provider (pull) | Certification, Gradebook Provider | lineItems, categories, scoreScales, results, class-scoped forms | Assessment lineitems for external QTI results beyond `results` | **Results are derived and change after "fully graded"; deltas re-deliver; see Tension 1** |
| OneRoster 1.2 Gradebook | Push (Trellis PUTs to SIS) and consumer of SIS writes | Certification where offered (Gradebook Consumer/Push) | PUT results/lineItems both directions | — | Home-region single writer; monotone `dateLastModified`; SIS locks surface as reconciliation, never retried blindly |
| OneRoster 1.2 CSV | Consumer | Certification, CSV Rostering Consumer | Bulk and delta bundles, all core files | CSV export of rostering (REST provider suffices) | — |
| Caliper Analytics 1.2 | Sensor | Certification for Basic, Session, ToolLaunch, ToolUse, Assessment, AssessmentItem, Assignable, Grading, Feedback, Forum, Reading, Navigation, Survey | Envelope emission, deterministic ids, extensions | Annotation, Media, Search, Resource Management (no features to project) | Projection, not the log (DIO-08); GradeEvents only when stable; at-least-once; home region |
| Caliper Analytics 1.2 | Endpoint | Certification, Endpoint (Basic, Assessment, Session at minimum) | Envelope validation, actor mapping, facts | Full JSON-LD reasoning; events for unmapped actors are tenant-scoped | Duplicate events stored and flagged, never rejected |
| Common Cartridge 1.1 / 1.2 / 1.3 | Import | Certification, CC 1.3 import (1.1/1.2 accepted) | Web content, links, discussions, LTI links, QTI 1.2 → 3.0 conversion | CC 1.0; authorization/`cc:authorizations` (no DRM) | Idempotent import id; paced writes |
| Common Cartridge 1.3 | Export | Certification, CC 1.3 export | As above; QTI 3.0 → 1.2.1 lossy | Learner data (not part of CC) | Export at publish vector with provenance |
| Thin Common Cartridge 1.3 | Import and export | Certification | LTI links, web links | — | — |
| Edu-API 1.0 | Provider | Conformance to core read model (certification when offered) | persons, courses, offerings, sections, enrollments, sessions | Write operations; programs beyond simple mapping | Same as OneRoster provider |
| 1EdTech Security Framework 1.1 | Provider and consumer | Conformant | OAuth 2.0 client credentials, scoped tokens | — | Stateless tokens verifiable in every region |
| SCIM 2.0 (RFC 7643, RFC 7644) | Service provider (strict organisations) | Core schema; Users, Groups, filter, PATCH, pagination; interoperability with Microsoft Entra ID and Okta provisioning | DIO-20 | Bulk operations, `/Me` | Write-through index for read-your-writes; deactivation propagates with replication lag (IDE-22) |

## Known Tensions

1. **OneRoster gradebook sync assumes results settle.** An SIS pulls
   `results` by `dateLastModified` and typically treats `fully graded` as
   final; many SISs lock a term's grades after posting. Trellis results are
   derived, change on late facts and re-derivation, and have
   region-relative modification times. Where the model breaks: (a) a delta
   cursor from region A is meaningless in region B; (b) a "final" grade
   can change after the SIS locked it; (c) two regions would push
   different values if both pushed. Symptoms: an SIS missing a correction
   after a failover; an SIS refusing a corrected grade; a learner's SIS
   grade differing from Trellis. Options:
   - **A. Home-region serving and pushing, epoch on failover, monotone
     `dateLastModified` from the ledger, reconciliation view for SIS
     rejections** (DIO-03/04/06/16/17). Residual: consumers that ignore
     the epoch may miss changes across a failover (documented); locked
     SIS grades diverge and are surfaced for a human.
   - B. Serve OneRoster from every region with global modification times
     derived from `sync_hlc` instead of fold time. Rejected: a fact
     folded late in a region would carry an old timestamp and be missed by
     a consumer already past it.
   - C. Only push results once per term (batch posting). Removes churn
     but makes the SIS gradebook useless during the term; offered as a
     per-connection policy `push_mode = final_only`.
   - D. Have the SIS pull with the vector digest as the cursor
     (`metadata.trellis.vector`). Exact but non-standard; offered as an
     extension header for SISs that integrate deeply.
   **Recommendation: A**, with C and D as options per connection, and
   plain customer documentation that the SIS gradebook is a delayed copy.

2. **Caliper GradeEvent churn.** Every stable re-derivation emits a new
   GradeEvent. Consumers that treat the first GradeEvent as final are
   wrong per Caliper but common. Mitigation: the 60 s window coalesces;
   the `trellis:vector` extension lets careful consumers order. Recommend
   documenting "latest `eventTime` wins per (object, actor)".

3. **CC conversion is lossy both ways.** QTI 1.2 → 3.0 loses nothing
   material; 3.0 → 1.2.1 loses interactions the older model lacks. The
   export report is the mitigation; there is no way to round-trip a
   QTI-3.0-only item through CC 1.3. Recommendation: accept; offer a
   Trellis-native package (fact export + bundles) for Trellis-to-Trellis
   copies.

4. **SIS as the source of truth versus learner activity.** The SIS may
   remove a learner who is mid-course. The removal is applied (the SIS
   owns enrolment) but flagged and reversible, and facts are never
   deleted. Recommendation: accept; the flag plus manual re-enrolment is
   the apology path.

5. **Inbound Caliper actors we cannot map.** Events for unknown actors
   are tenant-scoped facts that no at-risk rule can use. Recommendation:
   accept; report unmapped actor counts per sensor.
