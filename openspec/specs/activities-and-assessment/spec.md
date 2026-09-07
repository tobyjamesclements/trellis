# Activities and Assessment Specification

Capability ID prefix: **ACT**

## Purpose

This capability is the learner-facing runtime and the activity types that run
in it: quiz, assignment, workshop (peer assessment), choice and slot booking,
feedback and survey, lesson-style branching through QTI 3.0 test rules,
completion tracking, and the calendar. It owns the progressive web app that
holds a learner's replica of the fact log, marks work on the device with the
derivation engine and syncs opportunistically; the fact types that record
attempts, responses, submissions, choices, marking, feedback, extensions and
allocations; and the regional derived items those facts materialise into
(slot rosters, marking queues, peer-allocation indexes, calendars, key-release
schedules). Marks, completion and availability are never stored here as
authority: the device and the region both derive them (DRV), and the
instructor's cohort views belong to MVA.

## Consistency boundary

Three consistency classes meet in this capability and must not be confused.

1. **Facts.** Everything a learner or marker does is an immutable fact in the
   learner's (or group's) streams (FLS-01, FLS-03). The device is a full
   replica for its own subjects; union is the merge (FLS-02). Nothing a
   learner does is rejected for lateness, duplication, over-capacity or
   staleness (project.md §2 principle 1, ADR-008, ADR-009).
2. **Device-derived state.** The device derives its own marks, feedback,
   completion, availability and calendar from its replica with the WASM
   engine (DRV-02). This state is recomputable and labelled as
   device-computed (MVA-10). Its only synchronous server dependency is the
   time-locked key release (ACT-05).
3. **Region-derived state.** Slot rosters, marking queues, allocation indexes
   and calendars are region-owned items in `derived`, vector-stamped and
   disposable (MVA-01, ADR-004). Instructor-facing state is served from them
   with a freshness block (MVA-02).

Every invariant a Moodle administrator expects to be enforced (attempt limits, time limits, one submission per item, slot capacity, one allocation per reviewer, group membership at submission) is advisory here. Each has a derivation that reproduces its intent and a reconciliation for when it is violated (ACT-06, ACT-09, ACT-10, ACT-13, ACT-14). External side effects (reminders, apologies, release notices) leave only through COM-07 from the home region.

## Domain model

### Activity kinds

| Kind | Moodle baseline | Runtime | Facts produced |
|---|---|---|---|
| `quiz` | Quiz | QTI 3.0 `assessmentTest` delivered on device; engine-marked | `attempt.start`, `resp`, `attempt.submit`, `progress` |
| `assignment` | Assignment (file, online text) | Upload and editor; human-marked | as quiz, plus `mark`, `feedback`, `extension`, `override`, `allocation` |
| `workshop` | Workshop | Submission phase as assignment; assessment phase as peer marking | as assignment, plus `allocation` (peer) and `mark` with role `peer` |
| `choice` | Choice; appointment slots; group self-selection | Option list with advisory capacity | `choice`, `slot` |
| `survey` | Feedback / Survey | QTI items with `marking = none` | `resp`, `attempt.submit` |
| `lesson` | Lesson | QTI `assessmentTest` with `branchRule` / `preCondition` | as quiz |
| `resource` | Page, file, URL, book, folder, label | Content bundle (CAC-14); completion by view | `progress` |
| `external` | LTI tool, H5P, SCORM player | LTI-01 launch; online only | `ext.score` (LTI-11) folds into completion and grade |

### Fact bodies owned by this capability

```
attempt.start.v1  { activity, attempt_n, bundle_version }
                  attempt_n = 1 + max(attempt_n) over effective starts in the writer's replica
resp.v1           { activity, item, attempt_n, response: {var → value}, tries?, key_version,
                    client_mark?: {engine_version, score, max} }        refs = [start]
attempt.submit.v1 { activity, attempt_n, elapsed_ms, responses: [fact_id],
                    files?: [{sha256, name, bytes, mime}], text_ref?, resubmission_of? }
                  refs = [start] ++ responses ++ [resubmission_of]
progress.v1       { activity, marker: viewed | completed | uncompleted }
choice.v1         { activity, option, action: select | withdraw, replaces?: fact_id }
mark.v1           { attempt_ref, rubric_version, criteria: [{id, level, points, comment}], total?,
                    role: instructor | tutor | peer | self, final: bool = true, files?: [{sha256, name}] }
feedback.v1       { activity, attempt_ref?, text?, text_ref?, files?: [{sha256, name}], release: bool = false }
override.v1       { scope_ref: item | activity | module, kind: grade | completion = grade, value, reason }
extension.v1      { activity, deadline?: hlc16, time_limit_ms?, attempts_max?, reason }
allocation.v1     { activity, round, kind: marker | peer, submission_ref, submitter, vector_digest }
                  subject = the marker or reviewer
slot.v1           { choice_ref, outcome: confirmed | bumped | waitlisted, alternatives: [option],
                    decided_by: usr | timeout, intent_id }
```

Bodies over 4 KB (online text, long responses) go to S3 by hash with `body_ref` (FLS-12). Plaintext metadata is limited to `activity`, `item`, `attempt_n`, `key_version` and `rubric_version`; the rest of every body is `P`-class and encrypted under the subject's data key (FLS-16). Group work (ACT-10) writes `attempt.start.v1`, `resp.v1` and `attempt.submit.v1` with subject kind `G`.

### New fact type

| Type | Owner | Subject kind | Scope | Writer | PII | Purpose |
|---|---|---|---|---|---|---|
| `slot.v1` | ACT | L | module | region system device / instructor | P | Slot reconciliation outcome for a `choice.v1`: confirmed, bumped with alternatives, or waitlisted |

Registry amendments for the integrator (existing types, ACT-owned): `attempt.start.v1`, `resp.v1`, `attempt.submit.v1` subject kind `L or G`; `mark.v1` writer adds `self` (self-assessment); `override.v1` gains `kind: grade | completion`; `extension.v1` gains per-learner `time_limit_ms` and `attempts_max`.

### Derived items (regional, owned here)

```
SlotRoster    per (module, activity): option → {capacity, count_effective,
              selections: [(subject, sync_hlc, fact_id, status: provisional|confirmed|bumped)]}, vector_digest
MarkingQueue  per (module, cohort): (activity, subject) → {state, submit_ref, marker?, anon_id?,
              submitted_hlc, late, previous_rubric, blob_pending}, vector_digest
PeerIndex     per (module, activity): round → {submission_ref → reviewers[], reviewer → submissions[]}
Calendar      per subject: [{activity, kind: due|slot|release|review_due, at, fact_ids[], module, cohort}], vector
KeyRelease    per (item, cohort): {release_hlc, key_version, key_hash}
```

### Device runtime

```
IndexedDB   facts (own + pulled, by stream and seq) · vectors · bundles (content-addressed, LRU) · keys (released, by key_version) · drafts (per item, unsent) · profile
Worker      app shell and bundle cache · background sync · push handler (COM)
Sync agent  push in seq order, pull by vector, apply roster advice (FLS-08, FLS-09), blob upload (FLS-12)
Engine      WASM build of the derivation engine (DRV-02); marks, availability, completion, calendar
```

## Requirements

### Requirement: The system SHALL record the attempt lifecycle as facts: `attempt.start.v1` claims an attempt number, each saved item response is a `resp.v1`, and `attempt.submit.v1` references the responses it submits [ACT-01]

The system SHALL record the attempt lifecycle as facts: `attempt.start.v1` claims an attempt number, each saved item response is a `resp.v1`, and `attempt.submit.v1` references the responses it submits.
The device appends `attempt.start.v1 { activity, attempt_n }` with
`attempt_n = 1 + max(attempt_n)` over the effective starts in its replica,
then one `resp.v1` per saved item response carrying `attempt_n`,
`key_version` and `refs = [start]`, and finally `attempt.submit.v1` whose
`refs` name the response facts and whose body carries `elapsed_ms`. Unsent
drafts (text being typed, an unconfirmed selection) exist only in the
device's `drafts` store; a saved response is always a fact. Assignment
submissions use the same three shapes: online text is a `resp.v1` (with
`body_ref` over 4 KB, FLS-12), files are content-addressed blobs listed in
`attempt.submit.v1.files`, and a resubmission is a new `attempt.submit.v1`
at the next `attempt_n` with `resubmission_of`.

#### Scenario: Quiz attempt offline
- **WHEN** a learner opens a quiz offline, answers 12 items and presses submit
- **THEN** the device holds 14 facts in one stream: `attempt.start.v1` at `attempt_n = 1`, 12 `resp.v1` referencing it, and `attempt.submit.v1` whose `refs` list the 12 response `fact_id`s
- **AND** on the next sync they are pushed in seq order and accepted (FLS-04) regardless of any deadline

#### Scenario: Assignment with files
- **WHEN** a learner submits an essay with two PDF attachments
- **THEN** the device requests presigned PUTs for both hashes (FLS-12), uploads in the background, and pushes `attempt.submit.v1 { files: [2 entries] }` without waiting for the uploads
- **AND** the marking queue shows the submission `blob_pending` until both blobs exist in the reading region

### Requirement: The system SHALL deliver the learner runtime as a progressive web app whose IndexedDB replica holds facts, vectors, content bundles, released keys and drafts, and which evicts content bundles under storage pressure but never facts [ACT-02]

The system SHALL deliver the learner runtime as a progressive web app whose IndexedDB replica holds facts, vectors, content bundles, released keys and drafts, and which evicts content bundles under storage pressure but never facts.
The PWA installs a service worker that serves the app shell and bundle cache
offline. On first run per profile it calls `navigator.storage.persist()` and
reads `storage.estimate()`; bundles (CAC-14) are cached LRU within a
per-profile budget (default 60% of quota, cap 2 GB); released keys are
evicted after bundles; facts, vectors and drafts are never evicted by the
runtime. A shared device holds one profile per principal with its own
`device_id` and streams (FLS-19); each profile's stores are encrypted under a
non-extractable key unwrapped only by that profile's session (IDE-03), so no
profile can read another's replica.

#### Scenario: Storage pressure
- **WHEN** the browser reports the origin at 95% of quota while a learner opens a new module
- **THEN** the runtime evicts the least recently used bundles of other modules until the new bundle fits, then released keys if still needed
- **AND** no fact, vector or draft is removed, and evicted modules are listed as "download again to work offline"

#### Scenario: Shared classroom tablet
- **WHEN** two learners use one tablet with separate profiles
- **THEN** each profile has its own `device_id`, `device.v1` fact and stream set, and switching profile locks the previous replica

### Requirement: The system SHALL run a sync agent that pushes facts in stream order, pulls by vector, applies roster advice, uploads blobs independently, and never blocks the learner interface on the network [ACT-03]

The system SHALL run a sync agent that pushes facts in stream order, pulls by vector, applies roster advice, uploads blobs independently, and never blocks the learner interface on the network.
The agent runs in the service worker (Background Sync where supported,
otherwise on app focus and on a 5-minute timer while open). It pushes
unpushed facts per stream in seq order in batches of at most 100 facts and
1 MiB (FLS-08), retries with exponential backoff and jitter (idempotent by
FLS-04), shows `status = queued` as "received, confirming" until the roster
confirms (FLS-13), fills gaps with `noop.v1` and re-pushes on `advice.refork`
(FLS-03, FLS-09), registers on `advice.register` (FLS-19), and pulls
`(self, scope)` for enrolled modules and `(cohort, scope)` for marking roles
(FLS-10). Any region in the tenant's zone is acceptable (FLS-18). A fact is
marked pushed only when it appears in `accepted`; it leaves the device only
with profile removal, and then only after the roster shows it at or below
HWM.

#### Scenario: Reconnect after a week offline
- **WHEN** a device with 340 unpushed facts across 6 streams regains connectivity
- **THEN** the agent pushes 4 batches in seq order per stream, then pulls with its vectors and folds new instructor facts (marks, extensions) into the replica
- **AND** the learner keeps working throughout; the header shows "syncing 340 items"

#### Scenario: Region failover mid-push
- **WHEN** the third batch fails because Route 53 has moved the tenant hostname to the peer region
- **THEN** the agent retries the same batch against the new region and receives `duplicate` for facts the first region had already replicated and `accepted` for the rest (FLS-18)

### Requirement: The system SHALL mark responses on the device with the WASM derivation engine and show immediate feedback subject to the item's key-visibility policy, recording the device's mark only as advisory [ACT-04]

The system SHALL mark responses on the device with the WASM derivation engine and show immediate feedback subject to the item's key-visibility policy, recording the device's mark only as advisory.
On every saved response the runtime invokes the engine (DRV-02, DRV-04)
with the item at its `key_version`, the response and the seed
`(subject, item, attempt_n, key_version)` (DRV-03), and writes
`resp.v1.client_mark { engine_version, score, max }`. Feedback is shown at
once under `immediate`, after the local `attempt.submit.v1` under
`after_submit`, after the key is fetched (ACT-05) under `time_locked`, and
never on device under `server_only` or for items classified
`server_or_human` (CAC-08, CAC-09); those show "marked after sync" or
"marked after ⟨release⟩". `client_mark` is advisory (DRV-14): the server
derives independently, and the device replaces its local value with the
server's once the LearnerRow dominates the device's streams (MVA-05).

#### Scenario: Immediate feedback offline
- **WHEN** a learner answers a `choiceInteraction` item with `key_visibility = immediate` on a train
- **THEN** the engine marks it within 200 ms (DRV-17), the `modalFeedback` for the outcome is shown (DRV-12), and the `resp.v1` carries `client_mark = {1.4.2, 1, 1}`

#### Scenario: Tampered client
- **WHEN** a modified client reports `client_mark = 10/10` for a wrong answer
- **THEN** the fact is accepted, the server derives the true score, the mismatch metric increments (DRV-14), and after sync the device displays the server's value labelled with its region

### Requirement: The system SHALL release time-locked answer keys through `GET /keys/release/{item}/{cohort}`, the only synchronous server dependency of on-device marking [ACT-05]

The system SHALL release time-locked answer keys through `GET /keys/release/{item}/{cohort}`, the only synchronous server dependency of on-device marking.
The endpoint (Java 21, SnapStart) authenticates the session (IDE-03), checks
that the principal is a member of the cohort or holds a marking role over it
(IDE-09), reads the region's `KeyRelease` item for `(item, cohort)`, and
returns the key at its `key_version` (inline up to 4 KB, otherwise a presigned
GET to the content blob, CAC-03) once the region's own clock has passed
`release_hlc`; before that it returns `403 not_released { release_hlc }` with
`Retry-After`. `release_hlc` is derived from `key.v1` visibility
(`time_locked{at_deadline | at(hlc)}`, CAC-09) and the cohort's `deadline.v1`
(CAC-11); per-learner extensions do not move it. The device caches released
keys by `key_version` for as long as a bundle references that version. Keys
under `server_only` are never served by any endpoint.

#### Scenario: Key fetched after the deadline
- **WHEN** a learner who submitted offline on Tuesday syncs on Thursday, after the Wednesday release
- **THEN** the device calls the endpoint once per time-locked item, caches each key, marks the Tuesday responses locally and shows feedback labelled "computed on this device"

#### Scenario: Region has not folded the deadline
- **WHEN** the request lands in a region whose `KeyRelease` item predates a `deadline.v1` change that moved release earlier
- **THEN** the endpoint answers from its own item (possibly `not_released`), the device retries after `Retry-After`, and convergence is bounded by the replication lag reported per MVA-14

### Requirement: The system SHALL treat time limits and attempt limits as advisory: the client enforces them for the learner's benefit, `attempt.submit.v1` carries `elapsed_ms`, and the server flags over-time and over-limit attempts without ever rejecting them [ACT-06]

The system SHALL treat time limits and attempt limits as advisory: the client enforces them for the learner's benefit, `attempt.submit.v1` carries `elapsed_ms`, and the server flags over-time and over-limit attempts without ever rejecting them.
The client shows a countdown from `time_limit_ms` (`policy.v1`, adjusted by
the learner's `extension.v1.time_limit_ms`), accumulates `elapsed_ms` from a
monotonic clock across suspensions, auto-saves and submits at expiry, and
hides "start attempt" once `attempts_max` effective starts exist in its
replica. The server never reads these as constraints: derivation stamps an
attempt `over_time` when `elapsed_ms > time_limit_ms + grace_ms` (policy,
default 60 s) and `over_limit` when its position in
`(attempt_n, sync_hlc, fact_id)` order exceeds `attempts_max`; policy
`highest_n(n)` (DRV-06) scores the best of the first `n` attempts in that
order and so reproduces the cap in derivation, and `over_time: count |
exclude` (default `count`) decides whether over-time attempts score. Flags
appear in the learner's own view and the instructor's row with the values
that produced them.

#### Scenario: Tab suspended during a timed quiz
- **WHEN** a learner's phone suspends the tab for 40 minutes during a 30-minute quiz and the learner then submits
- **THEN** the attempt is accepted with whatever `elapsed_ms` the monotonic clock measured; if it exceeds the limit plus grace the row shows `over_time` with the measured value and the score still counts under the default policy

#### Scenario: Attempt cap circumvented by two devices
- **WHEN** a quiz allows 3 attempts and a learner starts attempts 1–3 on a laptop and, offline, attempts 1–2 on a phone
- **THEN** all five starts are effective; under `highest_n(3)` the first three in `(attempt_n, sync_hlc, fact_id)` order score and the rest are flagged `over_limit`, with `duplicate_attempts = [1, 2]` (DRV-06)

### Requirement: The system SHALL implement quiz behaviours as engine seeds and visibility policies: seeded shuffle, question behaviours mapped to key visibility, review options as policy, and grading methods as DRV-06 attempt policies [ACT-07]

The system SHALL implement quiz behaviours as engine seeds and visibility policies: seeded shuffle, question behaviours mapped to key visibility, review options as policy, and grading methods as DRV-06 attempt policies.
Shuffle of items and of choices within items, `selection`/`ordering` of test
sections and template variables are seeded from `(subject, item, attempt_n,
key_version)` (DRV-03) so a re-derivation reproduces the attempt exactly.
Moodle question behaviours map as: deferred feedback → `after_submit`;
immediate feedback and interactive-with-multiple-tries → `immediate` with
`resp.v1.tries` counting checks and response processing applying per-try
penalties; adaptive mode → `immediate` with penalty outcomes; certainty-based
marking is out of scope. Review options ("during", "immediately after",
"later while open", "after close" × attempt, correctness, marks, feedback,
right answer) are `policy.v1.review` content evaluated by the client; their
only server-side consequence is which keys the bundle contains (CAC-09).
Grading methods highest / average / first / last are `policy.v1.attempts =
best | mean | first | latest` (DRV-06).

#### Scenario: Right answer shown only after close
- **WHEN** an instructor sets "right answer: after the quiz is closed"
- **THEN** publishing (CAC-08) classifies the item `time_locked{at_deadline}`, the bundle omits the key, and the device fetches it through ACT-05 after the close date

#### Scenario: Interactive with multiple tries
- **WHEN** a learner checks an item three times before it is correct
- **THEN** each check saves a `resp.v1` with `tries = 1, 2, 3` and response processing applies the per-try penalty identically on device and server

### Requirement: The system SHALL deliver lesson-style branching as QTI 3.0 test `branchRule` and `preCondition` evaluation on the device, with the route derived from responses rather than recorded [ACT-08]

The system SHALL deliver lesson-style branching as QTI 3.0 test `branchRule` and `preCondition` evaluation on the device, with the route derived from responses rather than recorded.
A `lesson` is an `assessmentTest` whose sections and items carry
`preCondition` and `branchRule` expressions over outcome variables in the
operator subset (qti-profile.md). The device evaluates them after each saved
response to choose the next item. The route is a deterministic function of
the response facts and the seed, so it is never stored: server and device
reconstruct it identically (DRV-03). Content pages between questions are
items without interactions; random branches use seeded `selection`.

#### Scenario: Branch on a wrong answer
- **WHEN** a learner answers item 4 incorrectly and the section's `branchRule` targets a remediation section
- **THEN** the device shows the remediation items next, and a later server re-derivation visits the same sequence from the same `resp.v1` facts

#### Scenario: Learner continues on another device
- **WHEN** the learner resumes the lesson on a second device after sync
- **THEN** the second device derives the same position from the pulled responses and resumes at the next unanswered item

### Requirement: The system SHALL record choices and slot bookings as `choice.v1` facts without enforcing capacity, and reconcile overbooking through a Step Functions Standard workflow that orders by `(sync_hlc, fact_id)`, never bumps a learner who has since acted on the choice, offers the instructor "raise cap / confirm bump" for up to 24 h, and apologises to bumped learners with alternatives [ACT-09]

The system SHALL record choices and slot bookings as `choice.v1` facts without enforcing capacity, and reconcile overbooking through a Step Functions Standard workflow that orders by `(sync_hlc, fact_id)`, never bumps a learner who has since acted on the choice, offers the instructor "raise cap / confirm bump" for up to 24 h, and apologises to bumped learners with alternatives.
Capacity in `struct.v1` is advisory; the device shows remaining places from
its last pulled `SlotRoster` and displays a selection as "provisional" until
the roster confirms it. Over-capacity is a non-monotone predicate
(withdrawals reduce the count), so it creates a SideEffectIntent behind the
default 5-minute window (MVA-08) that only the home region turns into one
`slot-reconcile` execution per `(activity, option, intent_id)`. The workflow
snapshots the option's selections ordered by `(sync_hlc, fact_id)`, protects
every selection whose subject has a later effective fact in the scope acting
on it (an `attempt.start.v1` or `progress.v1` on the slot's activity),
notifies the instructor (COM-07) and waits on a task token for up to 24 h.
"Raise cap" ends the workflow once the instructor's client has appended a
`struct.v1` raising capacity (CAC-01); "confirm bump" or timeout appends
`slot.v1 { bumped, alternatives }` for the latest-arriving unprotected
selections beyond capacity and `slot.v1 { confirmed }` for the rest, then
emits one apology per bumped learner naming options with free places at the
decision vector. A bumped learner may select again; nothing is voided.

#### Scenario: Twelve learners for ten places
- **WHEN** 12 `choice.v1` selections for a 10-place lab slot have synced through two regions
- **THEN** the intent fires after 5 minutes of stability and the instructor receives "12 booked, 10 places: raise cap or confirm bump"
- **AND** with no decision in 24 h, the two latest by `(sync_hlc, fact_id)` receive `slot.v1 { bumped, alternatives: [Thu 14:00, Fri 10:00] }` and an apology

#### Scenario: Latecomer already attended
- **WHEN** the latest-arriving selection belongs to a learner whose device has since synced a `progress.v1 { viewed }` for the slot's activity
- **THEN** that selection is protected and the next-latest unprotected one is bumped instead

### Requirement: The system SHALL support assignment submissions as files and online text, resubmission at a new attempt number, and group submissions with subject kind `G` whose derivation attributes the submission to the group's members at submission time [ACT-10]

The system SHALL support assignment submissions as files and online text, resubmission at a new attempt number, and group submissions with subject kind `G` whose derivation attributes the submission to the group's members at submission time.
Files are content-addressed blobs (CAC-03) referenced from
`attempt.submit.v1.files`; online text is a `resp.v1`. Where policy allows,
resubmission is a new `attempt.submit.v1` at the next `attempt_n` with
`resubmission_of`, and the attempt policy (`latest` by default for
assignments) selects the effective one. For group assignments the submitting
member's device writes `attempt.start.v1`, `resp.v1` and `attempt.submit.v1`
with `subject = {kind: G, id: grp_…}`; authority to write for the group is
membership as derived by the ingest region from IDE facts (FLS-11), and a
fact refused `unauthorised_subject` because membership has not yet
replicated stays in the outbox and is re-pushed. Derivation attributes the
submission, marks and feedback to the members of the group at the submit
fact's `sync_hlc` under the union at the derivation vector; later membership
changes do not move it (Known Tension 4).

#### Scenario: Resubmission after feedback
- **WHEN** an instructor returns feedback and the learner resubmits
- **THEN** the second `attempt.submit.v1` carries `attempt_n = 2` and `resubmission_of`, both remain effective, and under `latest` the marking queue shows attempt 2 as the one to mark with a link to attempt 1

#### Scenario: Group submission by one member
- **WHEN** one member of a four-person group submits the group report
- **THEN** all four LearnerRows derive the submission, mark and feedback from the group's facts, with provenance naming the group subject and the membership facts used

### Requirement: The system SHALL evaluate availability and completion on the device as advisory predicates, hiding or showing activities, while the server never withholds a content bundle on an availability predicate [ACT-11]

The system SHALL evaluate availability and completion on the device as advisory predicates, hiding or showing activities, while the server never withholds a content bundle on an availability predicate.
Availability conditions (open and close dates, completion of another
activity, grade thresholds, cohort or group membership, a `choice`
selection) and completion conditions (viewed, submitted, score ≥ threshold,
manual `progress.v1`) are `struct.v1` content evaluated by the engine
(DRV-11) on the device over its replica and by the region over its rows. The
device hides a locked activity and shows the reason; it may prefetch the
bundle so the activity opens offline once unlocked. Servers withhold only
answer keys under `time_locked` and `server_only` (CAC-09, ACT-05); a bundle
request is never refused on availability. Completion is non-sticky
(DRV-11); the client shows a transition to `incomplete` with its cause.
Instructor completion overrides are `override.v1 { kind: completion }`
(DRV-09).

#### Scenario: Prerequisite completed offline
- **WHEN** a learner completes activity A offline and activity B requires A
- **THEN** the device derives B `available` at once from its own facts, labelled "computed on this device", and B's cached bundle opens

#### Scenario: Locked bundle requested
- **WHEN** a client requests the bundle of an activity that is locked for it
- **THEN** the bundle is served (CAC-14) minus any time-locked or server-only keys, and the client's own predicate decides whether to render it

### Requirement: The system SHALL derive the marking workflow from facts, with states not submitted, submitted, in marking, marked and released; release as a `policy.v1` grade-visibility setting or per-learner `feedback.v1`; markers allocated by `allocation.v1`; anonymous marking as a derived-view flag; and rubrics, feedback files, extensions and overrides as their facts [ACT-12]

The system SHALL derive the marking workflow from facts, with states not submitted, submitted, in marking, marked and released; release as a `policy.v1` grade-visibility setting or per-learner `feedback.v1`; markers allocated by `allocation.v1`; anonymous marking as a derived-view flag; and rubrics, feedback files, extensions and overrides as their facts.
Per `(activity, subject)` the MarkingQueue state is `not_submitted` (no
effective `attempt.submit.v1`); `submitted`; `in_marking` (an
`allocation.v1 { kind: marker }` names a marker, or a `mark.v1 { final:
false }` exists); `marked` (an effective `mark.v1 { final: true }` resolves
under the DRV-08 marker policy); `released` (`policy.v1.grade_visibility` for
the activity is `released` or `at(hlc)` past, or a `feedback.v1 { release:
true }` exists for the subject). Marks carry `rubric_version` and criteria
(CAC-07, DRV-08); feedback text and files are `feedback.v1` bodies and blobs;
per-learner deadline, time-limit and attempt adjustments are `extension.v1`;
grade overrides are `override.v1` (DRV-09). With `policy.v1.anonymous_marking
= true` the queue and the marker's client show `anon_id =
base32(SHA-256(activity, subject, cohort_salt))[0:8]` instead of the learner;
this is a presentation flag, because the marker's device necessarily holds
subject-keyed facts (FLS-10). The learner's client shows a human mark only
in state `released`, never from `client_mark`.

#### Scenario: Release to the whole cohort
- **WHEN** the instructor sets the activity's grade visibility to `released`
- **THEN** the `policy.v1` fact folds, every `marked` entry derives `released`, learners' next pulls include the marker streams' `mark.v1` and `feedback.v1`, and one release intent per learner is handed to COM-07

#### Scenario: Rubric changed mid-marking
- **WHEN** `rubric.v2` is published after 40 of 100 submissions are marked
- **THEN** those 40 entries carry `previous_rubric = true` (DRV-08), remain `marked`, and the queue lists them under "re-mark" without changing any score

### Requirement: The system SHALL allocate peer assessment deterministically from the union at a vector, publish it as `allocation.v1` facts written by the region system device, reconcile duplicate and missing allocations across regions, record peer marks as `mark.v1` with role `peer`, and aggregate them under the DRV-08 marker policy [ACT-13]

The system SHALL allocate peer assessment deterministically from the union at a vector, publish it as `allocation.v1` facts written by the region system device, reconcile duplicate and missing allocations across regions, record peer marks as `mark.v1` with role `peer`, and aggregate them under the DRV-08 marker policy.
After the submission-phase `deadline.v1` plus the stability window,
`peer-allocate` in the home region reads the effective `attempt.submit.v1`
facts for `(activity, cohort)` at the current vector, sorts submitters by
`fact_id`, derives ring offsets from `SHA-256(activity, cohort,
vector_digest)`, and assigns each submission to the next `k` submitters
(policy `reviewers_per_submission`, `self_assess`). It appends
`allocation.v1 { kind: peer, round, submission_ref, submitter, vector_digest }`
with `subject = reviewer` through `dev_sys_<region>`. Passes repeat hourly
during the assessment phase over the union including existing allocations: a
submission or reviewer with fewer than `k` keeps what it has and receives the
deficit; a reviewer allocated the same submission twice keeps both and marks
once. An effective `allocation.v1` in the reviewer's stream authorises the
reviewer to pull the referenced submission (FLS-10) and to write `mark.v1 {
role: peer }` with the submitter as subject (FLS-11). The submitter's score
is the DRV-08 resolution over peer marks (`mean` by default; an instructor
mark under `designated` overrides). The grade for assessing, where enabled,
is a non-monotone NMRow (MVA-07). Peer anonymity is a derived-view flag as
in ACT-12.

#### Scenario: Late submitter
- **WHEN** a learner's submission syncs two days after the first allocation pass
- **THEN** the next hourly pass allocates it to `k` reviewers with capacity and, if policy requires, allocates `k` submissions to the late submitter; earlier allocations are untouched

#### Scenario: Allocation computed in two regions
- **WHEN** a home-region failover (ADM-03) causes both regions to run a pass at different vectors
- **THEN** the union of `allocation.v1` facts may give some submissions more than `k` reviewers; all are effective, every reviewer's queue shows their allocations, and the next pass allocates only deficits

### Requirement: The system SHALL show learners lateness and duplicate-attempt states derived from the envelope and policy, including "submitted on time, synced late", and never as an adjudication [ACT-14]

The system SHALL show learners lateness and duplicate-attempt states derived from the envelope and policy, including "submitted on time, synced late", and never as an adjudication.
Before sync a submission shows "saved on this device, not yet synced" with
the device's claimed time. After sync the `accepted` entry's `late` and
`claimed_on_time` flags (FLS-06) drive three labels: "submitted on time";
"submitted on time, synced late" when `claimed_on_time ∧ late`, qualified
"counted as on time" under `grace(d)` within `d` or "counted as late under
course policy" under `arrival` or beyond the grace; and "submitted late".
Once the region row dominates the device's stream, the DRV-07 outcome
(deadline, extension, penalty, provenance) replaces the envelope-derived
label. Duplicate attempt numbers (DRV-06) appear to the learner as
"attempt 2 (laptop)" and "attempt 2 (phone)" with which one counts under the
policy, and to the instructor as `duplicate_attempts`.

#### Scenario: Offline submission synced after the deadline
- **WHEN** `device_hlc` is 22:40 on the due day and `sync_hlc` is 08:15 the next morning under `grace(24h)`
- **THEN** the learner sees "submitted on time, synced late — counted as on time" and no penalty is derived

#### Scenario: Extension arrives after the label
- **WHEN** an `extension.v1` for the learner folds after the row showed the attempt late
- **THEN** the next pull relabels it "submitted on time (extension to ⟨date⟩)" with the extension's `fact_id` in the explain link (DRV-15)

### Requirement: The system SHALL derive each learner's calendar from deadline, extension, choice, allocation and release facts, and export it as ICS from a signed per-learner URL [ACT-15]

The system SHALL derive each learner's calendar from deadline, extension, choice, allocation and release facts, and export it as ICS from a signed per-learner URL.
The `Calendar` item for a subject lists due dates (`deadline.v1` for the
learner's cohorts, adjusted by the learner's effective `extension.v1`),
booked slots (`choice.v1`, provisional or confirmed), peer-review due dates
(`allocation.v1` with the assessment-phase deadline) and grade release times
(`policy.v1`), each with the `fact_id`s it came from and the vector. The
device derives the same calendar from its replica and labels it (MVA-10).
`GET /calendar/{token}.ics` (token a JWT bound to the subject, IDE-03)
renders RFC 5545 with `UID = <activity>@<tenant>`, `SEQUENCE` incremented
when the derived time changes, `STATUS:TENTATIVE` for provisional slots, and
`X-TRELLIS-VECTOR`. ICS times are UTC; the runtime displays them in the
profile time zone with the offset visible.

#### Scenario: Extension moves a due date
- **WHEN** an instructor grants a 3-day extension
- **THEN** the learner's calendar item is rewritten with the new `at`, the extension's `fact_id` and `SEQUENCE + 1` on the next ICS fetch; other learners' calendars are unchanged

#### Scenario: Instructor feed
- **WHEN** an instructor subscribes to the ICS feed
- **THEN** it lists deadlines for every cohort they hold a role in, annotated from the marking queue ("38 of 120 submitted") at each fetch

### Requirement: The system SHALL send deadline and release reminders only through the COM-07 gated emitter, as stability-windowed intents from the home region [ACT-16]

The system SHALL send deadline and release reminders only through the COM-07 gated emitter, as stability-windowed intents from the home region.
"Due in 24 h and no effective `attempt.submit.v1`" and "grade released" are
non-monotone predicates evaluated per `(subject, activity)` by
`reminder-arm`, scheduled once per folded deadline at `deadline − 24 h`
(EventBridge Scheduler one-off) and by `view.updated` for releases. Each
transition creates a SideEffectIntent (MVA-08) with idempotency key
`reminder#<subject>#<activity>#<deadline_hlc>`; the home-region emitter
sends per `notify.pref.v1` and records the sent ledger (COM-07). The device
may also schedule local notifications from its own calendar derivation;
these are not side effects and need no ledger.

#### Scenario: Learner submits during the window
- **WHEN** the reminder intent is created at 09:00 and the learner's submission folds at 09:03
- **THEN** the evaluator finds the predicate no longer holds at a dominating vector and drops the intent; nothing is sent

#### Scenario: Region isolated
- **WHEN** the non-home region derives the same intent during a replication interruption
- **THEN** it does not emit; when replication resumes the home region's ledger shows whether the key was already sent

### Requirement: The system SHALL label every learner-facing derived value with its source, the device's local derivation or a region row, and with the freshness that source proves [ACT-17]

The system SHALL label every learner-facing derived value with its source, the device's local derivation or a region row, and with the freshness that source proves.
Per module the runtime keeps the device's vector for its own streams and the
last LearnerRow with its cursors (MVA-10). For each displayed value it uses
the row when the row's cursors dominate the device's streams, else the local
derivation, rendering "computed on this device; not yet synced: ⟨n⟩ items"
or "from ⟨region⟩, includes work synced up to ⟨max_sync_hlc⟩". Values the
device cannot derive (server-only marking, human marks not yet pulled, group
attribution needing membership facts it lacks) show as "pending" with the
reason, never as zero. No TTL or wall-clock age decides which source wins
(project.md §2 principle 8).

#### Scenario: Server row lags the device
- **WHEN** the device holds `{dev_a: 42}` and the row cursor is `{dev_a: 39}`
- **THEN** the progress view is the local derivation labelled "not yet synced: 3 items" and the explain link lists the three facts

#### Scenario: Instructor mark arrives
- **WHEN** a pull brings a `mark.v1` from the instructor's stream that the device had not seen
- **THEN** the local engine re-derives the item with the mark, and the label switches to the row once the row dominates the device's own streams

### Requirement: The system SHALL run feedback and survey activities as unmarked QTI items aggregated in item rows, with anonymity as a derived-view flag under a minimum-response threshold [ACT-18]

The system SHALL run feedback and survey activities as unmarked QTI items aggregated in item rows, with anonymity as a derived-view flag under a minimum-response threshold.
Survey questions are QTI items classified `marking = none` at publish
(CAC-08); responses are `resp.v1` and completion is an `attempt.submit.v1`.
Aggregates (counts per option, means for scales, text lists) are ItemRow
distributions (MVA-03). With `policy.v1.anonymous = true` the instructor
view exposes only distributions, and only once at least `k_min` (default 5)
subjects have responded; per-subject rows are hidden and the explain
endpoint refuses subject-level provenance to instructor roles. The facts
remain subject-keyed, as every fact must be; Moodle's fixed instruments
(COLLES, ATTLS) ship as QTI item sets.

#### Scenario: Four responses so far
- **WHEN** an instructor opens an anonymous survey with 4 responses
- **THEN** the view shows "4 responses (results shown from 5)" and no distribution

#### Scenario: Learner reviews own answers
- **WHEN** the learner reopens the survey offline
- **THEN** their own responses are shown from the device replica; the anonymity flag governs instructor views only

### Requirement: The system SHALL meet WCAG 2.2 AA in the runtime, honour QTI 3.0 accessibility alternatives, and localise the interface without letting locale enter derivation [ACT-19]

The system SHALL meet WCAG 2.2 AA in the runtime, honour QTI 3.0 accessibility alternatives, and localise the interface without letting locale enter derivation.
Every interaction in the delivery profile is keyboard-operable and every
drag operation has a single-pointer, non-drag alternative (WCAG 2.2 2.5.7,
2.5.8, 2.4.11); time limits can be extended or removed per learner through
`extension.v1` (2.2.1), which the advisory model makes trivial. Catalog-based
alternatives in the item (spoken, sign, glossary, simplified language) are
selected by needs-and-preferences fields in `profile.v1`. Interface strings
are ICU MessageFormat bundles per locale; item content follows its
`xml:lang` and `dir`; numbers, dates and times are formatted with `Intl` for
display only. The engine never sees a locale (DRV-03): scores, seeds and
ordering are locale-independent.

#### Scenario: Screen-reader user on a gap-match item
- **WHEN** a learner using a screen reader answers a `gapMatchInteraction`
- **THEN** each gap is a focusable combobox listing the choices, the saved `resp.v1` is identical to one produced by dragging, and the engine marks it identically

#### Scenario: Locale switch
- **WHEN** a learner changes the interface locale from `en-GB` to `ar`
- **THEN** the shell re-renders right-to-left with Arabic strings and localised digits for display, and every derived score is byte-identical to before

## DynamoDB access patterns

### `facts` (global table, one per residency zone)

This capability writes only fact items in the FLS layout and reads them through FLS patterns; it adds no attribute and no index.

| # | Access pattern | Key condition | Notes |
|---|---|---|---|
| 1 | Append learner activity fact | `PK = T#<t>#S#L#<usr>`, `SK = F#mod_<m>#dev_<d>#<seq10>`, `attribute_not_exists(PK)` | Via `sync-api` (FLS-04); ~1 KB; `body_ref` over 4 KB |
| 2 | Append group submission fact | `PK = T#<t>#S#G#<grp>`, `SK = F#mod_<m>#dev_<d>#<seq10>` | Member's device is the writer (ACT-10) |
| 3 | Append marking, allocation or slot fact about a learner | `PK = T#<t>#S#L#<usr>`, `SK = F#mod_<m>#dev_<marker or sys_region>#<seq10>` | Marker's or system device's stream; subject = learner |
| 4 | Learner pulls own module facts | `PK = T#<t>#S#L#<usr>`, `SK begins_with F#mod_<m>#` | Every sync (FLS pattern 3) |
| 5 | Marker pulls a cohort's module facts | pattern 4 per member, paginated | Offline marking (FLS-10) |
| 6 | Allocator reads submissions at a vector | pattern 4 per member, filtered `type = attempt.submit.v1` | Hourly per active workshop |
| 7 | Reviewer pulls one allocated submission | `GetItem(PK, SK)` from `submission_ref` pointer, then its `refs` | Authorised by `allocation.v1` (ACT-13) |

No GSI: every read starts from a subject the caller already knows (self, a cohort member, or an allocation's `submission_ref` pointer).

### `derived` (regional), items owned by this capability

| Item | PK | SK | Size | Access |
|---|---|---|---|---|
| SlotRoster header | `T#<t>#SL#<module>#<activity>` | `HDR` | ~300 B | GetItem on activity open; CAS per fold batch |
| SlotRoster option | same | `O#<option>` | ≤ 120 KB (2,000 × 60 B) | Query prefix `O#`; CAS per fold batch |
| MarkingQueue entry | `T#<t>#MQ#<module>#<cohort>` | `A#<activity>#<subject>` | ~300 B | Query prefix `A#<activity>#`; state filtered in the Lambda; paginated at 200 |
| PeerIndex | `T#<t>#PA#<module>#<activity>` | `R#<round>#<submission_ref>` and `V#<reviewer>` | ~200 B | Query per round before a pass |
| Calendar event | `T#<t>#CAL#<subject>` | `E#<at_hlc16>#<activity>` | ~200 B | Query the collection for ICS and the API |
| KeyRelease | `T#<t>#KR#<item>#<cohort>` | `HDR` | ~150 B | GetItem per `GET /keys/release`; written when key, deadline or policy facts fold |
| Reminder schedule | `T#<t>#RM#<module>#<cohort>` | `D#<deadline_hlc16>#<activity>` | ~150 B | Written when a deadline folds; names the Scheduler one-off |

**Item collection sizing.** A choice activity at the cohort bound with 20 options: 20 × 120 KB = 2.4 MB, read once per instructor open (~300 eventually consistent RRU); learners read only `HDR` counts (1 RRU). A marking queue for a module with 10 activities × 2,000 learners is 20,000 × 300 B = 6 MB; the API reads one activity (≤ 600 KB ≈ 75 RRU) and paginates. A learner's calendar over a five-year programme is ≤ 1,000 events × 200 B = 200 KB. No LSIs, so no 10 GB collection limit applies.

**Hot-partition risk.** A slot stampede ("bookings open at 09:00") puts 2,000 selections into one `SL#` collection inside a minute: ~33 facts/s, folded in FIFO batches of 10, so ≤ 4 CAS writes/s on the option item, far below 1,000 WCU/s. A deadline burst on a 2,000-learner cohort writes the marking queue at ≤ 5 entries/s (project.md §6), one item each. `KR#` items are read-only after fold: 2,000 learners fetching one released key within a minute is ~33 RRU/s on one item, below the 3,000 RRU/s ceiling, and `Cache-Control: private, max-age=86400` keeps repeats on the device. Calendar writes fan out one item per member per deadline fact (≤ 2,000 writes across 2,000 PKs).

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| (fold handlers) | Linked into `view-updater` (MVA-03) | Rust, in-process | +2 ms/fact | — | Fold ACT types into SlotRoster, MarkingQueue, PeerIndex, Calendar, KeyRelease alongside the LearnerRow |
| `key-release` (owned by CAC-09; listed here as ACT-05's dependency) | HTTP API `GET /keys/release/{item}/{cohort}` | Rust, 256 MB | 8 ms | 20 / 60 ms | Session, IDE-09 membership, `KR#` GetItem (a per-(item, cohort) projection of CAC's DeliveryView); inline key or presigned GET |
| `activity-api` | HTTP API `GET /activities/{module}/{activity}/{queue,slots,submissions}`, `POST /slots/{activity}/decide` | Java 21 SnapStart, 512 MB | 25 ms | 300 / 700 ms | Queue, roster, freshness block; decision callback sends the task token |
| `calendar-api` | HTTP API `GET /calendar`, `GET /calendar/{token}.ics` | Java 21 SnapStart, 512 MB | 20 ms | 300 / 700 ms | Token verify; RFC 5545; `Cache-Control: max-age=3600` |
| `slot-reconcile` | Step Functions Standard, started by `effect.ready {kind: slot_overcap}` in the home region | Java 21, 512 MB per task | 50 ms/task | 400 / 900 ms | Snapshot → Notify → Wait (task token, 24 h) → Resolve → Append facts → Apologise; ~12 transitions |
| `peer-allocate` | EventBridge Scheduler (phase deadline + window, then hourly) or on demand | Rust, 512 MB | 0.3–2 s | 20 / 60 ms | Deterministic ring allocation; writes `allocation.v1` through the sync path as `dev_sys_<region>` |
| `reminder-arm` | EventBridge Scheduler one-off per folded deadline; `view.updated` for releases | Rust, 512 MB | 50 ms | 20 / 60 ms | Reads queue entries; creates SideEffectIntents (MVA-08) |
| Device (PWA) | Browser | WASM engine + service worker | ~50 ms instantiate | — | Marks per response (DRV-17); no server cost |

## Propagation path

1. The device appends a fact to IndexedDB with a dense `seq` (FLS-03); the sync agent pushes it to `sync-api` in any zone region (FLS-08), which stamps the envelope and writes the item (FLS-04, FLS-06).
2. The `facts` stream in every region → `stream-router` → SQS FIFO `views` (group = partition) → `view-updater` (MVA-03), whose ACT fold handlers update the LearnerRow's attempt outcomes through the engine and the ACT-owned items; a `deadline.v1` fold also creates the `reminder-arm` one-off schedule.
3. `view.updated` on the regional bus → `nm-recompute` (debounced) evaluates over-capacity per option, release transitions and the grade for assessing; each transition becomes a SideEffectIntent (MVA-08).
4. `intent-evaluator` re-checks after the window and publishes `effect.ready`; only the home region consumes it: `reminder | release | slot_apology` → COM-07 emitter (sent ledger by idempotency key); `slot_overcap` → start `slot-reconcile`.
5. `slot-reconcile` waits on the task token; the instructor's decision reaches `activity-api`, which either has the instructor's device append `struct.v1` (raise cap, CAC-01) or lets the workflow append `slot.v1` through `dev_sys_<region>`; those facts re-enter step 2, and apology intents follow step 4.
6. `peer-allocate` (Scheduler) appends `allocation.v1` facts, which re-enter step 2 and appear in reviewers' next pulls and marking queues.
7. `GET /keys/release` is a synchronous read of the `KR#` item; it propagates nothing.
8. Every ACT fact is visible to DIO-08 on `fact.folded` for the Caliper projection, emitted from the home region.

## Cost model

Fact writes and sync calls for the facts this capability produces are counted in FLS (2.5 M facts, 600 k syncs), bundle delivery in CAC (500 GB), the LearnerRow fold in MVA and emails in COM. The lines below are the increments this capability adds.

| Component | L10k | 1M | Basis |
|---|---|---|---|
| ACT fold writes (queue, slot, calendar, KR, PA items) | 100 k submits + 50 k choices + 500 k calendar fan-outs + 20 k other ≈ 0.7 M WRU × 2 regions ≈ **$0.9** | $90 | $0.625 / M regional WRU; fan-out = 5,000 deadline facts × 100 members |
| Fold compute increment | 5 M facts × 2 ms × 1 GB = 10 k GB-s ≈ **$0.2** | $20 | inside `view-updater` |
| Key release | 500 k calls: API $0.5 + Lambda 500 k × 50 ms × 0.5 GB = 12.5 k GB-s $0.2 + 0.25 M RRU $0.03 ≈ **$0.8** | $80 | 10 k learners × 50 time-locked items, once per device |
| Activity API | 3 M of the 6 M reads: API $3.0 + Lambda 3 M × 30 ms × 0.5 GB = 45 k GB-s $0.75 + 1.5 M RRU $0.2 ≈ **$4.0** | $400 | remaining reads are MVA and CAC |
| Calendar and ICS | 2,000 subscribers × 24 polls/day × 30 = 1.44 M: API $1.4 + Lambda 14 k GB-s $0.25 + 0.7 M RRU $0.1 ≈ **$1.8** | $180 | scales with subscribers, not learners |
| Reminders | 5,000 one-off schedules $0.005 + 5,000 firings × 100 RRU = 0.5 M RRU $0.06 + 50 k intents ≈ **$0.2** | $20 | |
| Slot reconciliation | 40 executions × 12 transitions = 480 × $25 / M ≈ **$0.01**; 240 SES ≈ $0.02 | $3 | 20% of 200 choice activities overbook |
| Peer allocation | 50 workshops × 30 passes × 1 s × 0.5 GB = 750 GB-s $0.01 + 15 k `allocation.v1` × 1.2 rWRU × 2 = 36 k rWRU $0.03 ≈ **$0.05** | $5 | |
| Derived storage (ACT items) | ~2 GB × $0.25 ≈ **$0.5** | $50 | no PITR |
| **Total (both regions)** | **≈ $8.5** | ≈ $850 | linear; ICS polling is the only line that can outgrow learner count |

## Standards conformance

| Standard | Role | Target | In scope | Out of scope and why | Eventual-consistency conflict and resolution |
|---|---|---|---|---|---|
| QTI 3.0 | Delivery system (item and test delivery; response and outcome processing via DRV-04) | Core level plus template processing | Interactions listed in qti-profile.md; `assessmentTest` parts and sections, seeded `selection`/`ordering`, `preCondition`, `branchRule`, `itemSessionControl`, `timeLimits`, `outcomeProcessing` | `drawingInteraction`; `mediaInteraction` (delivered, not marked); `customInteraction`/PCI (roadmap); adaptive items (`adaptive="true"`); `customOperator` (not deterministic) | QTI treats `maxAttempts` and `timeLimits` as delivery constraints; Trellis treats them as advisory (ACT-06) and reproduces them in derivation (`highest_n`, `over_time`). Item session state is not persisted; it is reconstructed from `resp.v1` facts (ACT-08) |
| Caliper Analytics 1.2 | Sensor; projection owned by DIO-08 | Assessment, AssessmentItem, Assignable, Grading profiles | `attempt.start` → AssessmentEvent Started; `attempt.submit` → AssessmentEvent Submitted or AssignableEvent Submitted; `resp` → AssessmentItemEvent Completed; derived ItemOutcome → GradeEvent Graded; `progress viewed` → AssignableEvent Viewed | `client_mark` never projects (DRV-14); Session and ToolUse profiles belong to IDE and LTI | `eventTime` is the `sync_hlc` physical time (monotone, ADR-018) with `device_hlc` in `extensions`; a re-derivation emits a new GradeEvent rather than mutating one; emission only from the home region after fold, so consumers see events later than devices do |
| LTI 1.3 Core (LTI-01) | Platform launching external activities | Resource-link launches from `lti.link.v1` placements; AGS scores back as `ext.score.v1` (LTI-11) | `external` activity kind; completion on score or view | Offline launches: a tool needs a live session, so the client shows "requires connection" and never caches tool content | A score folds first in the receiving region; the device sees it on the next pull with the region label |
| RFC 5545 iCalendar | Producer | VEVENT with UID, SEQUENCE, STATUS, DTSTART/DTEND | Due dates, slots, review due dates, releases | VTODO, VALARM (local reminders are the device's, ACT-16), recurrence rules | Two regions may serve different `SEQUENCE` values briefly; consumers keep the higher |
| WCAG 2.2 | Conformance target for the runtime | AA | Shell, every interaction, feedback rendering | Third-party LTI tool content is the tool's responsibility | None |

## Known Tensions

1. **Time limits and attempt caps cannot be enforced on an untrusted client.** Where it breaks: a learner who edits the client, pauses the monotonic clock or starts attempts on a second device exceeds the limit, and the server sees only `elapsed_ms` and attempt counts it did not control. Symptom: `over_time`, `over_limit` and duplicate attempt numbers on a formative quiz. Options: (a) accept, flag, and reproduce the intent in derivation with `highest_n` and the `over_time` policy; (b) `server_only` marking with the attempt window measured by `sync_hlc` of start and submit, forcing the learner online for the whole attempt; (c) an external proctored tool through LTI-01 for anything that matters. Recommendation: (a) for every activity in a formative-first product, with (c) documented as the summative path; (b) buys little because the stamps bound only the online portion.

2. **One submission per item is not enforced.** Where it breaks: two devices or a retried client produce two `attempt.submit.v1` at the same `attempt_n`. Symptom: the learner sees two "attempt 2" entries and asks which counts. Options: (a) accept both, apply `first`/`latest`/`best`, display both with device labels (ACT-14); (b) server adjudication by `sync_hlc` with a void of the loser, a cross-region decision two regions could make differently; (c) a client-side "submitted" lock, which is UX only. Recommendation: (a) with (c) as the UX default.

3. **Slot overbooking and the apology path.** Where it breaks: capacity is a count the regions cannot agree on in real time. Symptom: a learner who saw "9 of 10 places" and booked is later bumped, after up to 24 h of ambiguity while the instructor decides. Options: (a) the ACT-09 workflow with "provisional" display until confirmed; (b) online-only booking on a region-local conditional counter, which still overbooks across regions and violates availability; (c) a display buffer that shows `capacity − 10%` as full so mild overbooking is absorbed silently. Recommendation: (a), with (c) as an instructor option for scarce physical resources; never (b).

4. **Group submission when membership changes after submission.** Where it breaks: attribution is a function of membership facts at the submit fact's `sync_hlc`, but membership facts can replicate later and instructors move people between groups after the fact. Symptom: a learner who left a group keeps its mark; one who joined after submission has none. Options: (a) attribute at submission time (deterministic, explainable); (b) attribute at derivation time (marks move with membership, not explainable); (c) attribute at the deadline. Recommendation: (a), with `override.v1` for the instructor to grant or remove attribution and a queue note listing members whose membership changed since submission.

5. **Drafts lost if a device is wiped before sync.** Where it breaks: unsent drafts are device-only by design (ACT-01); a lost, reset or quota-cleared device loses them, and loses unpushed facts if the browser discards site data despite `persist()`. Symptom: "I wrote two pages and they're gone." Options: (a) accept; (b) save a `resp.v1` on every item navigation, blur and 60 s idle so the draft becomes a fact bounded to the last minute of typing, at roughly 3× response fact volume; (c) per-device encrypted draft backup to S3, a second sync channel with its own failure modes. Recommendation: (b), with keystroke-level drafts staying local; the residual loss is one item's latest edits plus whatever the agent had not pushed, which the "not yet synced" count makes visible.

6. **Answer-key exposure.** Where it breaks: on-device marking needs the key on the device; `after_submit` is a UX gate, and a cohort-wide `time_locked` release exposes the key to learners with extensions who have not yet submitted. Symptom: a determined learner reads correct responses from the bundle. This is the accepted trade for immediate offline feedback; the levers are CAC-09 and the consolidated analysis is `openspec/known-tensions.md` §4. Recommendation: default `immediate` for practice, `time_locked` for anything that counts with a publish-time warning when the cohort has open extensions, and `server_only` for banks reused summatively.

7. **Anonymous marking is presentational.** Where it breaks: a marker's device holds subject-keyed facts because streams are keyed by subject (FLS-10); `anon_id` is a view flag. Symptom: a marker who inspects local storage learns identities. Options: (a) accept and say so in the UI; (b) server-rendered marking only, which removes offline marking; (c) pseudonymous re-keying at the sync boundary, which breaks stream density and fact identity. Recommendation: (a); tenants needing blind marking with a technical guarantee use an external tool (LTI-01).
