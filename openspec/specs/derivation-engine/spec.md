# Derivation Engine Specification

Capability ID prefix: **DRV**

## Purpose

The derivation engine is the pure, versioned function library that turns a
fact set into marks, feedback, attempt outcomes, lateness, gradebook
aggregates, completion and availability predicates. It is one TypeScript
implementation executed in two places: in a Web Worker on the learner's
device (immediate, offline marking) and under GraalJS inside the Java
Lambdas on the server (views, interop, re-derivation), per ADR-001. It
stores nothing. Every output it produces is reproducible from the facts and
the versions it was given.

## Consistency boundary

A derivation is a deterministic function of `(fact set at vector V,
key_version, rubric_version, policy_version, engine_version)`. Two replicas
holding the same facts and versions produce byte-identical outputs. There is
no state to reconcile; there are only inputs to converge. This is the
property that lets marks be derived rather than stored, and lets a rubric
change re-derive rather than migrate.

## Domain model

```
Inputs
  facts[]           effective facts for (subject, scope) ordered by (sync_hlc, fact_id)
  item(key_version) QTI 3.0 item XML + response processing + correct responses + mapping
  rubric(rubric_version)
  policy(policy_version)  { attempts: best|latest|first|mean|highest_n(n),
                            key_change: at_attempt|current|best_of,
                            lateness: arrival|claimed|grace(dur), penalty: {per_day, cap},
                            aggregation: {categories, weights, drop_lowest, scale, letters},
                            markers: latest|mean|designated(principal),
                            epoch_hlc?: hlc16 }
  engine_version    semver of the engine build
Outputs
  ItemOutcome  { subject, item, attempts[], score: Decimal, max: Decimal, status,
                 late, penalty_applied, provenance }
  ModuleGrade  { subject, module, score, max, letter?, breakdown[], provenance }
  Completion   { subject, module, activities: {id → complete|incomplete}, module_complete }
  Availability { subject, activity → available|locked(reason) }
  Feedback     { subject, item, attempt_n → [feedback blocks] }
  provenance   { engine_version, key_version, rubric_version, policy_version,
                 vector, fact_ids_used[] }
```

Scores are exact decimals (`Decimal128`, scale ≤ 6). Rounding happens only at
presentation, by the tenant's rounding policy.

---

## Requirements

### Requirement: The system SHALL derive every mark from response facts and versioned keys, rubrics and policies, and never store a mark as authority [DRV-01]

The system SHALL derive every mark from response facts and versioned keys, rubrics and policies, and never store a mark as authority.
`mark = f(response, key_version, rubric_version, policy_version,
engine_version)`. No table holds a mark that is not a cache of `f`. Any
stored mark is a derived item stamped with the versions and vector it came
from, and is overwritten by re-derivation without migration.

#### Scenario: Answer key corrected after attempts
- **WHEN** an editor publishes `key.v2` for an item that 300 learners have already answered
- **THEN** every affected partition is re-derived under the course `key_change` policy
- **AND** no stored mark is edited in place; the previous derived rows are replaced by new rows carrying `key_version = v2` (or `best_of`) in provenance

#### Scenario: Stored mark is only a cache
- **WHEN** an operator deletes every derived row for a partition
- **THEN** the next fold or recompute regenerates rows identical to those deleted, at the same vector

### Requirement: The system SHALL ship one engine implementation to both device and server and record its version on every output [DRV-02]

The system SHALL ship one engine implementation to both device and server and record its version on every output.
The engine is a single TypeScript package (`@trellis/engine`, strict mode,
no DOM or Node dependencies). The client runs it in a Web Worker. The
server embeds the same built bundle in every engine-hosting Java Lambda and
executes it with GraalJS through the polyglot API; the polyglot context is
created at initialisation so SnapStart snapshots it warm, and the Graal
compiler is enabled through JVMCI where measured throughput requires it. A
golden-vector suite (≥ 500 items across all supported interactions, plus
rounding, mapping, lateness, attempt and aggregation policies) must pass
identically on V8, SpiderMonkey, JavaScriptCore and GraalJS before release.
`engine_version` appears in every derived row and in the client's
`client_mark` hint.

#### Scenario: Release gate
- **WHEN** a build's outputs differ between any browser engine and GraalJS on any golden vector
- **THEN** the release pipeline fails and nothing is deployed

#### Scenario: Server execution
- **WHEN** the view updater folds a response fact
- **THEN** it calls the engine bundle through the snapshotted GraalJS context and records the bundle's `engine_version` in the row's provenance

#### Scenario: Mixed versions in the field
- **WHEN** a device runs engine 1.4 and the server runs 1.5
- **THEN** the server derives with 1.5, records it, and counts a `client_mark` mismatch metric when the device's hint differs; the learner's displayed mark converges on next sync

### Requirement: The system SHALL be deterministic: no wall-clock, locale, randomness or floating-point dependence in any derivation [DRV-03]

The system SHALL be deterministic: no wall-clock, locale, randomness or floating-point dependence in any derivation.
All arithmetic is decimal or rational through a pure-TypeScript decimal
library; IEEE-754 doubles never carry a score. Time enters only as fact HLCs
and policy deadlines. Randomised QTI features (shuffle, template variables)
are seeded from `(subject, item, attempt_n, key_version)` with a
ChaCha20-based generator implemented in the engine, so the same attempt
re-derives with the same seed. Ordering is by `(sync_hlc, fact_id)`. The
engine's ECMAScript subset is enforced by lint: no `Math` transcendental or
rounding functions, no `Intl`, no `Date`, no `Map`/`Set` iteration-order
dependence on insertion of non-string keys, only stable sorts with explicit
comparators, no regular-expression features that differ between engines.

#### Scenario: Recompute equals fold
- **WHEN** a partition is recomputed from scratch at the same vector as an incrementally folded view
- **THEN** every derived row is byte-identical excluding the `computed_at` timestamp

#### Scenario: Template variable reproducibility
- **WHEN** an item uses QTI template processing to generate numbers
- **THEN** the learner's attempt 3 shows the same values on device, on the server, and on re-derivation a year later

### Requirement: The system SHALL execute QTI 3.0 response processing for the supported interaction and operator subset and classify items outside it [DRV-04]

The system SHALL execute QTI 3.0 response processing for the supported interaction and operator subset and classify items outside it.
Supported: standard templates (`match_correct`, `map_response`,
`map_response_point`) and custom `responseProcessing` using the deterministic
operator subset listed in `qti-profile.md` (logical, comparison, arithmetic,
string, container, `mapResponse`, `member`, `index`, `random*` seeded per
DRV-03). Template processing and test-level outcome processing are
supported. Unsupported constructs mark the item `marking = server_or_human`
at publish time (CAC-08) so the client does not attempt them.

#### Scenario: Custom response processing within subset
- **WHEN** an item's `responseProcessing` uses `and`, `match`, `mapResponse` and `setOutcomeValue`
- **THEN** the device marks it immediately and the server derives the same score

#### Scenario: Unsupported operator
- **WHEN** an imported item uses an operator outside the subset
- **THEN** publishing flags the item `marking = server_or_human`, the device shows "marked after sync", and no client mark is produced

### Requirement: The system SHALL apply the course key-change policy when the key version at attempt differs from the current key [DRV-05]

The system SHALL apply the course key-change policy when the key version at attempt differs from the current key.
Policies: `at_attempt` (score under the key the learner saw), `current`
(score under the newest key), `best_of` (the higher of the two). Default is
`best_of`. The chosen `key_version` is recorded in provenance. Rubric
changes do not rescore human marks; they flag the outcome
`marked_under_previous_rubric` for re-marking (DRV-08).

#### Scenario: best_of after a fix
- **WHEN** an item's key is corrected and a learner scored 0 under v1 and 1 under v2
- **THEN** the derived score is 1 with provenance `key_version = v2, policy = best_of`

#### Scenario: at_attempt policy
- **WHEN** the course sets `key_change = at_attempt`
- **THEN** the same learner's score stays 0 with provenance `key_version = v1`

### Requirement: The system SHALL aggregate multiple attempts per policy and tolerate duplicate attempt numbers [DRV-06]

The system SHALL aggregate multiple attempts per policy and tolerate duplicate attempt numbers.
Attempts are grouped by `attempt_n`; duplicates at the same `attempt_n` from
different streams are ordered by `(sync_hlc, fact_id)` and both retained; the
policy then applies across all attempts (`best`, `latest`, `first`, `mean`,
`highest_n(n)`). One-submission-per-item is not enforced anywhere; a policy
of `first` reproduces its effect in derivation.

#### Scenario: Two devices claim attempt 2
- **WHEN** a learner submits attempt 2 from a laptop and, offline, attempt 2 from a phone
- **THEN** both are effective; under `best` the higher scores; under `first` the earlier `sync_hlc` scores
- **AND** the outcome carries `duplicate_attempts = [2]` for the instructor view

#### Scenario: Unlimited attempts by default
- **WHEN** a formative quiz has no attempt limit and a learner makes 40 attempts
- **THEN** all 40 fold and the policy result is derived across them

### Requirement: The system SHALL derive lateness and penalties from facts, extensions and policy, never from the ingest stamp alone [DRV-07]

The system SHALL derive lateness and penalties from facts, extensions and policy, never from the ingest stamp alone.
Effective deadline = published `deadline.v1` for `(activity, cohort)` +
latest effective `extension.v1` for the subject. Lateness under `arrival`
uses `sync_hlc`; `claimed` uses `device_hlc`; `grace(d)` treats a fact as
on time if `device_hlc ≤ deadline` and `sync_hlc ≤ deadline + d`. Penalties
are a derivation (`per_day`, `cap`) applied to the attempt score.

#### Scenario: Offline submission synced next morning
- **WHEN** `device_hlc` is before the deadline and `sync_hlc` is 9 hours after it, under `grace(24h)`
- **THEN** the attempt is on time and no penalty applies

#### Scenario: Extension folded late
- **WHEN** an extension fact arrives after the view has marked an attempt late
- **THEN** the next fold re-derives the outcome as on time with the extension's `fact_id` in provenance

### Requirement: The system SHALL derive human-marked outcomes from marking facts with rubric versions and a marker-resolution policy [DRV-08]

The system SHALL derive human-marked outcomes from marking facts with rubric versions and a marker-resolution policy.
`mark.v1 { attempt_ref, rubric_version, criteria: [{id, level, points,
comment}], total? }`. With several markers, policy `latest` (by HLC),
`mean`, or `designated(principal)` resolves. A `rubric.v2` after marks
under v1 flags outcomes `marked_under_previous_rubric`; the marking queue
view lists them; scores are not changed until a v2 mark exists.

#### Scenario: Two tutors mark the same essay
- **WHEN** two `mark.v1` facts exist for one attempt under policy `mean`
- **THEN** the derived score is the mean of the totals and provenance lists both fact_ids

#### Scenario: Rubric revised mid-marking
- **WHEN** the rubric version changes after 40 of 100 essays are marked
- **THEN** those 40 outcomes carry `marked_under_previous_rubric = true` and appear in the re-mark queue; their scores remain

### Requirement: The system SHALL treat grade overrides as facts that win in derivation while preserving the derived value alongside [DRV-09]

The system SHALL treat grade overrides as facts that win in derivation while preserving the derived value alongside.
`override.v1 { scope_ref (item|activity|module), value, reason }`. Final =
latest effective override if present, else derived. Both are shown; the
override's author and reason are provenance. Voiding the override restores
the derived value.

#### Scenario: Override then key fix
- **WHEN** an instructor overrides a learner's quiz score and the key is later corrected
- **THEN** the final remains the override; the derived value updates underneath and the UI shows "override 7/10 (derived 8/10)"

### Requirement: The system SHALL compute gradebook aggregates from versioned policy facts [DRV-10]

The system SHALL compute gradebook aggregates from versioned policy facts.
Categories, weights, drop-lowest, extra credit, hidden and excluded items,
scales and letter boundaries are `policy.v1` content. A policy change
re-derives; aggregates carry `policy_version`. Aggregation is sum, weighted
mean, or simple weighted mean per category, with `Decimal` arithmetic and
documented handling of empty categories (excluded, not zero, by default).

#### Scenario: Weight change
- **WHEN** the quizzes category weight changes from 30% to 40%
- **THEN** every module grade in affected cohorts is re-derived and stamped with the new `policy_version`; no stored total is edited

### Requirement: The system SHALL derive completion and availability as non-sticky predicates evaluated over the current fact set [DRV-11]

The system SHALL derive completion and availability as non-sticky predicates evaluated over the current fact set.
Completion conditions (viewed, submitted, score ≥ threshold, manual
`progress.v1`) and availability conditions (date, completion of another
activity, grade, cohort) are evaluated by the engine. They are not sticky: a
voided submission can un-complete an activity. Availability is advisory: the
server never withholds content on an availability predicate; the client
hides or shows it (ACT-11).

#### Scenario: Completion undone by a void
- **WHEN** a learner voids the submission that completed an activity
- **THEN** the activity derives `incomplete` and dependent availability re-evaluates on the next fold

#### Scenario: Locked content still cached
- **WHEN** an activity is unavailable because a prerequisite is incomplete
- **THEN** the device may already hold its content bundle and simply does not display it

### Requirement: The system SHALL derive feedback per attempt from item feedback blocks and outcomes [DRV-12]

The system SHALL derive feedback per attempt from item feedback blocks and outcomes.
QTI `modalFeedback` and `feedbackBlock` visibility is derived from outcome
variables. Feedback delivery respects the item's key-visibility policy
(CAC-09); under `time_locked` and `server_only` the client cannot derive
feedback until the key is released.

#### Scenario: Immediate feedback
- **WHEN** an item with `key_visibility = immediate` is answered offline
- **THEN** the device shows the feedback block for the derived outcome at once

### Requirement: The system SHALL localise re-derivation: a void re-derives one (subject, item); a version change re-derives the partition [DRV-13]

The system SHALL localise re-derivation: a void re-derives one (subject, item); a version change re-derives the partition.
A `void.v1` triggers a local recompute of the target's `(subject, item)`
from the subject's facts for that scope. A change to key, rubric, policy or
engine version enqueues a partition recompute (MVA-12). Nothing else forces
a recompute; incremental folds handle ordinary facts.

#### Scenario: Void triggers local recompute
- **WHEN** a void arrives for one response
- **THEN** the view updater queries the subject's `(scope)` facts, re-derives that item, and writes only that learner row and the affected item row

### Requirement: The system SHALL record the client's advisory mark and measure drift without trusting it [DRV-14]

The system SHALL record the client's advisory mark and measure drift without trusting it.
`resp.v1.body.client_mark { engine_version, score, max }` is stored. The
server compares its derivation and emits `engine.client_mismatch` with
versions. `client_mark` never appears in a view, an AGS post, or a OneRoster
result.

#### Scenario: Tampered client
- **WHEN** a modified client reports `client_mark = 10/10` for a wrong answer
- **THEN** the server derives the true score, the mismatch metric increments, and the learner sees the server score after sync

### Requirement: The system SHALL attach provenance to every derived value sufficient to explain it from facts [DRV-15]

The system SHALL attach provenance to every derived value sufficient to explain it from facts.
Provenance lists the engine, key, rubric and policy versions, the vector,
and the `fact_id`s used. An explain endpoint (MVA-06) renders the chain:
facts → attempt outcomes → item outcome → aggregate.

#### Scenario: Learner disputes a grade
- **WHEN** a learner opens "why this mark?"
- **THEN** the client lists the response facts, the key version, the policy branch taken, and any override or extension that applied

### Requirement: The system SHALL honour derivation epochs so a cohort can be reset without deleting facts [DRV-16]

The system SHALL honour derivation epochs so a cohort can be reset without deleting facts.
`policy.v1.epoch_hlc` per `(module, cohort)` excludes facts with
`sync_hlc < epoch_hlc` from derivation. Facts remain in the log and exports.

#### Scenario: Course reset for a new term
- **WHEN** an instructor resets a cohort's module
- **THEN** a policy fact with `epoch_hlc = now` is appended, views re-derive as empty, and the fact log is unchanged

### Requirement: The system SHALL meet derivation performance bounds on both targets [DRV-17]

The system SHALL meet derivation performance bounds on both targets.
Per `(subject, module)` with 1,000 effective facts and 100 items: ≤ 200 ms
in a browser Web Worker on a 2019-class mobile device and ≤ 2 s under
GraalJS in interpreter mode on a 1,024 MB Lambda (≤ 300 ms with the Graal
compiler enabled). Engine bundle ≤ 300 KB compressed. Partition recompute
for 2,000 learners ≤ 60 s wall-clock under a Distributed Map with
concurrency 50 at interpreter speed.

#### Scenario: Bundle size gate
- **WHEN** a build's compressed engine bundle exceeds 300 KB
- **THEN** the release pipeline fails

#### Scenario: Interpreter budget
- **WHEN** the server-side derivation of a 1,000-fact subject exceeds 2 s on the reference Lambda
- **THEN** the build enables the Graal compiler for engine-hosting functions or fails the performance gate

---

## DynamoDB access patterns

The engine owns no items. It reads:

| Input | Source | Access |
|---|---|---|
| Item definitions, keys, rubrics | S3 content-addressed blobs (`content/<sha256>`) via CAC | Cached in Lambda memory by hash; immutable |
| Published structure snapshot, policies, deadlines | `derived` `T#t#CS#<course>` items (CAC) | Eventually consistent GetItem, cached 60 s |
| Facts | `facts` PK/SK ranges (FLS pattern 3) | Only for local recompute and partition recompute |

Hot-partition risk: none of its own. Recompute reads are spread across
subject PKs. Blob cache misses hit S3, not DynamoDB.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Cold p50 / p99 | Notes |
|---|---|---|---|---|
| (in-process) | Embedded in `view-updater` and `partition-recompute` (MVA) through GraalJS | Java 21 SnapStart, 1024–2048 MB | 600 / 1,500 ms | No separate function on the fold path; context restored from the snapshot |
| `derive-explain` | HTTP API `GET /derive/explain` | Java 21 SnapStart + GraalJS, 1024 MB | 600 / 1,500 ms | Re-derives one `(subject, item)` on demand with full provenance |
| `engine-conformance` | CI / on demand | Java 21 + GraalJS, 1024 MB | — | Runs golden vectors on the deployed server build |
| Device | TypeScript in a Web Worker in the PWA | — | ~30 ms worker start | Marks on every response, evaluates availability on navigation |

## Propagation path

Pure function; no propagation of its own. Version changes propagate as
`key.v1` / `rubric.v1` / `policy.v1` facts (CAC) and `engine_version` config
(ADM) which MVA turns into partition recomputes.

## Cost model

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Incremental derivation compute | inside MVA fold (5 M × ~40 ms interpreted) ≈ 200 k GB-s ≈ **$3.3** | $330 | Java + GraalJS, 1 GB; ~$0.5 with JIT |
| Partition recomputes (policy/key changes) | ~200 / month × 100 learners × (40 facts + 1.5 s) ≈ 0.8 M RRU + 30 k GB-s ≈ **$0.6** | $60 | |
| Explain endpoint | 20 k calls ≈ **$0.1** | $10 | |
| Engine bundle distribution | 300 KB × 10 k × 2 releases = 6 GB CloudFront ≈ **$0** (free tier) | $50 | |
| **Total** | **≈ $4** | ≈ $450 | |

## Standards conformance

| Standard | Role | Target | Notes |
|---|---|---|---|
| QTI 3.0 | Delivery system (response and outcome processing) | Core level, plus template processing | Operator subset in `qti-profile.md`; adaptive items out of scope initially |

## Known Tensions

1. **Client-side marking exposes keys.** The engine needs `correctResponse`
   and mappings to mark on device. This is the accepted trade for immediate
   offline feedback; the policy levers are in CAC-09 and the consolidated
   analysis is in `known-tensions.md` §4.
2. **Two attempts numbered the same.** Not enforced, by design; the
   derivation is deterministic but the *learner's expectation* ("I only
   get three attempts") is not. Policy `highest_n` with an attempt cap in
   the client is the mitigation; the server counts all.
3. **Non-sticky completion surprises.** Moodle users expect completion to
   stick. Trellis derives it, so a void can un-complete. The client shows
   the transition and the reason; notifications of completion are gated
   (COM-07), so nothing is un-sent.
4. **Determinism across JavaScript engines.** The engine runs on four
   engines (V8, SpiderMonkey, JavaScriptCore, GraalJS). ECMAScript
   specifies number and string semantics precisely, but `Math`
   transcendental functions, `Intl`, regular-expression corner cases and
   `Date` are engine- or platform-dependent and are banned by lint. The
   golden-vector matrix is the enforcement, not a guarantee; a residual
   engine bug would show as a `client_mark` mismatch metric (DRV-14) before
   it showed in a view.
5. **Interpreter speed on the server.** GraalJS without the Graal compiler
   is one to two orders of magnitude slower than a JIT-compiled browser.
   The fold path is small per fact and fits; recomputes parallelise; the
   JVMCI-enabled compiler is the first lever, the TeaVM fallback (ADR-001)
   the last. Recommendation: measure in change 006 and decide there.
