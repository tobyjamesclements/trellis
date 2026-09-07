# Trellis — Project Context

Trellis is a formative-first Learning Management System (LMS). Its feature
surface is benchmarked against Moodle; its architecture is not. Trellis runs
entirely on AWS Lambda, keeps a grow-only log of immutable facts in DynamoDB
Global Tables as its only system of record, derives everything else, and
prefers availability over consistency wherever the domain tolerates it.

This file is the shared context for every spec, change proposal and ADR in
this tree. Where a spec and this file disagree, this file is wrong and must be
fixed; specs do not silently override it.

---

## 1. Product context

### 1.1 What Trellis is for

Trellis supports **formative learning**: frequent, low-stakes practice with
immediate feedback, instructor visibility of cohort progress, and the
administrative scaffolding an institution needs around that (rostering,
gradebook export, credentials, interoperability with the tools it already
uses). The learner's device is a first-class replica: learners work offline,
mark their own work locally, and sync when they can.

### 1.2 What Trellis is not

- **Not a summative assessment platform.** High-stakes, proctored, or
  identity-assured examinations are an explicit non-goal. No lockdown
  browser, no proctoring integration, no Byzantine-resistant marking.
- **Not a strongly consistent system.** Trellis never rejects work to
  protect an invariant. It accepts, records, derives, and reconciles.
- **Not a plugin platform.** Extension is through the 1EdTech standards
  surface (LTI, OneRoster, Caliper, CC, QTI, CASE, Open Badges) and
  webhooks, not an in-process plugin API.

### 1.3 Users and roles

| Role | Description | Typical device posture |
|---|---|---|
| Learner | Enrolled participant; produces the overwhelming majority of facts | Offline-capable PWA, often intermittently connected |
| Instructor | Editing teacher: authors content, marks, sees cohort views | Mostly online; may mark offline |
| Tutor | Non-editing teacher: marks and views, cannot author | As instructor |
| Course designer | Authors courses without teaching a cohort | Online |
| Observer | Parent/mentor with read access to a learner's derived state | Online |
| Tenant admin | Manages a tenant: users, courses, integrations, policies | Online |
| Platform operator | Runs the multi-tenant service | Online, with runbooks |
| Guest | Unauthenticated access to explicitly open content | Online |

### 1.4 Moodle capability baseline

Moodle's feature surface defines what an LMS must do. The table records how
Trellis covers each area and which spec owns it. "Derived" means the feature
is a materialisation over facts rather than stored state.

| Moodle area | Trellis coverage | Owning spec |
|---|---|---|
| Courses, categories, formats (topics/weekly) | In scope; course structure is an operation log | course-authoring-and-content |
| Sections, resources (page, file, folder, URL, book, label) | In scope; content-addressed blobs in S3 | course-authoring-and-content |
| Question bank, question types, question versions | In scope as QTI 3.0 item bank; versions are `key_version` | course-authoring-and-content |
| Quiz (attempts, grading method, shuffle, review options, time limit) | In scope; marking client-side; time limits advisory; review options are key-visibility policies | activities-and-assessment |
| Assignment (files, online text, due dates, extensions, marking workflow, rubrics, feedback) | In scope; all as facts; due dates advisory | activities-and-assessment |
| Workshop (peer assessment) | In scope (phase 2); allocation is reconciled, not enforced | activities-and-assessment |
| Choice / Feedback / Survey | In scope; slot caps overbook-and-reconcile | activities-and-assessment |
| Lesson (branching) | Partial via QTI 3.0 test branch rules | activities-and-assessment |
| SCORM | Out of scope. SCORM runtime (1.2/2004 API, CMI model) is stateful and mutable; deliver SCORM packages through an external LTI player | — |
| H5P | Out of scope natively; via LTI tool | lti-interop |
| Wiki, Glossary, Database | Out of initial scope; collaborative documents are a CRDT problem deferred to a later change | — |
| Forum (types, subscriptions, digests, ratings) | In scope; threads are derived views over post facts | communication-and-forums |
| Messaging, notifications | In scope; all sends are gated side effects | communication-and-forums |
| Gradebook (categories, aggregation, scales, letters, overrides, history) | In scope; entirely derived; overrides and history are facts | derivation-engine, materialised-views-and-analytics |
| Completion tracking, activity restrictions (conditional access) | In scope; evaluated client-side as advisory predicates over facts | activities-and-assessment |
| Groups, groupings | In scope as cohorts and sub-cohorts (the view partition unit) | identity-and-enrolment |
| Enrolment methods (manual, self, cohort sync, LTI, SIS) | In scope; caps not enforced | identity-and-enrolment |
| Roles, capabilities, permissions | In scope; role facts, checked at API and client | identity-and-enrolment |
| Badges | In scope as Open Badges 3.0 / CLR 2.0 | credentialing-and-competencies |
| Competencies, learning plans | In scope via CASE 1.0 frameworks; mastery is non-monotone | credentialing-and-competencies |
| Calendar | Derived from deadline facts; in scope | activities-and-assessment |
| Dashboard, blocks, reports, analytics (at-risk) | Derived views with visible staleness | materialised-views-and-analytics |
| Logs, grade history | The fact log itself, plus Caliper projection | fact-log-and-sync, data-interop |
| Backup/restore, course copy | CC 1.3 export/import; fact export to S3 | data-interop, administration-and-tenancy |
| LTI (consumer and provider) | In scope; platform and tool roles, Advantage services | lti-interop |
| IMS Common Cartridge | In scope; import 1.1–1.3 and Thin CC; export 1.3 and Thin CC | data-interop |
| Web services / external API | In scope through OneRoster 1.2, Edu-API, and a Trellis REST API | data-interop |
| Site administration, multi-tenancy | Native multi-tenancy; admin console | administration-and-tenancy |
| Privacy (GDPR data export/erasure) | In scope; erasure by crypto-shredding | administration-and-tenancy |
| Mobile app | PWA with offline replica; native wrappers optional | activities-and-assessment |
| Themes, filters | Minimal theming; content filters out of scope | course-authoring-and-content |
| Plagiarism, proctoring, attendance | Out of scope natively; LTI tools where they exist | — |
| xAPI / LRS | Out of initial scope; Caliper 1.2 is the analytics surface. An xAPI projection is a candidate later change | data-interop |

---

## 2. Principles

These are ordered. When two conflict, the earlier one wins.

1. **Never reject learner work.** Late, duplicate, out-of-order, over-cap,
   or from a stale client: accept it, stamp it, flag it, derive over it.
2. **Facts, not state.** Anything that can be expressed as an immutable fact
   appended to the log is. Mutable items exist only as derived, region-owned
   materialisations that can be thrown away and recomputed.
3. **Derive, do not store.** Marks, grades, completion, rankings, at-risk
   flags, thread trees, gradebooks, rosters-as-seen-by-a-tool: all functions
   of the fact set. A change to a function (rubric, key, policy) re-derives;
   it never migrates stored values.
4. **Availability over consistency.** Every region serves reads and accepts
   writes on its own. Cross-region agreement is achieved by convergence
   (union of facts) and proved by version vectors, never by coordination.
5. **Design inside DynamoDB Global Tables, not around them.** Last-writer-
   wins per item, no cross-region transactions, no cross-region conditional
   writes, no global uniqueness. Any item that two regions could write with
   different content is a design error.
6. **Overbook and reconcile.** Numeric and uniqueness invariants are not
   enforced. Each one has a named reconciliation and apology workflow.
7. **Side effects are gated.** Anything that cannot be un-done (an email,
   an AGS score post, a badge, a SIS push) is emitted once, from one region,
   behind a stability window when its trigger is non-monotone.
8. **Staleness is visible, never hidden.** Every derived view carries the
   version vector it was computed at, and the UI shows what that means.
9. **Cost scales with use, and idle costs nothing.** No provisioned
   capacity, no warm pools, no always-on services. Long-tail usage with
   deadline bursts is the design load.
10. **Standards at the edge, facts in the middle.** Inbound standard
    payloads become facts. Outbound standard payloads are projections of
    derived state, emitted from the tenant's home region.

---

## 3. Architectural constraints (non-negotiable)

| Constraint | Consequence |
|---|---|
| Compute: AWS Lambda only | No containers, no EC2, no Fargate, no persistent compute. Step Functions only where orchestration is genuinely needed (long waits, distributed maps). |
| System of record: DynamoDB Global Tables, multi-region multi-active | One global table per residency zone. Items are immutable or region-owned. |
| Blobs: S3 | Content-addressed keys; bi-directional cross-region replication; CloudFront origin-group failover. |
| Propagation: EventBridge, DynamoDB Streams, SQS | Streams drive derivation; SQS FIFO serialises per partition; EventBridge carries domain events between capabilities. |
| No RDS, ElastiCache, OpenSearch | Each is rejected in ADR-016 with a cost argument. Athena over S3 exports is permitted for ad-hoc analytics (ADR-016) because it is pay-per-query with no idle cost. |
| Global Tables semantics honoured | LWW per item by arrival; no cross-region transactions or conditional writes; no global uniqueness. |

### 3.1 Stated assumptions (inline, so the design can proceed)

- **A1. Implementation languages.** The repository carries a Maven
  `.gitignore`, so service Lambdas are assumed to be Java 21 with SnapStart
  enabled. The derivation engine is a single Rust crate compiled to WASM for
  devices and to a native Lambda for the server, so client and server marking
  are one implementation. ADR-001 records cold-start budgets and permits a
  Rust implementation of any service function that misses its budget.
- **A2. Regions and residency zones.** Tenants belong to exactly one
  residency zone. A zone is two or three AWS regions replicated by one
  global table. Reference zones: `eu` = {eu-west-1, eu-central-1},
  `us` = {us-east-1, us-west-2}. Cost models assume two active regions.
- **A3. Cohort size bound.** A cohort (the view partition unit together with
  a module) holds at most 2,000 learners. Larger enrolments are split into
  sub-cohorts automatically (ADR-019).
- **A4. Fact size.** Average 1 KB, p99 4 KB. Bodies over 4 KB are stored in
  S3 and referenced by hash.
- **A5. Client.** A progressive web app with an IndexedDB replica and a
  service worker. Native wrappers are packaging, not architecture.
- **A6. DynamoDB Streams and replication.** Writes replicated into a region
  by Global Tables appear in that region's stream. Change 001 includes a
  spike to verify this; the fallback is a cross-region EventBridge fan-out.
- **A7. Load profile L10k.** See §6. All cost models use it.

---

## 4. The consistency model (canonical definitions)

Specs reference these terms without redefining them.

### 4.1 Facts

A **fact** is an immutable record appended by a **writer** (a device acting
for a principal) about a **subject** (usually a learner) within a **scope**
(a module or a pseudo-module such as `_enrol`, `_profile`, or a course's
`_struct`). Its identity is content-addressed:

```
fact_id = "f_" + base32(SHA-256(canonical_cbor(body_and_metadata)))[0:26]
```

The tuple in the brief, `(learner, item, attempt_n, response, hlc_timestamp,
key_version)`, is the body of a `resp` fact. Every fact also carries
`(tenant, subject, scope, writer_device, seq, device_hlc, refs[])`, and on
ingest the region adds the non-content envelope `(sync_hlc, ingest_region,
late, claimed_on_time, skew_ms)`.

**Streams and sequences.** Each `(writer_device, subject, scope)` triple is a
stream. The writer assigns a dense, monotone `seq` per stream, durably, in the
same local transaction that stores the fact. Density is what makes a version
vector a proof rather than a hint.

**Union is the merge.** Two replicas of the fact set are merged by set union.
Because every fact is its own DynamoDB item, keyed by a value only its writer
can produce, and its plaintext content is immutable, last-writer-wins never
adjudicates between two different values. Ciphertext may differ between
regions; plaintext meaning may not.

**Retraction.** A `void` fact names a target `fact_id`. A fact is *effective*
if no effective void targets it. Voids of voids re-enable. The reference
graph is acyclic by construction because a fact can only reference hashes
that already exist.

### 4.2 Hybrid logical clock (HLC)

`hlc` is a 64-bit value: 48 bits of physical milliseconds since the Unix
epoch, 16 bits of logical counter, rendered as 16 lowercase hex characters so
that string order is numeric order. Node identity travels separately. Devices
stamp `device_hlc`; the ingesting region stamps `sync_hlc` as
`max(now_ms, last_issued_in_this_execution_environment + 1)`. Device clocks
are untrusted: the server never lets a device value advance its own clock.

### 4.3 Deadlines

Deadlines are advisory. A fact arriving after a deadline is stamped `late`
(by `sync_hlc`) and `claimed_on_time` (by `device_hlc`), never rejected. The
derivation engine applies the course lateness policy (`arrival`, `claimed`,
or `grace(duration)`, default `grace(24h)`) together with any `extension`
facts.

### 4.4 Derived state

Derived state is any item whose value is a function of a fact set. It lives
in the **regional derived table**, never in the global table. Each region
derives independently from its own replica. Derived items carry the
**version vector** they were computed at.

### 4.5 Version vectors and partitions

A **partition** is `(tenant, scope, cohort)`, usually written
`(module, cohort)`. The version vector of a view over a partition maps each
stream `(writer_device, subject)` with `scope = module` and
`subject ∈ members(cohort)` to the highest **contiguous** `seq` folded in.
A view at vector `V'` is at least as fresh as one at `V` iff `V'` dominates
`V` component-wise. Vectors are cursors: the difference `V' − V` names
exactly the facts to fold to move from one to the other.

### 4.6 Merkle summaries

Each region maintains, per partition, a hash-prefix trie over the `fact_id`s
it has folded, with an additive (LtHash-style) set digest at each node so
that inserts are O(depth) without reading siblings. Two regions compare
roots, descend on mismatch, and repair by pulling missing facts by
`fact_id`. This is anti-entropy for the fact set, not for derived state,
which is recomputable.

### 4.7 Monotone and non-monotone derivations

A derivation is **monotone** if adding facts can only extend it (counts,
sums, max-by-HLC, set membership). Monotone derivations are folded
incrementally and are safe to merge. **Non-monotone** derivations (rank,
percentile, at-risk thresholds, "top N", mastery over a threshold) are
recomputed over the union at a vector and are never merged across replicas.

### 4.8 Stability windows and egress

A side effect fired from a non-monotone predicate is enqueued with the
vector it was decided at and sent only after the predicate has held for the
window `W` (default 5 minutes for notifications, 60 seconds for AGS score
posts, 24 hours for credential issuance) with no new facts for the affected
subject. All external side effects are emitted only from the tenant's
**home region**, recorded in a region-owned **sent ledger** in the global
table under an idempotency key.

### 4.9 Invariants that are not enforced

Enrolment caps, seat and slot limits, one-submission-per-item, unique
usernames and emails, unique client_ids, once-only nonces, single badge
issuance. Each has a reconciliation workflow specified in its owning spec
and listed in `tradeoffs.md`.

---

## 5. Physical architecture (shared)

### 5.1 Tables

| Table | Scope | Contents | Backup |
|---|---|---|---|
| `facts` | One global table per residency zone | All facts, sent ledgers, key registry, tenant configuration facts | PITR 35 days + monthly S3 export |
| `derived` | One regional table per region | Views, rosters, Merkle tries, indexes, outboxes, caches, nonces (TTL) | None; recomputable |
| `registry` | One global table replicated to every region of every zone | Hostname → tenant → zone, region sets, home-region assignment, feature flags | PITR |

Key conventions: `PK` and `SK` are strings. Every key begins with the tenant
prefix `T#<tenant_id>` except registry items. Fact items:

```
PK = T#<tenant>#S#<subject_kind>#<subject_id>      e.g. T#t_01H…#S#L#usr_01H…
SK = F#<scope>#<writer_device>#<seq10>              e.g. F#mod_01H…#dev_01H…#0000000042
```

No local secondary indexes anywhere (they cap item collections at 10 GB and
block split-for-heat). No GSI on `facts` in the initial build (see
fact-log-and-sync §DynamoDB).

### 5.2 Compute and propagation

```
device ──HTTPS──▶ Route 53 (latency) ─▶ API Gateway HTTP API (regional) ─▶ Lambda
                                                                          │
                                                       PutItem (conditional, region-local)
                                                                          ▼
                                        facts (global table) ──replication──▶ other regions
                                                │ DynamoDB Stream (per region)
                                                ▼
                                   stream-router Lambda (batch, filtered)
                                     │                       │
                          SQS FIFO (group = subject)   SQS FIFO (group = partition)
                                     ▼                       ▼
                         roster-updater Lambda        view-updater Lambda ──▶ derived (regional)
                                                             │
                                                    EventBridge (regional bus)
                                          ┌──────────────────┼────────────────────┐
                                          ▼                  ▼                    ▼
                                  notifications        interop egress        credential issuance
                                  (home region)        (home region)          (home region)
```

Step Functions Standard is used for: enrolment-cap reconciliation (waits up
to 24 h for an instructor decision), credential issuance (stability wait),
bulk re-derivation (Distributed Map over learners), Common Cartridge and
OneRoster CSV import, tenant provisioning, and home-region failover.

### 5.3 Lambda defaults

| Property | Default |
|---|---|
| Runtime | Java 21, SnapStart on, for API and integration functions; Rust on `provided.al2023` for the derivation engine and the hot path (view updater, NM recompute, intent evaluator, partition recompute, anti-entropy, structure updater) |
| Architecture | x86_64 for cost modelling; arm64 where SnapStart supports it (verify per runtime) |
| Memory | 1024 MB sync/launch paths, 512 MB read paths, 1024 MB view updater |
| Provisioned concurrency | None |
| Cold start budget | Java+SnapStart p50 ≤ 400 ms, p99 ≤ 900 ms; Rust p99 ≤ 60 ms |
| Logging | Structured JSON, sampled at 10% for success paths, 100% for errors |

---

## 6. Load profile L10k (basis for all cost models)

Per month, for a tenant with 10,000 active learners, two active regions.

| Quantity | Value | Notes |
|---|---|---|
| Learner sessions | 300,000 | 30 per learner |
| Response facts | 2,000,000 | 200 item attempts per learner |
| Other facts | 500,000 | progress, forum, marking, enrolment, structure |
| Total facts | 2,500,000 | avg 1 KB, p99 4 KB |
| Sync calls | 600,000 | ~4 facts per call |
| API read calls | 6,000,000 | 600 per learner |
| Instructors | 300 | 1:33 |
| Cohort view reads | 30,000 | 100 per instructor |
| Courses / modules / cohorts | 50 / 500 / 100 | ~1,000 active partitions |
| Content delivered | 500 GB | 50 MB per learner; video is external |
| Emails | 150,000 | 15 per learner, incl. magic links |
| Deadline burst | 20% of facts in 1% of the month | ~10 facts/s tenant-wide; per-cohort peak ~5 facts/s |

A **scale-out column** in each cost model shows 1,000,000 active learners
(100×) to expose non-linearities and hot-partition risk.

### 6.1 Unit prices used (USD, us-east-1, on-demand, mid-2025)

| Item | Price |
|---|---|
| DynamoDB write request unit (regional table) | $0.625 / M |
| DynamoDB replicated write request unit (global table, charged in every region) | $0.9375 / M |
| DynamoDB read request unit | $0.125 / M (eventually consistent reads cost half a unit) |
| DynamoDB storage | $0.25 / GB-month; PITR $0.20 / GB-month |
| DynamoDB Streams read by Lambda | free |
| Lambda | $0.20 / M requests; $0.0000166667 / GB-s (x86) |
| API Gateway HTTP API | $1.00 / M requests |
| SQS FIFO | $0.50 / M requests (batched 10) |
| EventBridge custom events | $1.00 / M; Scheduler $1.00 / M |
| Step Functions Standard | $25 / M state transitions; Express $1 / M + duration |
| S3 | $0.023 / GB-month; PUT $0.005 / k; GET $0.0004 / k; inter-region transfer $0.02 / GB |
| CloudFront | first 1 TB / month and 10 M requests free; then ~$0.085 / GB |
| SES | $0.10 / k emails |
| KMS | $1 / key-month per region; $0.03 / 10k requests |
| Route 53 | $0.50 / zone-month; $0.60 / M latency queries; $0.50 / health check |
| CloudWatch Logs | $0.50 / GB ingested |

Prices move; the models are order-of-magnitude and the ratios matter more
than the totals.

---

## 7. Conventions in this tree

- **Requirement headers** read `### Requirement: The system SHALL … [XXX-nn]`.
  The bracketed ID is stable and is what change proposals reference.
- **Scenarios** use `#### Scenario:` with `- **WHEN**` / `- **THEN**`
  (and `- **AND**`) bullets. Every requirement has at least one.
- **Every capability spec** contains, in this order: Purpose; Consistency
  boundary; Domain model; Requirements; DynamoDB access patterns; Lambda
  invocation shape and cold-start profile; Propagation path; Cost model
  (L10k and 1M); Standards conformance (if any); Known Tensions.
- **Change proposals** under `openspec/changes/` list the requirement IDs
  they deliver in a `## Requirements delivered` section. The delta specs
  under each change's `specs/` directory are generated from the canonical
  specs by `openspec/tools/gen-deltas.py`; do not hand-edit them. This is the
  one deviation from stock OpenSpec practice: because this is the initial
  build, the canonical specs are authored directly and the deltas are
  projections of them.
- **ADRs** live in `openspec/adr/` and are referenced as `ADR-nnn`.
- **The trade-off register** is `openspec/tradeoffs.md`; the consolidated
  **Known Tensions** document is `openspec/known-tensions.md`; the
  **standards conformance matrix** is `openspec/standards-conformance.md`.
- Key layouts are written as `PK = …`, `SK = …` with `<placeholders>`.
  Numbers with `10` suffix (e.g. `seq10`) are zero-padded to that width.

---

## 8. Glossary

| Term | Definition |
|---|---|
| Fact | Immutable, content-addressed record appended to the log. The only thing Trellis stores as authority. |
| Fact log / fact set | The grow-only set of facts for a tenant. Union is the merge. |
| Subject | The principal a fact is about. Usually a learner; may be a course (structure facts) or tenant (config facts). |
| Writer | The device that produced a fact, acting for an authenticated principal. |
| Stream | The dense sequence of facts from one `(writer_device, subject, scope)`. |
| Scope | The derivation scope a fact belongs to: a module, or a pseudo-module (`_enrol`, `_profile`, `_struct`, `_forum#<id>`, `_msg`). |
| Module | A section of a course that forms one derivation unit; a course with no explicit modules has one implicit module. |
| Cohort | A set of learners taking a course together; at most 2,000 members. The view partition unit with module. |
| Partition | `(tenant, module, cohort)`; the unit of materialised views, version vectors and Merkle summaries. |
| HLC | Hybrid logical clock value; see §4.2. `device_hlc` is claimed, `sync_hlc` is stamped. |
| Void | A fact retracting another. The only retraction mechanism. |
| Effective fact | A fact not targeted by an effective void. |
| Derived state / view | Any item computed from facts; regional, recomputable, vector-stamped. |
| Version vector | Per partition, the map `stream → highest contiguous seq folded`. |
| Dominance | `V' ≥ V` component-wise; proves `V'` includes everything `V` does. |
| HWM | High-water mark: the highest contiguous seq seen for a stream in a region. |
| Merkle summary | Per-partition, per-region hash-prefix trie with additive digests. |
| Monotone / non-monotone | Whether adding facts can only extend a derivation; see §4.7. |
| Stability window | The period a non-monotone predicate must hold before a side effect fires. |
| Home region | The one region in a tenant's zone that emits external side effects. Flippable by registry fact. |
| Sent ledger | Region-owned, immutable global-table items recording emitted side effects by idempotency key. |
| Residency zone | A set of regions sharing one global table; a tenant's data never leaves its zone. |
| Key version | Content hash of an item's answer key and response processing; recorded on every response fact. |
| Rubric version | Content hash of a rubric or marking guide; recorded on every human marking fact. |
| Derivation engine | The versioned pure function library that turns facts into marks, grades, completion and feedback. Runs on device (WASM) and server (Lambda). |
| Apology workflow | The specified reconciliation and communication path for an invariant that was allowed to be violated. |
| Epoch | A monotone counter on a tenant's interop endpoints; a change tells external consumers to do a full resync. |
| L10k | The reference load profile in §6. |

---

## 9. Document map

```
openspec/
  project.md                       this file
  README.md                        how to navigate and validate the tree
  standards-conformance.md         per-standard conformance matrix
  known-tensions.md                where the model breaks, options, recommendations
  tradeoffs.md                     consolidated trade-off register
  cost-summary.md                  roll-up of the per-capability cost models
  adr/ADR-001 … ADR-022            load-bearing decisions
  specs/
    fact-log-and-sync/             FLS  the grow-only set and the device sync protocol
    derivation-engine/             DRV  marks, grades, completion as pure functions
    materialised-views-and-analytics/ MVA region-owned views, vectors, staleness, at-risk
    identity-and-enrolment/        IDE  principals, sessions, enrolment, caps, roles
    course-authoring-and-content/  CAC  structure ops, blobs, QTI items, keys, publishing
    activities-and-assessment/     ACT  attempts, submissions, client marking, deadlines
    communication-and-forums/      COM  forums, messages, notifications
    lti-interop/                   LTI  LTI 1.3, Advantage, Dynamic Registration
    data-interop/                  DIO  OneRoster, Caliper, Common Cartridge, Edu-API
    credentialing-and-competencies/ CRD CASE, Open Badges 3.0, CLR 2.0
    administration-and-tenancy/    ADM  tenants, zones, failover, retention, erasure, cost
  changes/
    001-platform-foundation … 012-administration-and-compliance
  tools/gen-deltas.py              generates change delta specs from canonical specs
  tools/check-tree.py              structural and cross-reference checks
  tools/shall-body.py              keeps the SHALL statement on each requirement's first body line
```
