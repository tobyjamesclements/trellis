# Materialised Views and Analytics Specification

Capability ID prefix: **MVA**

## Purpose

Instructor cohort views, gradebooks, learner progress summaries, item
statistics, at-risk flags, rankings and tenant analytics are all
materialised views: deterministic, recomputable projections of the fact set,
computed independently in every region, stamped with the version vector they
were computed at, and displayed with their staleness. This capability owns
the view updater, the vector-as-cursor incremental fold, the separation of
monotone from non-monotone derivations, the stability window that gates side
effects, and the visible-staleness contract with the UI.

## Consistency boundary

Views are eventually consistent, region-owned, and disposable. They are never
written to the global table and never merged across regions. The only thing
two regions ever compare is their vectors and set digests, and the only
outcome of that comparison is a freshness statement, never a merge.

Monotone derivations are folded incrementally, using the vector as the
cursor. Non-monotone derivations are recomputed over the union at a vector,
stored separately, and only ever replaced wholesale. Side effects that depend
on non-monotone results are queued with the vector they were decided at and
fired only after a stability window during which the predicate keeps holding
at a dominating vector.

## Domain model

```
Partition       (tenant, module, cohort)
ViewHeader      { generation, vector_digest, fact_count, set_digest, max_sync_hlc,
                  holes, engine_version, key_versions{}, rubric_versions{}, policy_version,
                  computed_at, region }
LearnerRow      { subject, cursors: {stream → hwm}, pending: {stream → [seq]},
                  items: {item → ItemOutcome summary}, module_grade, completion,
                  last_activity_hlc, has_hole, generation }
ItemRow         { item, attempted, distribution[bins], sum, count, facility, generation }
NMRow           { kind: rank|percentile|at_risk|mastery|top_n, vector_digest,
                  computed_at, payload, stable_since }
CourseView      fold over the course's module ViewHeaders and LearnerRows for a cohort
SideEffectIntent{ intent_id, kind, subject, decided_at_vector, window, payload }
```

The **vector** of a view is the union of `cursors` across its LearnerRows.
`vector_digest` in the header is an additive digest over `(stream, hwm)`
pairs so two headers can be compared for equality cheaply; dominance is
decided row by row.

---

## Requirements

### Requirement: The system SHALL compute every view independently in each region from that region's replica and store it only in the regional derived table [MVA-01]

The system SHALL compute every view independently in each region from that region's replica and store it only in the regional derived table.
No view item is ever written to a global table. Each region's view updater
consumes its own stream-fed queue. Regions do not exchange view rows.

#### Scenario: Region isolated
- **WHEN** replication between regions is interrupted for an hour
- **THEN** each region continues to fold its own facts and serve its own views, and each header's `max_sync_hlc` shows how far behind it is

#### Scenario: Derived table lost
- **WHEN** a region's derived table is deleted
- **THEN** partition recompute (MVA-12) regenerates every view from facts with no data loss

### Requirement: The system SHALL stamp every view with its version vector and expose staleness to the caller [MVA-02]

The system SHALL stamp every view with its version vector and expose staleness to the caller.
Every view response carries `freshness { vector_digest, fact_count,
max_sync_hlc, pending_streams, holes, region, computed_at }`. The UI renders
"includes work synced up to ⟨max_sync_hlc⟩ in ⟨region⟩; ⟨n⟩ devices have
work in transit" and never a bare timestamp. No TTL is used to decide
freshness.

#### Scenario: Instructor opens the gradebook
- **WHEN** the view has two streams with pending gaps
- **THEN** the header shows "2 devices have work in transit" with the affected learners marked in their rows

#### Scenario: Learner asks whether their work is reflected
- **WHEN** the learner's device vector for `(self, module)` is `{dev_a: 42}` and the row cursor is `{dev_a: 41}`
- **THEN** the dominance check returns `behind = [{stream: dev_a, have: 41, want: 42}]` and the client shows "1 submission not yet reflected"

### Requirement: The system SHALL fold facts incrementally using the version vector as the cursor [MVA-03]

The system SHALL fold facts incrementally using the version vector as the cursor.
The view updater consumes SQS FIFO messages grouped by partition in batches.
For each fact: if `seq ≤ cursor[stream]` skip; if `seq = cursor + 1` apply
and advance, then drain any pending seqs that became contiguous; if
`seq > cursor + 1` stash in `pending`. Monotone aggregates (attempt counts,
best/latest/first/mean via `(sum, count)`, distributions, completion inputs)
are updated in place. A batch writes each touched LearnerRow once, each
touched ItemRow once, and the header once, with region-local conditional
writes on `generation` and row `version`.

#### Scenario: Ordinary submission
- **WHEN** a `resp.v1` at `seq = 43` arrives and the row cursor is 42
- **THEN** the row's item summary, module grade and completion are updated and the cursor becomes 43 in one conditional write

#### Scenario: Batch coalescing
- **WHEN** a FIFO batch carries 10 facts for 3 learners in one partition
- **THEN** the updater performs 3 row writes, ≤ 10 item-row writes and 1 header write

### Requirement: The system SHALL guarantee that a full recompute at a vector reproduces the incrementally folded view [MVA-04]

The system SHALL guarantee that a full recompute at a vector reproduces the incrementally folded view.
A scheduled verifier recomputes a random 1% sample of partitions daily from
facts at each partition's current vector and compares rows byte-for-byte
(excluding `computed_at`). A mismatch is a severity-1 defect and the
partition is switched to the recomputed generation.

#### Scenario: Verifier finds drift
- **WHEN** a fold bug produced a wrong item-row `sum`
- **THEN** the verifier reports the partition, swaps in the recomputed generation, and raises an alarm with the differing rows

### Requirement: The system SHALL answer dominance queries against a client-supplied vector [MVA-05]

The system SHALL answer dominance queries against a client-supplied vector.
`POST /views/{partition}/dominates` with a vector returns `dominates: bool`
and the list of streams where the view is behind, with `have`/`want`. The
query reads only the rows for the subjects named in the vector.

#### Scenario: Freshness proof before an export
- **WHEN** an instructor requests a CSV export "including everything my class synced before 5 pm"
- **THEN** the export includes the freshness block and the dominance result against the roster HWMs at 5 pm

### Requirement: The system SHALL materialise the cohort gradebook per (module, cohort) and fold a course-level view across modules [MVA-06]

The system SHALL materialise the cohort gradebook per (module, cohort) and fold a course-level view across modules.
Rows expose per-item outcomes, module grade, completion, lateness flags,
holes and provenance links. The course view folds module headers and rows
for a cohort and is updated when any module header changes. An explain link
per cell resolves to DRV-15 provenance.

#### Scenario: Course gradebook
- **WHEN** a course has 8 modules and the cohort has 120 learners
- **THEN** `GET /views/course/{course}/{cohort}` returns 120 rows with 8 module grades each and one freshness block that is the union of the module vectors

### Requirement: The system SHALL recompute non-monotone derivations over the union at a vector and never merge them across replicas [MVA-07]

The system SHALL recompute non-monotone derivations over the union at a vector and never merge them across replicas.
Rank, percentile, top-N, at-risk flags and competency mastery are computed by
`nm-recompute` from all LearnerRows of the partition, stored as `NMRow` with
the header's `vector_digest`, and replaced wholesale. They are not folded,
not cached across partitions, and not compared with other regions' NMRows.

#### Scenario: Rank after a late submission
- **WHEN** a late fact folds and changes one learner's module grade
- **THEN** the header changes, a debounced `nm-recompute` runs over all rows, and every learner's rank is replaced together with the new `vector_digest`

#### Scenario: Two regions disagree on a rank
- **WHEN** region A and B hold different vectors
- **THEN** their NMRows differ; each is served with its own vector and neither is merged into the other

### Requirement: The system SHALL fire side effects from non-monotone predicates only after a stability window during which the predicate holds at a dominating vector [MVA-08]

The system SHALL fire side effects from non-monotone predicates only after a stability window during which the predicate holds at a dominating vector.
A predicate transition that warrants a side effect creates a
`SideEffectIntent` with `decided_at_vector`. After window `W` (default 5 min;
per-kind overrides: AGS 60 s, credentials 24 h) the intent is re-evaluated:
it fires only if the current vector dominates `decided_at_vector`, the
predicate still holds, and no fact for the subject arrived within the last
`W`. Otherwise it is dropped or re-armed. Firing is delegated to the home
region emitter (COM, LTI, DIO, CRD) with `intent_id` as idempotency key.

#### Scenario: At-risk flag flickers
- **WHEN** a learner crosses the at-risk threshold, then a delayed submission folds 2 minutes later and clears it
- **THEN** the intent is dropped at the end of the window and no alert is sent

#### Scenario: At-risk flag stable
- **WHEN** the threshold predicate holds for 5 minutes with no new facts for the subject
- **THEN** the alert intent is handed to the notification emitter exactly once per `intent_id`

### Requirement: The system SHALL evaluate at-risk rules configured per course, explainably, with cool-down between repeated alerts for the same subject [MVA-09]

The system SHALL evaluate at-risk rules configured per course, explainably, with cool-down between repeated alerts for the same subject.
At-risk rules are `policy.v1` content: thresholds on inactivity days, missed
deadlines, module grade, and completion rate, combined with AND/OR. Each
flag carries the rule clauses that fired and the values. A subject flagged,
recovered, and flagged again produces a new alert only after a cool-down
(default 7 days) unless a different rule fires.

#### Scenario: Explainable flag
- **WHEN** a learner is flagged
- **THEN** the instructor view shows "inactive 9 days (> 7) AND 2 missed deadlines (≥ 2)" with the vector the evaluation used

### Requirement: The system SHALL serve a learner's own progress view from their row or from the device's local derivation, marked with which one it is [MVA-10]

The system SHALL serve a learner's own progress view from their row or from the device's local derivation, marked with which one it is.
The learner API returns the LearnerRow for each enrolled `(module, cohort)`
with freshness. The device prefers its local derivation when it holds facts
the row does not (dominance check), and labels the source.

#### Scenario: Offline learner
- **WHEN** the device is offline
- **THEN** the progress view is derived locally from the device's facts and labelled "computed on this device; not yet synced: 3 items"

### Requirement: The system SHALL let an instructor request the freshest available view across regions when vectors are comparable [MVA-11]

The system SHALL let an instructor request the freshest available view across regions when vectors are comparable.
`GET …?freshest=true` reads the peer regions' headers; if one strictly
dominates the local header (row-wise check on request), it is served with
its region label; if incomparable, the local view is served with a note
listing where each region is ahead.

#### Scenario: Peer region ahead
- **WHEN** the local region lags after an outage and the peer dominates
- **THEN** the peer's rows are served, labelled with the peer region, and the local view catches up in the background

### Requirement: The system SHALL recompute a partition wholesale on key, rubric, policy or engine version change, using a new generation that readers switch to atomically per partition [MVA-12]

The system SHALL recompute a partition wholesale on key, rubric, policy or engine version change, using a new generation that readers switch to atomically per partition.
A version change enqueues a Step Functions Distributed Map over the
partition's members (concurrency 50). Rows are written under
`generation + 1`; the header is switched with a conditional write when all
rows exist; old-generation rows are deleted lazily. Readers always read the
generation named in the header.

#### Scenario: Rubric revision on a 1,500-learner cohort
- **WHEN** `rubric.v2` is published
- **THEN** recompute completes within 60 s, the header flips generation once, and readers never see a mix of generations

### Requirement: The system SHALL build tenant and course analytics from monotone header aggregates on a schedule and permit ad-hoc analysis over S3 exports [MVA-13]

The system SHALL build tenant and course analytics from monotone header aggregates on a schedule and permit ad-hoc analysis over S3 exports.
Daily rollups (active learners, completion rates, submission volumes,
lateness rates, item facility distributions) are folded from headers and
item rows into `AN#` items with their own vector digests. Ad-hoc queries run
with Athena over the Parquet exports (FLS-20), costed in ADR-016; no query
service is provisioned.

#### Scenario: Weekly engagement report
- **WHEN** the rollup runs
- **THEN** the tenant dashboard shows the week's active learners per course with the rollup's `computed_at` and the max header `max_sync_hlc` it covered

### Requirement: The system SHALL publish staleness telemetry per region [MVA-14]

The system SHALL publish staleness telemetry per region.
Metrics: fold lag (`now − max_sync_hlc` at fold), queue age, pending gap
count per partition, holes, NM recompute latency, verifier mismatches, and a
replication-lag proxy (difference between the same fact's `sync_hlc` and its
local fold time when `ingest_region ≠ self`).

#### Scenario: Replication degraded
- **WHEN** the replication-lag proxy exceeds 60 s for 5 minutes
- **THEN** an alarm fires and the UI banner switches to "cross-region sync delayed"

### Requirement: The system SHALL recompute every partition a subject touched when that subject is erased [MVA-15]

The system SHALL recompute every partition a subject touched when that subject is erased.
The updater maintains `X#<subject>` → partitions. On `erasure.v1`, each
listed partition is recomputed with the subject excluded, and its
LearnerRow deleted; ItemRow distributions are rebuilt without the subject's
contributions.

#### Scenario: Erasure request
- **WHEN** a learner is erased
- **THEN** within one hour every partition they touched has a new generation with no row for them and distributions that exclude them

### Requirement: The system SHALL serve reads region-locally with eventually consistent reads by default and strongly consistent reads on request [MVA-16]

The system SHALL serve reads region-locally with eventually consistent reads by default and strongly consistent reads on request.
`GET` views use eventually consistent reads. `?consistent=true` uses strongly
consistent reads on the regional table for flows where the caller just
wrote a fact in that region and folded it (e.g., instructor override then
refresh).

#### Scenario: Override then refresh
- **WHEN** an instructor overrides a grade and refreshes within a second
- **THEN** the client polls dominance until the row cursor includes the override's stream seq, then reads with `consistent=true`

### Requirement: The system SHALL surface holes from abandoned streams in rows and headers [MVA-17]

The system SHALL surface holes from abandoned streams in rows and headers.
Rows whose cursors advanced past an abandonment carry `has_hole = true` and
list the stream and seq; headers count holes. Exports include the flag.

#### Scenario: Abandoned device
- **WHEN** a stream is abandoned at seq 30 and later facts fold
- **THEN** the learner's row shows `has_hole = {stream, at_seq: 30}` and the header's `holes` increments

### Requirement: The system SHALL compute rankings and percentiles on read for small cohorts and from NMRows for large ones, always with the vector shown [MVA-18]

The system SHALL compute rankings and percentiles on read for small cohorts and from NMRows for large ones, always with the vector shown.
For partitions with ≤ 200 rows, rank and percentile are computed on read
from the rows (one query). Above that, from the NMRow. Either way the
response carries the vector digest the ranking corresponds to.

#### Scenario: Small cohort
- **WHEN** a 40-learner cohort's ranking is requested
- **THEN** the rows are read and ranked in the request, with the header's vector digest in the response

---

## DynamoDB access patterns

### `derived` (regional)

| Item | PK | SK | Size | Access |
|---|---|---|---|---|
| ViewHeader | `T#t#V#<module>#<cohort>` | `HDR` | ~1 KB | GetItem per view read; CAS per batch |
| LearnerRow | same | `G#<gen>#L#<subject>` | 2–4 KB | Query prefix `G#<gen>#L#` for the gradebook; GetItem for one learner; CAS per batch |
| ItemRow | same | `G#<gen>#I#<item>` | ~1 KB | Query prefix `G#<gen>#I#` |
| NMRow | same | `NM#<kind>` | ≤ 200 KB (rank list for 2,000) | GetItem; replaced wholesale |
| PendingStash | same | `P#<subject>` | small | Only when a gap exists |
| CourseView header | `T#t#VC#<course>#<cohort>` | `HDR` / `L#<subject>` | as above | Fold of module headers |
| SubjectIndex | `T#t#X#<subject>` | `P#<module>#<cohort>` | tiny | Erasure fan-out |
| SideEffectIntent | `T#t#SEI#<partition>` | `<intent_id>` | small | TTL = window × 4 |
| Analytics rollup | `T#t#AN#<course>` | `D#<yyyy-mm-dd>` | ~2 KB | Daily |
| Verifier report | `T#t#VER#<module>#<cohort>` | `<date>` | small | TTL 90 d |

**Item collection sizing.** A partition at the cohort bound (2,000 learners,
500 items): 2,000 × 4 KB + 500 × 1 KB + 200 KB ≈ 8.7 MB. Reading a full
gradebook is ~8 MB ≈ 1,100 eventually consistent RRU; instructors' reads are
rare enough (L10k: 30k/month) that this is negligible, and the API paginates
at 200 rows.

**Hot-partition risk.** The header and the Merkle root receive one write per
batch, not per fact. At the worst-case cohort burst (2,000 learners × 1
fact/s), FIFO batches of 10 give ≤ 200 header writes/s, under the 1,000
WCU/s per-partition ceiling. Beyond that, the partition's FIFO group is
sharded by subject hash (`partition#k`, k ≤ 8) and the header is split into
per-shard sub-headers folded on read. No LSIs, so split-for-heat applies.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `view-updater` | SQS FIFO `views`, group = partition, batch 10, max concurrency 200 | Rust, 1024 MB | 15 ms/fact | 20 / 60 ms | Links derivation engine; CAS writes; emits `view.updated` |
| `nm-recompute` | SQS delay queue (debounce 30 s) from `view.updated` | Rust, 1024 MB | 100–800 ms | 20 / 60 ms | Reads all rows; writes NMRow; creates intents |
| `intent-evaluator` | SQS delay queue (window ≤ 15 min) or Step Functions Wait (longer) | Rust, 512 MB | 30 ms | 20 / 60 ms | Re-checks dominance and predicate; hands off to emitters |
| `view-api` | HTTP API `GET /views/*`, `POST …/dominates` | Java 21 SnapStart, 512 MB | 20 ms | 300 / 700 ms | Pagination, freshness block, explain links |
| `partition-recompute` | Step Functions Distributed Map (per subject) | Rust, 1024 MB | 30 ms/subject | 20 / 60 ms | Generation writes |
| `view-verifier` | EventBridge Scheduler daily | Rust, 1024 MB | — | — | 1% sample |
| `analytics-rollup` | EventBridge Scheduler daily | Java 21, 1024 MB | — | — | Header folds |

## Propagation path

1. `stream-router` (FLS) → SQS FIFO `views` (group = partition).
2. `view-updater` folds, writes rows/header/Merkle, publishes `view.updated {partition, vector_digest}` to the regional EventBridge bus.
3. Rule → SQS delay (30 s debounce) → `nm-recompute` → NMRow + SideEffectIntents.
4. Intents → delay queue / Step Functions wait → `intent-evaluator` → EventBridge `effect.ready {intent_id, kind, subject}` consumed only by the home-region emitter (COM-07, LTI-11, DIO-06, CRD-06).
5. Version-change facts (CAC) → EventBridge `version.changed` → Step Functions `partition-recompute`.

## Cost model

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Fold writes | 5 M facts × 2 regions… (already both regions) ≈ 2.5 WRU/fact after batching → 12.5 M WRU ≈ **$7.8** | $780 | regional WRU |
| Fold reads | 5 M × 1 RRU ≈ **$0.6** | $60 | |
| Fold compute | 5 M × 15 ms × 1 GB = 75 k GB-s ≈ **$1.3** + 0.5 M invocations $0.1 | $140 | |
| SQS FIFO (views) | 0.5 M batched requests ≈ **$0.3** | $30 | |
| NM recompute | ~200 k runs × (50 RRU + 4 WRU + 0.4 s) ≈ **$3.5** | $350 | debounced |
| Intents and evaluator | 50 k intents ≈ **$0.2** | $20 | |
| View API | 30 k instructor reads + 300 k learner progress reads ≈ **$0.6** | $60 | |
| Recomputes | 200 partitions / month ≈ **$0.5** | $50 | |
| Verifier, rollups | ≈ **$0.5** | $30 | |
| Derived storage | ~10 GB × $0.25 ≈ **$2.5** | $250 | no PITR |
| **Total (both regions)** | **≈ $18** | ≈ $1,800 | |

## Standards conformance

Views feed OneRoster gradebook results and Caliper GradeEvents (DIO) and AGS
scores (LTI). Every projected value carries the vector digest in an extension
field so an external consumer can correlate.

## Known Tensions

1. **Staleness read as missing work.** An instructor who sees a learner's
   row without today's submission may act on it (chase, penalise). The
   mitigation is the freshness block and per-row "in transit" markers; the
   residual is human. Recommendation: the UI must not offer punitive actions
   (mark as missing, send reminder) on a row with pending streams without a
   confirmation that names the staleness.
2. **Non-monotone flags disagree across regions.** During a replication
   interruption, region A may flag a learner at-risk while B does not. Only
   the home region emits, behind the window, so at most one alert is sent;
   but instructors in the two regions see different flags. Recommendation:
   accept; the flag always shows its vector.
3. **Stability windows delay legitimate alerts.** A 5-minute window on
   at-risk alerts is harmless; a 60-second window on AGS write-back means a
   platform gradebook lags by a minute; a 24-hour window on credentials is
   a product decision. Recommendation: keep the defaults, expose them as
   tenant policy, and never allow a window of zero for an un-sendable
   effect.
4. **Header write ceiling.** A single 2,000-learner cohort under a
   synchronised deadline is close to the per-partition write ceiling for
   the header. The sharded-header fallback exists but adds read-time fold
   cost. Recommendation: keep cohorts ≤ 2,000 and prefer sub-cohorts for
   MOOC-scale enrolments (ADR-019).
