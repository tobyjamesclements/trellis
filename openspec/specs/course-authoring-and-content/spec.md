# Course Authoring and Content Specification

Capability ID prefix: **CAC**

## Purpose

This capability owns what editors produce: the tenant course catalogue and
category tree, course structure (sections, resources, activity placements),
the QTI 3.0 item bank, answer keys, rubrics, derivation policies, deadlines,
publishing, and the per-module offline bundles that devices prefetch.
Structure is an operation log; content is content-addressed blobs; keys,
rubrics and policies are versioned by content hash so that a change
re-derives rather than migrates (ADR-005). Nothing here stores a mark, a
completion state or a roster. It appends facts through FLS and hands
versions to the derivation engine (DRV) and the view updater (MVA).

## Consistency boundary

Authoring facts have `subject = course` (or `subject = tenant` for the
catalogue) and `scope = _struct`. They are ordinary facts: immutable,
content-addressed, union-merged (FLS-01, FLS-02). Every mutable notion an
editor sees — "the current structure", "the current key for item X", "the
current publish" — is a region-owned fold in `derived`, computed from that
region's replica, stamped with the vector of the course's `_struct` streams,
and recomputable (ADR-004). Concurrent edits from any number of editors in
any region converge without coordination because every operation is
last-writer-wins by `(sync_hlc, fact_id)` per (node, property) and the fold
is deterministic over the fact set at a vector. There is no lock, no edit
token and no global "current version" record. Publishing is itself a fact;
two regions can each publish, both publishes are retained, the derived
current is a deterministic choice, and the loser is told. Blobs never change
once written: a new version is a new hash (ADR-017).

## Domain model

```
Course        subject { kind: C, id: crs_<ULID> }; one `_struct` scope
Node {
  node_id     : n_<ULID>, or mod_<ULID> for a top-level section (= module)
  kind        : section | page | file | folder | url | book | chapter | label | itemref |
                quiz | assignment | choice | forum | workshop | lti
  position    : { parent: node_id, order_key: string }   -- fractional ordering key (base-62)
  props       : { name → { value, hlc, fact_id } }         -- LWW by (sync_hlc, fact_id) per prop
  removed     : { hlc, fact_id } | null                     -- superseding; a later add_node re-adds
}
StructureSnapshot (derived, per course per region)
              { vector: {stream → hwm}, generation, nodes{}, unplaced[], items{}, keys{},
                rubrics{}, policies{}, deadlines{}, publishes[], current_publish }
Item          { item_id: itm_<ULID>, versions: [item_blob], current: item_blob }  -- version = hash
KeyDocument   C14N 2.0 serialisation of responseProcessing + correctResponse + mapping +
              templateProcessing extracted from the item blob
key_version   "kv_" + base32(SHA-256(KeyDocument))[0:26]
rubric_version "rv_" + base32(SHA-256(canonical rubric blob))[0:26]
policy_version "pv_" + base32(SHA-256(canonical effective policy document))[0:26]
Publish       { vector, snapshot_hash, bundle_hash, supersedes?: fact_id }
BundleManifest per module { publish, snapshot_hash, nodes[], blobs[{hash, bytes, mime}],
                items[{item, delivery_blob, key_version, marking: client|server_or_human,
                       key: {mode, blob?}}], search_index_blob, a11y_report_blob,
                cohort_overlays{ cohort → { item → { enc_key_blob, rk_ct } } } }
DeliveryView  (derived, per (course, cohort) per region)
              { bundle_hash, deadlines{activity → hlc}, policy_version, time_lock{item →
                {reveal_hlc, releasable}}, vector }
```

Fact bodies for the types already registered to CAC in `fact-types.md`:

```
struct.v1   { op: add_node|remove_node|move_node|set_prop, node, kind?, parent?, order_key?,
              prop?, value?, restore_of?: fact_id }          -- value > 4 KB → body_ref (FLS-12)
item.v1     { item, item_blob, delivery_blob, title, interactions[], origin?: {course, item} }
key.v1      { item, item_blob, key_blob, key_version }
rubric.v1   { rubric: rub_<ULID>, rubric_blob, rubric_version, title }
policy.v1   { layer: course|module|activity, target: node_id, cohort: "*"|coh_<ULID>,
              document, policy_version }
deadline.v1 { activity: node_id, cohort: "*"|coh_<ULID>, due_hlc, close_hlc?, open_hlc?,
              reveal_after_ms? }
publish.v1  { vector, snapshot_hash, bundle_hash, label?, supersedes?, a11y_ack?: [finding_id] }
```

New fact type defined by this spec (to be merged into the registry):

| Type | Owner | Subject kind | Scope | Writer | PII | Purpose |
|---|---|---|---|---|---|---|
| `catalogue.v1` | CAC | T | `_struct` | admin / course designer | T | Tenant category tree and course catalogue operation (`add_node`, `remove_node`, `move_node`, `set_prop` on categories; `place_course` with visibility and template flag) |

Types owned elsewhere that CAC reads or references: `lti.link.v1` (LTI),
`align.v1` (CRD), `cc.import.v1` (DIO), `extension.v1` and `mark.v1` (ACT),
`role.v1` (IDE), `flag.v1` (ADM).

---

## Requirements

### Requirement: The system SHALL represent course structure as an operation log of `struct.v1` facts and derive a structure snapshot per course per region [CAC-01]

The system SHALL represent course structure as an operation log of `struct.v1` facts and derive a structure snapshot per course per region.
`struct.v1` facts have `subject = course`, `scope = _struct` and a writer
device whose principal holds an editor role over the course (FLS-11,
IDE-08, IDE-09). Operations: `add_node` (kind, parent, `order_key`);
`remove_node` (superseding — a later `add_node` for the same node re-adds it;
no void is needed); `move_node` (new parent and a fractional `order_key`
generated between the neighbours' keys; equal keys order by `node_id`);
`set_prop` (last-writer-wins by `(sync_hlc, fact_id)` per (node, prop)).
Each region folds the course's `_struct` facts into `T#t#CS#<course>`
(nodes, skeleton index, header carrying the vector of the `_struct`
streams); nodes whose parent chain does not reach the root (removed parent,
concurrent moves forming a cycle) are listed under `unplaced`, never
dropped. Top-level sections are modules; an activity's learner-fact scope
is the module of its first publish and does not change when the node is
moved.

#### Scenario: Concurrent insert at the same place in two regions
- **WHEN** editor A in eu-west-1 and editor B in eu-central-1 each add a page after the first page of section 2 before either fact replicates
- **THEN** both nodes exist in every region's snapshot once the facts have replicated
- **AND** siblings are ordered by `order_key` then `node_id`, identically in every region

#### Scenario: Recompute equals fold
- **WHEN** a region's `T#t#CS#<course>` items are deleted
- **THEN** `struct-updater` regenerates every node from the `_struct` facts at the same vector, byte-identical excluding `computed_at`

#### Scenario: Cycle from concurrent moves
- **WHEN** A moves section X under Y while B moves Y under X
- **THEN** both nodes appear under `unplaced` with the two move facts named, and the next `move_node` by either editor resolves it

### Requirement: The system SHALL maintain the tenant course catalogue and category tree as `catalogue.v1` facts with subject = tenant, deriving a catalogue view per region [CAC-02]

The system SHALL maintain the tenant course catalogue and category tree as `catalogue.v1` facts with subject = tenant, deriving a catalogue view per region.
Categories form a tenant-level tree with the operation set of CAC-01,
`subject = {kind: T, id: tenant}`, `scope = _struct`, writers admin or
course designer. A course is created by minting `crs_<ULID>` on the editor
device and appending `catalogue.v1 place_course {course, category,
visibility, short_code}` plus the course's root `struct.v1`. Uniqueness of
names and short codes is not enforced: duplicates are shown side by side
with their creators and reconciled by an admin (rename, or retire one and
copy per CAC-17) (ADR-009). The derived catalogue `T#t#CAT` lists
categories and courses with `visibility ∈ {visible, hidden, retired}`,
format, template flag and the vector it was folded at.

#### Scenario: Same short code created twice
- **WHEN** two admins create courses with short code `BIO101` in two regions within replication lag
- **THEN** both courses exist and the catalogue view flags `duplicate_code` on both
- **AND** the admin console offers rename or retire-and-copy; nothing is rejected

#### Scenario: Category removed while a course is placed into it
- **WHEN** a `remove_node` for a category and a `place_course` into it are concurrent
- **THEN** the course appears under `unplaced` in the catalogue view and remains enrolable

### Requirement: The system SHALL store all content as immutable, content-addressed blobs in S3, replicated bidirectionally and served through CloudFront with origin-group failover [CAC-03]

The system SHALL store all content as immutable, content-addressed blobs in S3, replicated bidirectionally and served through CloudFront with origin-group failover.
Every file, page body over 4 KB, item, key, rubric, manifest and search
index is an object at `content/<sha256>` in the zone's per-region buckets
(ADR-017); identical bytes yield the same key in every region, so
cross-region replication conflicts are content-identical. Uploads use
presigned PUTs from `blob-presign` (FLS-12) carrying
`x-amz-checksum-sha256`, so a corrupted upload is refused by S3. Reads go
through one CloudFront distribution per zone with an origin group (serving
region primary, peer region secondary) and tenant-scoped signed cookies;
possession of a hash disclosed through an authorised manifest is the read
capability. Blobs are never overwritten; removal is takedown of the object
(ADM-12) plus a void of the referencing fact. Blobs no fact references are
swept quarterly against the fact export (FLS-20).

#### Scenario: Fresh upload not yet replicated
- **WHEN** an editor in eu-central-1 uploads a 30 MB PDF and a learner routed to eu-west-1 opens it 5 s later
- **THEN** CloudFront receives 404 from the eu-west-1 origin, fails over to eu-central-1 and serves the object
- **AND** the learner sees no error

#### Scenario: Same file in two courses
- **WHEN** the same PDF is uploaded to two courses by different editors
- **THEN** one object exists per region and both courses' `file` nodes reference the same hash

### Requirement: The system SHALL provide sections, resources and activity placements as typed nodes, with the course format as a presentation property [CAC-04]

The system SHALL provide sections, resources and activity placements as typed nodes, with the course format as a presentation property.
Node kinds: `section` (top-level sections are modules), `page` (HTML
`body`), `file` (blob hash, name, mime, bytes), `folder` (children are
`file` nodes), `url`, `book` (with `chapter` children), `label`, and the
activity kinds `quiz`, `assignment`, `choice`, `forum`, `workshop`, `lti`,
whose behaviour is ACT's and whose configuration is props here. A quiz's
questions are `itemref` child nodes with their own order keys so that
concurrent additions merge. `format ∈ {topics, weekly}` and `start_date`
are root props; weekly section titles are derived from `start_date` at
render time and no section fact is written when the format is switched.

#### Scenario: Two editors add questions to one quiz offline
- **WHEN** editor A appends item 7 and editor B appends item 8 to the same quiz while both are offline, then both sync
- **THEN** the quiz shows both `itemref` nodes, ordered by `order_key`

#### Scenario: Switch to weekly format
- **WHEN** the root `format` prop is set to `weekly` with `start_date = 2026-09-14`
- **THEN** the third section renders as "28 September – 4 October" in every region and no section node changes

### Requirement: The system SHALL keep a QTI 3.0 item bank in which every item version is an immutable blob referenced by `item.v1`, shareable across courses within a tenant [CAC-05]

The system SHALL keep a QTI 3.0 item bank in which every item version is an immutable blob referenced by `item.v1`, shareable across courses within a tenant.
An item is `itm_<ULID>`; each save uploads a new `item_blob` (an
`assessmentItem` XML plus a manifest of referenced media hashes) and its
deterministically stripped `delivery_blob` (key elements removed), then
appends `item.v1`. The current version is the latest effective `item.v1`
by `(sync_hlc, fact_id)`; every version remains listed with its author.
Sharing is by reference: the borrowing course appends its own `item.v1`
with `origin = {course, item}` pinning the blob hash and later adopts newer
versions explicitly; nothing is resolved across courses at delivery time.
A derived tenant index `T#t#BANK` lists items across courses for principals
with bank rights (IDE-09).

#### Scenario: Origin item corrected after sharing
- **WHEN** course A's editor saves a new version of an item that course B borrowed
- **THEN** B keeps its pinned `item_blob` until B's editor adopts the new version, which appends a new `item.v1` in B

#### Scenario: Concurrent saves of one item
- **WHEN** two editors save different versions of the same item within a second in two regions
- **THEN** both blobs and both facts exist, the current version is the higher `(sync_hlc, fact_id)`
- **AND** the other is listed as a version the editor can restore (CAC-13)

### Requirement: The system SHALL define `key_version` as the content hash of an item's marking semantics, publish it by `key.v1`, and require every response fact to record the `key_version` the device used [CAC-06]

The system SHALL define `key_version` as the content hash of an item's marking semantics, publish it by `key.v1`, and require every response fact to record the `key_version` the device used.
`key_version = "kv_" + base32(SHA-256(KeyDocument))[0:26]` where the
KeyDocument is the C14N 2.0 serialisation of the item's
`responseProcessing`, `correctResponse`s, `mapping`s and
`templateProcessing`, in that order. A stem-only edit changes `item_blob`
but not `key_version`; a key correction changes both. At publish the
editor's client appends `key.v1 {item, item_blob, key_blob, key_version}`
for every item whose `key_version` differs from the previously published
one, referenced from the `publish.v1`; the bundle manifest carries
`key_version` per item and the device copies it into `resp.v1` (ACT-01,
ACT-04), where it is plaintext metadata (`fact-types.md`). A newly current
`key_version` emits `version.changed` (MVA-12) and the DRV-05 key-change
policy governs earlier responses.

#### Scenario: Typo fixed in a prompt
- **WHEN** an editor corrects the wording of a question and republishes
- **THEN** no `key.v1` is appended, `key_version` is unchanged and no partition recompute runs

#### Scenario: Wrong option marked correct
- **WHEN** the editor changes `correctResponse` and republishes after 300 learners have answered
- **THEN** `key.v1` with the new hash is appended, `version.changed` fires for the item's module partitions
- **AND** responses stamped with the old `key_version` are re-derived under the course `key_change` policy (DRV-05)

### Requirement: The system SHALL version rubrics and marking guides by content hash, published as `rubric.v1` [CAC-07]

The system SHALL version rubrics and marking guides by content hash, published as `rubric.v1`.
A rubric is a blob (criteria, levels, points, guide text);
`rubric_version = "rv_" + base32(SHA-256(canonical blob))[0:26]`. Attaching
a rubric to an activity is `set_prop(activity, rubric = rub_id)`; publishing
appends `rubric.v1 {rubric, rubric_blob, rubric_version}` when the version
differs from the previously published one. `mark.v1` facts record the
`rubric_version` the marker saw (DRV-08); a new version flags earlier marks
`marked_under_previous_rubric` and never rescores them.

#### Scenario: Rubric revised mid-marking
- **WHEN** a `rubric.v1` with a new hash becomes current after 40 of 100 essays are marked
- **THEN** `version.changed` fires and the 40 outcomes enter the re-mark queue with their scores unchanged

#### Scenario: One rubric on two assignments
- **WHEN** two assignments attach `rub_x`
- **THEN** one blob and one `rubric_version` serve both, and a revision flags marks on both

### Requirement: The system SHALL classify each item's marking mode at publish time against the engine profile as `client` or `server_or_human` [CAC-08]

The system SHALL classify each item's marking mode at publish time against the engine profile as `client` or `server_or_human`.
`publish-prepare` parses each item's `delivery_blob` and KeyDocument with
the engine's QTI front-end (DRV-04) and records `marking = client` iff
every interaction, response-processing operator and template construct is
within `derivation-engine/qti-profile.md` and the item is not
`adaptive="true"`; otherwise `marking = server_or_human` with reasons
(`operator:customOperator`, `interaction:uploadInteraction`,
`human:extendedText_without_pattern`, `adaptive`, `pci`). The
classification is a pure function of `(item_blob, engine_profile_version)`,
stored in the bundle manifest and `I#<item>`; a device never attempts a
client mark on a `server_or_human` item and shows "marked after sync".

#### Scenario: Imported item uses customOperator
- **WHEN** a Common Cartridge import (DIO-11) brings an item whose `responseProcessing` uses `customOperator`
- **THEN** publishing succeeds, the item is `server_or_human` with reason `operator:customOperator`, and the prepare report lists it

#### Scenario: Engine profile extended
- **WHEN** a new engine profile version adds `drawingInteraction`
- **THEN** the next prepare reclassifies affected items; bundles published earlier keep their classification until republished

### Requirement: The system SHALL apply a key visibility policy per item or activity of `immediate`, `after_submit`, `time_locked` or `server_only`, of which only the last two are real barriers [CAC-09]

The system SHALL apply a key visibility policy per item or activity of `immediate`, `after_submit`, `time_locked` or `server_only`, of which only the last two are real barriers.
`key_visibility` is an activity prop with per-item override; default
`immediate`. `immediate`: the key blob is in the bundle and the device
marks on every response. `after_submit`: the key blob is in the bundle but
the client opens it only after it has recorded `attempt.submit.v1`; a
modified client can read it earlier, and that is accepted (ADR-006).
`time_locked`: at prepare the key blob is encrypted (AES-256-GCM) under a
per-(item, cohort) release key obtained from KMS `GenerateDataKey` under the
tenant's multi-Region key (ADR-022); the encrypted blob and the KMS
ciphertext of the release key travel in the cohort overlay; a region hands
the plaintext release key to an enrolled device (IDE-09) only when its own
clock is past `reveal_hlc` (effective deadline for the cohort plus
`reveal_after_ms`, read from the DeliveryView, not from the bundle); device
marking is deferred until release. `server_only`: the key blob is encrypted
under a key only the native engine's role can use; derivation happens in
the view updater and feedback reaches the device after sync. `immediate`
and `after_submit` are client conventions; `time_locked` and `server_only`
are the only modes that withhold anything from a device.

#### Scenario: Modified client under after_submit
- **WHEN** a tampered client reads the key blob before submitting
- **THEN** nothing prevents it; the server still derives the true score from the response facts (DRV-14) and the learner's mark is unaffected

#### Scenario: Time-locked quiz answered offline
- **WHEN** a learner answers a `time_locked` quiz offline two days before `reveal_hlc` and syncs a day after it
- **THEN** the device shows "marked after <reveal>" until the sync, then obtains the release key from `key-release`, decrypts the key blob and marks locally
- **AND** the server's derived row already carries the mark, because the native engine holds the plaintext key

#### Scenario: server_only item
- **WHEN** an item is `server_only`
- **THEN** the bundle carries `key: {mode: server_only}` with no blob, the device records responses without a `client_mark`, and feedback appears after the first sync that folds them

### Requirement: The system SHALL express derivation policy settings as `policy.v1` facts versioned by content hash [CAC-10]

The system SHALL express derivation policy settings as `policy.v1` facts versioned by content hash.
A `policy.v1` carries a complete policy document for one layer (`course`,
`module`, `activity`) and cohort (`*` or one cohort): `attempts`,
`key_change`, `lateness`, `penalty`, `aggregation`, `markers`,
`epoch_hlc`, `completion` criteria, `availability` conditions and
`at_risk` rules (DRV-05, -06, -07, -08, -10, -11, -16; MVA-09). Its
`policy_version` is the hash of that document. The effective policy for a
`(module, cohort)` is resolved by specificity (activity over module over
course; cohort over `*`) and, within a layer, by `(sync_hlc, fact_id)`; the
`policy_version` recorded in provenance and ViewHeaders is the hash of the
resolved document. Policies are live, not publish-gated; a change to an
effective document emits `version.changed` (MVA-12).

#### Scenario: Quiz attempt limit changed for one cohort
- **WHEN** an instructor sets `attempts = highest_n(3)` for cohort `coh_a` on one quiz
- **THEN** only `(module, coh_a)` partitions re-derive under a new `policy_version`; other cohorts keep theirs

#### Scenario: Two instructors set conflicting weights
- **WHEN** two `policy.v1` facts for the same layer and cohort arrive from two regions
- **THEN** the higher `(sync_hlc, fact_id)` is effective everywhere once replicated, the other is visible in history, and neither is rejected

### Requirement: The system SHALL record deadlines as advisory `deadline.v1` facts per (activity, cohort) and fold them into the deadline index used at ingest [CAC-11]

The system SHALL record deadlines as advisory `deadline.v1` facts per (activity, cohort) and fold them into the deadline index used at ingest.
`deadline.v1 {activity, cohort, due_hlc, close_hlc?, open_hlc?,
reveal_after_ms?}`; cohort `*` is the default that a cohort-specific fact
overrides; the latest by `(sync_hlc, fact_id)` per (activity, cohort) is
effective. Deadlines never cause rejection (ADR-008); `struct-updater`
writes them to `derived` `T#t#DL#<module>` `I#<activity>` (a map cohort →
deadline) which FLS-06 reads to stamp `late`, and to the DeliveryView;
DRV-07 recomputes lateness with `extension.v1`. Calendar (ACT) derives from
the same index.

#### Scenario: Deadline extended for a cohort after publish
- **WHEN** a `deadline.v1` for `(quiz_3, coh_b)` moves the due date a week later
- **THEN** the DL index and DeliveryView update without a republish, and later ingests stamp `late` against the new date

#### Scenario: Deadline fact not yet replicated at ingest
- **WHEN** a learner syncs to a region that has not folded the new deadline
- **THEN** the fact may be stamped `late = true`; the view re-derives it on time once the deadline folds (FLS-06)

### Requirement: The system SHALL publish by a `publish.v1` fact referencing the snapshot vector and bundle hash, retain concurrent publishes, derive the current one deterministically and tell the losing editor explicitly [CAC-12]

The system SHALL publish by a `publish.v1` fact referencing the snapshot vector and bundle hash, retain concurrent publishes, derive the current one deterministically and tell the losing editor explicitly.
The editor syncs, then calls `publish-prepare` with the course vector; the
region builds the snapshot at that vector, classifies items (CAC-08),
splits keys, encrypts time-locked keys, builds bundles (CAC-14) and the
search index (CAC-15), runs accessibility checks (CAC-16), uploads all as
blobs and returns `{snapshot_hash, bundle_hash, key_changes[],
rubric_changes[], report}`; the editor's client then appends the
`key.v1`/`rubric.v1` facts and `publish.v1 {vector, snapshot_hash,
bundle_hash, supersedes}` from its own stream. Prepare is pure: two editors
preparing the same vector obtain the same hashes. Every `publish.v1` is
kept as `PUB#<sync_hlc>#<fact_id>`; the derived current is the maximum by
`(sync_hlc, fact_id)`. When a publish is superseded within 10 minutes by one
that does not dominate its vector, the fold emits `publish.conflict` and
the losing editor is notified (COM-07) and shown the conflict in the
publish history; the merged draft already contains both editors' operations,
so a one-click republish at the union vector resolves it.

#### Scenario: Two regions publish within replication lag
- **WHEN** editor A publishes at vector `{a: 40}` in eu-west-1 and editor B at `{b: 12}` in eu-central-1 within 3 s
- **THEN** both `PUB#` items exist in every region, the current is the higher `(sync_hlc, fact_id)`
- **AND** the other editor receives "your publish was superseded by <editor> at <time>; republish to include your changes"

#### Scenario: Region behind the requested vector
- **WHEN** an editor asks to prepare at a vector the region does not yet dominate
- **THEN** prepare returns `behind = [{stream, have, want}]` and the client retries or prepares at the region's vector

### Requirement: The system SHALL let any number of editors edit concurrently without locks, resolving per property by last writer, keeping every version visible, and expressing "restore" as new operations [CAC-13]

The system SHALL let any number of editors edit concurrently without locks, resolving per property by last writer, keeping every version visible, and expressing "restore" as new operations.
There is no edit lock, checkout or edit token. Conflicting `set_prop`
facts on one (node, prop) resolve by `(sync_hlc, fact_id)`; the loser's
value remains in the log and in the per-node history `H#<node>`. "Restore
to version" appends new `struct.v1` ops carrying `restore_of` the fact
being restored; nothing is voided. Presence ("X is editing this page") is
a hint via the regional bus, never a lock.

#### Scenario: Same paragraph edited by two editors
- **WHEN** two editors save different bodies for one page 4 s apart
- **THEN** the later `(sync_hlc, fact_id)` wins in every region
- **AND** the first editor's client shows "your version was replaced by <editor>'s; restore" and restoring appends a new `set_prop` with `restore_of`

#### Scenario: Restore a deleted section
- **WHEN** an editor restores a section removed a week ago
- **THEN** an `add_node` with `restore_of` and its children's `add_node`s are appended and the section reappears with its props at their latest values

### Requirement: The system SHALL build per-module offline bundles at publish so devices can prefetch a module's content, items, keys or time-lock stubs and search index by hash [CAC-14]

The system SHALL build per-module offline bundles at publish so devices can prefetch a module's content, items, keys or time-lock stubs and search index by hash.
`publish-prepare` writes one BundleManifest per module (blob hashes with
sizes, `delivery_blob` and `key_version` per item, key blobs for
`immediate`/`after_submit`, cohort overlays with encrypted key blobs and
release-key ciphertext for `time_locked`, nothing for `server_only`, the
search index blob, alignments, LTI placement metadata) and a course-level
index of module manifests whose hash is `bundle_hash`. Devices learn the
current `bundle_hash` from the DeliveryView (sync `advice.bundles` or
`GET /courses/{c}/delivery`) and fetch only hashes missing from their local
store, so a republish transfers only what changed.

#### Scenario: Republish after a one-page edit
- **WHEN** a course of 400 blobs is republished with one page changed
- **THEN** a device that holds the previous bundle downloads the new manifest and one blob

#### Scenario: Prefetch before travel
- **WHEN** a learner opens a module while online
- **THEN** the device fetches the manifest and every listed blob in the background, and the module is fully usable offline, including client marking where the manifest permits

### Requirement: The system SHALL prebuild a per-course search index blob at publish and a per-tenant catalogue index, with no search service [CAC-15]

The system SHALL prebuild a per-course search index blob at publish and a per-tenant catalogue index, with no search service.
Prepare builds an inverted index over page, label and book text, resource
titles and item stems (not keys) as one blob per course, listed in every
module manifest; the device queries it locally (ADR-016). The tenant
catalogue index is rebuilt by `catalogue-index` within 60 s of a catalogue
fold. Draft search runs on the editor's client over the draft snapshot.

#### Scenario: Learner searches offline
- **WHEN** a learner searches "osmosis" with no connectivity
- **THEN** results come from the prefetched index blob and link to nodes in the local bundle

#### Scenario: Index is stale for a draft
- **WHEN** an editor searches for text added since the last publish
- **THEN** the client searches the draft snapshot and labels results "unpublished"

### Requirement: The system SHALL run advisory accessibility checks against WCAG 2.2 AA on authored content and attach the report to the publish [CAC-16]

The system SHALL run advisory accessibility checks against WCAG 2.2 AA on authored content and attach the report to the publish.
Prepare checks authored HTML and items for missing alternative text,
heading order, colour contrast in inline styles, table headers, link text,
missing captions or transcripts on media references, and QTI accessibility
attributes; the report is a blob referenced by the manifest and shown on
save and before publish. Findings never block publishing; a tenant flag
(ADM-05) may require the editor to acknowledge them (`publish.v1.a11y_ack`).

#### Scenario: Image without alt text
- **WHEN** a page contains an image without alternative text
- **THEN** the editor sees the finding at save, prepare lists it, and the publish proceeds with or without an acknowledgement as tenant policy requires

### Requirement: The system SHALL create courses from templates and by copy through a paced workflow that replays the source snapshot as new operations referencing the same blobs [CAC-17]

The system SHALL create courses from templates and by copy through a paced workflow that replays the source snapshot as new operations referencing the same blobs.
A template is a course flagged `template` in the catalogue. Copy runs as a
Step Functions Standard workflow acting as a dedicated writer device
(`dev_imp_<execution>`, `writer_principal` = requesting editor, dense seqs
held in workflow state): it reads the source's current published snapshot,
mints new node and item ids, appends `struct.v1`, `item.v1`, `key.v1`,
`rubric.v1` and `policy.v1` into the new course, sets `copied_from` on the
root and places the course in the catalogue. Blobs are shared by hash, not
copied. Learner facts, deadlines and cohorts are not copied. Cross-tenant
transfer is Common Cartridge export and import (DIO-12, DIO-11).

#### Scenario: New term from a template
- **WHEN** an instructor creates a course from a 3,000-node template
- **THEN** the workflow appends ~3,500 facts at ≤ 500 facts/s, the course is usable in about 10 s, and no S3 object is copied

#### Scenario: Source edited during copy
- **WHEN** the template is edited while a copy runs
- **THEN** the copy reflects the published snapshot it started from and records that publish's `fact_id` in `copied_from`

### Requirement: The system SHALL place LTI resource links as `lti` nodes referencing `lti.link.v1` facts created by deep linking or by hand [CAC-18]

The system SHALL place LTI resource links as `lti` nodes referencing `lti.link.v1` facts created by deep linking or by hand.
Deep Linking (LTI-13) returns content items; the platform appends
`lti.link.v1` (LTI-owned, subject = course) and the editor's client appends
`struct.v1 add_node(kind = lti, link_ref)`. The manifest carries the
placement's title, custom parameters and launch presentation, never
secrets; an `lti` node is shown as a placeholder offline and launches when
online (LTI-01).

#### Scenario: Deep-link response arrives in another region
- **WHEN** the tool's deep-link response lands in region B while the editor's structure ops were written in region A
- **THEN** both facts union and the placement appears in the snapshot after replication with no coordination

### Requirement: The system SHALL attach CASE alignments to nodes and items as `align.v1` facts and carry them in bundles [CAC-19]

The system SHALL attach CASE alignments to nodes and items as `align.v1` facts and carry them in bundles.
Alignments reference CFItem identifiers from frameworks imported by CRD-02
(`align.v1`, CRD-owned, subject = course); the editor attaches them from
the item or activity settings, the manifest lists them per node and item,
and CRD-04 derives mastery. Removing an alignment is a superseding
`align.v1` with `state = removed`.

#### Scenario: Framework not yet imported in the region
- **WHEN** an editor aligns an item to a CFItem whose framework has not folded in the serving region
- **THEN** the alignment is stored by identifier and rendered by label once the framework folds

### Requirement: The system SHALL keep large media outside the blob store by default and make egress cost visible to editors [CAC-20]

The system SHALL keep large media outside the blob store by default and make egress cost visible to editors.
Video and audio are embedded as `url` nodes or LTI placements to external
providers; the blob store accepts media up to a tenant cap (default 100 MB
per blob, 5 GB per course, ADM-15) and the editor sees the projected
monthly egress (`bytes × learners × $0.085/GB` beyond the free tier)
before upload. Bundles list media blobs as optional so devices prefetch
them only on Wi-Fi or on request.

#### Scenario: Instructor uploads a lecture recording
- **WHEN** a 2 GB video is dropped into a section
- **THEN** the client does not start the upload (the cap is a client and presign-time limit, not a global invariant) and offers placement by URL or LTI
- **AND** a 60 MB clip within the cap shows "≈ $0 this month under the free tier; ≈ $5/month per 1,000 learners beyond it"

### Requirement: The system SHALL pace bulk authoring writes at or below 500 facts per second per course partition key [CAC-21]

The system SHALL pace bulk authoring writes at or below 500 facts per second per course partition key.
Course copy, template instantiation and Common Cartridge import (DIO-11)
write to one `facts` PK (`T#t#S#C#<course>`); the workflow paces at
≤ 500 facts/s (≈ 600 WCU/s at 1.2 KB, below the 1,000 WCU/s ceiling,
FLS §DynamoDB). Interactive editing is paced by FLS-08's 100-fact batches.
Throttles are absorbed by FLS-13 queued acceptance, never surfaced as
failure.

#### Scenario: 20,000-fact import
- **WHEN** a Common Cartridge with 20,000 resulting facts is imported
- **THEN** the workflow completes in about 40 s with no throttled writes and reports progress per 1,000 facts

### Requirement: The system SHALL edit page, book, item and rubric text bodies as Automerge documents whose changes are facts and whose published form is a materialised blob [CAC-22]

The system SHALL edit page, book, item and rubric text bodies as Automerge documents whose changes are facts and whose published form is a materialised blob.
Each body is an Automerge document in scope `_doc#<doc_id>` under the
course subject (FLS-21, ADR-023) with rich-text marks. Editors' devices
append `am.change.v1` facts; `struct-updater` materialises documents with
the Automerge Java binding, caches snapshots by heads, and exposes
concurrent values on the same key as visible conflicts (CAC-13). At publish,
`publish-prepare` renders the materialised document to sanitised HTML
stored as a content-addressed blob in the bundle, so learners never need
Automerge to read content. Reordering blocks inside a document uses list
operations; a concurrent move of the same block by two editors is
de-duplicated deterministically by block id at materialisation and noted in
history.

#### Scenario: Concurrent paragraph edits
- **WHEN** two editors change different sentences of the same page offline
- **THEN** after sync every region materialises a page containing both edits and the history shows both changes

#### Scenario: Concurrent block move
- **WHEN** two editors move the same block to different positions concurrently
- **THEN** the materialised page contains the block once, at the position chosen by the deterministic rule, and history records the duplicate that was collapsed

---

## DynamoDB access patterns

### `facts` (global table) — items written by this capability

| # | Access pattern | Key condition | Notes |
|---|---|---|---|
| 1 | Append authoring fact | `PK = T#t#S#C#<course>`, `SK = F#_struct#<dev>#<seq10>`, `attribute_not_exists(PK)` | Via `sync-api` (FLS-04); types `struct/item/key/rubric/policy/deadline/publish.v1` |
| 2 | Append catalogue fact | `PK = T#t#S#T#<tenant>`, `SK = F#_struct#<dev>#<seq10>` | `catalogue.v1` |
| 3 | All `_struct` facts for a course | `PK = T#t#S#C#<course>`, `SK begins_with F#_struct#` | Recompute, verifier, copy source, per-node history beyond `H#` |
| 4 | Editor pull of a stream range | `SK BETWEEN F#_struct#<dev>#<a> AND …#<b>` | FLS-08 pull for editor devices (learners never pull `_struct`) |

### `derived` (regional) — items owned by this capability

| Item | PK | SK | Size | Access |
|---|---|---|---|---|
| Snapshot header | `T#t#CS#<course>` | `HDR` | ~2 KB | GetItem per editor read; CAS on `generation` per fold batch |
| Skeleton index | same | `IDX` | ≤ 300 KB | Tree of ids, kinds, parents, order keys, titles; one GetItem renders the course index |
| Node | same | `N#<node>` | 1–4 KB | GetItem on open; rewritten on LWW change |
| Node history | same | `H#<node>` | ≤ 16 KB | Last 200 ops `(hlc, fact_id, prop)`; older via `facts` #3 |
| Item bank entry | same | `I#<item>` | ~1 KB | Versions, current blob, `key_version`, marking, referencing nodes |
| Key / rubric / policy current | same | `K#<item>`, `R#<rubric>`, `POL#<layer>#<target>#<cohort>` | ≤ 4 KB | Read by prepare and by DRV via DeliveryView |
| Publish record | same | `PUB#<sync_hlc>#<fact_id>` | ~1 KB | Query descending, limit 1 = current; conflict flags |
| DeliveryView | same | `DV#<cohort>` | ≤ 8 KB | One eventually consistent GetItem per learner session |
| Deadline index (FLS-owned PK) | `T#t#DL#<module>` | `I#<activity>` | ≤ 5 KB | Map cohort → deadline; read by FLS-06 at ingest |
| Catalogue | `T#t#CAT` | `HDR`, `C#<category>`, `CRS#<course>` | ≤ 2 KB each | Query prefix for the catalogue page |
| Tenant bank index | `T#t#BANK` | `I#<course>#<item>` | ~0.5 KB | Query prefix; cross-course browse |
| Prepare job | `T#t#CS#<course>` | `B#<job>` | small | Status of an async prepare; TTL 7 d |

GSIs: none. Every read is keyed by course, tenant or module; the tenant
bank index replaces the one cross-course query a GSI would have served.

**Item collection sizing.** A large course (500 nodes, 300 items, 50
publishes, 20 cohorts): 2 KB + 300 KB + 500 × 3 KB + 500 × 16 KB + 300 ×
1 KB + 50 × 1 KB + 20 × 8 KB ≈ 10.4 MB in `derived`; ~10 MB of `_struct`
facts in `facts` (FLS §DynamoDB). No LSIs, so the 10 GB limit is moot.

**Hot-partition risk.** `_struct` writes for one course come from tens of
editors at ≈ 1 fact/s each; bulk workflows are capped at 500 facts/s
(CAC-21), under the 1,000 WCU/s ceiling. In `derived`, `HDR` and `IDX` get
one write per fold batch; a 20-editor burst is ≤ 2 writes/s. Learner
traffic touches only `DV#` reads (≈ 300 k/month at L10k, ~0.1/s) and
CloudFront; deadline bursts never reach this capability's items.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `struct-updater` | SQS FIFO `struct` (group = subject id), batch 10 | Java 21 SnapStart with the Automerge Java binding, 1024 MB | 8 ms/fact | 500 / 1,200 ms | LWW fold; Automerge materialisation for `_doc#` scopes (CAC-22); CAS on `generation`; DL index; DeliveryView; emits events |
| `authoring-api` | HTTP API `GET /courses/*`, `/catalogue/*`, `/bank/*`, `/history/*` | Java 21 SnapStart, 1024 MB | 25 ms | 300 / 700 ms | Snapshot, history, conflict list; writes go through `sync-api` |
| `publish-prepare` | HTTP API `POST /courses/{c}/publish/prepare` (≤ 1,000 nodes) else Step Functions Express | Java 21 SnapStart, 2048 MB | 0.5–5 s | 500 / 1,200 ms | Snapshot at vector, key split, classification, time-lock encryption, index, a11y, manifests → S3 |
| `delivery-api` | HTTP API `GET /courses/{c}/delivery` | Java 21 SnapStart, 512 MB | 8 ms | 300 / 700 ms | DeliveryView with vector |
| `key-release` | HTTP API `GET /keys/release/{item}/{cohort}` (ACT-05 is the runtime's contract for it) | Java 21 SnapStart, 512 MB | 12 ms | 300 / 700 ms | Enrolment + reveal check; KMS Decrypt cached per (item, cohort) |
| `content-access` | HTTP API `POST /content/session` | Java 21 SnapStart, 512 MB | 10 ms | 300 / 700 ms | CloudFront signed cookie, tenant-scoped, 12 h |
| `course-copy` | Step Functions Standard (copy, template, CC import hand-off) | Java 21, 1024 MB | 2 s / 1,000 facts | 400 / 900 ms | Paced ≤ 500 facts/s; durable seqs in state |
| `catalogue-index` | EventBridge `catalogue.updated` → SQS delay 60 s | Java 21 SnapStart, 512 MB | 120 ms | 400 / 900 ms | Tenant catalogue index blob |
| `blob-sweep` | EventBridge Scheduler, quarterly | Java 21, 1024 MB | — | — | Unreferenced blobs vs FLS-20 export |

## Propagation path

1. Editor device → `POST /sync/v1` (FLS-08) with `_struct` facts; `sync-api` checks the editor role (FLS-11) and stamps `sync_hlc`.
2. `facts` stream → `stream-router` (FLS-17) → SQS FIFO `struct` (group = subject id) for facts with `scope = _struct` and subject kind C or T.
3. `struct-updater` folds (LWW per (node, prop)), writes `N#`/`IDX`/`HDR`/`I#`/`K#`/`R#`/`POL#`/`PUB#`/`DV#`, the FLS deadline index, `T#t#CAT`, `T#t#BANK`; publishes to the regional EventBridge bus: `struct.updated`, `catalogue.updated`, `deadline.changed`, `version.changed {kind: key|rubric|policy, course, module, version}` (→ MVA-12 partition recompute), `publish.current`, `publish.conflict`.
4. `publish.conflict` and `deadline.changed` are consumed by COM-07 in the home region only, recorded in the sent ledger; they are monotone (a fact exists) so no stability window applies.
5. Publish: `publish-prepare` → S3 `content/<sha256>` (CRR to the peer region) → editor appends `key.v1`/`rubric.v1`/`publish.v1` → steps 1–3 → `DV#` carries the new `bundle_hash` → devices see it in sync `advice.bundles` → CloudFront fetch with origin-group failover.
6. Time-lock: no scheduled release; `key-release` evaluates `reveal_hlc` from `DV#` against the region clock on each request.
7. Copy / template / CC import: Step Functions Standard → paced conditional puts → step 2.

## Cost model

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Struct/catalogue fold (both regions) | 100 k authoring facts × 3 WRU × 2 = 0.6 M WRU ≈ $0.4 + SQS/Lambda ≈ **$0.5** | $50 | $0.625/M WRU; fact writes themselves are in FLS's total |
| Derived storage | 50 courses × 10 MB × 2 regions = 1 GB × $0.25 ≈ **$0.3** | $30 | |
| Publish prepare | 400 prepares × 3 s × 2 GB = 2,400 GB-s ≈ $0.04 + 20 k PUT ≈ $0.1 ≈ **$0.2** | $20 | |
| Blob storage (both regions) | 100 GB × 2 × $0.023 ≈ **$4.6** | $460 | 2 GB/course, no video |
| Blob PUT + CRR transfer | 50 k PUT × $0.005/k + 10 GB × $0.02 ≈ **$0.5** | $50 | |
| CloudFront delivery | 500 GB, within 1 TB free tier ≈ **$0** | (50 TB − 1 TB) × $0.085 ≈ **$4,200** | request charges not in §6.1; excluded |
| Authoring API | 150 k reads × (≈ 20 RRU + $1/M + 50 ms × 1 GB) ≈ **$0.7** | $70 | IDX read ≈ 19 eventually consistent RRU |
| Delivery view reads | 300 k sessions × ($1/M + 0.5 RRU + 5 ms) ≈ **$0.4** | $40 | |
| Key release | 400 k calls ≈ $0.4 + KMS 5 k decrypts ≈ **$0.5** | $50 | release keys cached per (item, cohort) |
| Copy / import workflows | 20 × 50 transitions × $25/M + Lambda ≈ **$0.1** | $10 | |
| Logs (10% sampled) | ≈ **$0.2** | $20 | |
| **Total** | **≈ $8 / month** | ≈ $5,000 / month | egress dominates at scale; video would multiply it 10–100× |

## Standards conformance

| Standard | Role | Target | In scope | Out of scope and why | Eventual-consistency conflict and resolution |
|---|---|---|---|---|---|
| QTI 3.0 | Authoring system | Core level import/export of `assessmentItem`, `assessmentTest`, stimuli, IMS CP packaging | Interactions and operators in `qti-profile.md`; template processing; test parts, sections, branch rules | PCI and `customOperator` (imported, classified `server_or_human`); adaptive items; item usage statistics (derived, not imported). Lossy on export: key visibility, marking classification and policy are Trellis metadata, exported as vendor extensions and ignored by other systems | Concurrent imports of one item id yield two `item.v1`; LWW by `(sync_hlc, fact_id)`, both versions kept |
| Common Cartridge 1.1–1.3, Thin CC | Producer/consumer via DIO | See DIO-11 / DIO-12 | Mapping of CC resources to node kinds and blobs; `imsbasiclti` links to `lti.link.v1` | Authorization/protected content; server-side web content | Import is paced facts (CAC-21); a partial import is visible as a partial snapshot, never rolled back — the editor voids or completes |
| CASE 1.0 | Consumer of frameworks (CRD-02) | Alignment edges only | `align.v1` on nodes and items, carried in bundles | Framework authoring | Alignment stored by identifier before the framework folds; rendered later |
| LTI 1.3 Deep Linking 2.0 | Platform (LTI-13) | Content-item placement | `lti` nodes, `lti.link.v1` references, placement metadata in bundles | Tool-side content; offline launch | Deep-link response and structure ops in different regions union without coordination |

## Known Tensions

1. **Publish LWW conflict.** Two editors publishing within replication lag produce two facts; one becomes current by `(sync_hlc, fact_id)` and the other editor's publish is superseded seconds after they saw "published". Options: accept and notify (the draft already holds both editors' ops, so a republish at the union vector loses nothing); auto-republish at the union vector from the region that folds the conflict (adds an unattended publish that no editor reviewed); a publish lock (rejected: cross-region coordination). Recommendation: the first, with the one-click republish in CAC-12; conflicts are logged and visible in history.
2. **Answer-key exposure.** Client-side marking delivers keys to devices under `immediate` and `after_submit`; `time_locked` leaks the moment any device is granted the release key, including to a learner with an extension; only `server_only` withholds the key entirely and forfeits offline feedback. Trellis is formative and accepts this (ADR-006); the consolidated analysis and the recommended defaults per activity type are in `openspec/known-tensions.md` §4.
3. **Time-lock release depends on connectivity after reveal.** A device offline across `reveal_hlc` cannot mark until it reconnects; the learner sees "marked after <reveal>" for longer than the reveal implied, and two regions with skewed clocks may disagree on releasability for a few seconds. Options: accept and state it in the UI; pre-deliver the key with a client-honoured timer (degrades to `after_submit`); shorten `reveal_after`. Recommendation: accept; never pre-deliver.
4. **Media egress cost.** CloudFront egress is free to 1 TB then $0.085/GB; blob storage is replicated twice and CRR is charged per GB. Video in the blob store would dominate the platform's cost at scale. Options: hard caps and external video by URL/LTI; a cheaper tier (single-region, no CRR) for media; per-tenant egress budgets (ADM-15). Recommendation: caps plus external video by default, with the projected cost shown at upload (CAC-20).
5. **LWW per property loses a concurrent edit.** Two editors writing one page body concurrently keep only one value as current; the other survives in history and can be restored, but a merge would have been better. A CRDT sequence type (RGA or Peritext over the body) is deferred: bodies are opaque blobs over 4 KB, per-character operations would multiply authoring fact volume by ~100, and the engine would need a text CRDT on both targets; `project.md` §1.4 defers collaborative documents. Recommendation: LWW at the finest natural granularity (block-level props, `itemref` and `chapter` nodes with order keys), a presence hint, and visible history; revisit when the wiki change lands.
