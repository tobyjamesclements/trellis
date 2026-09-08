## Purpose

The class-state log family holds everything that is a record rather than a document: enrolment, assignments, comments, submissions, formative marks, learning records, and licence events, as signed append-only operations whose meaning is defined by an explicit fold rather than inherited from last-writer-wins.

## ADDED Requirements

### Requirement: Three log instances
The system SHALL maintain the log family as three kinds of Automerge document: one **site log** per site (device admissions and roles, licence events, pack catalogue, box succession, schema settings), one **class log** per class (class lifecycle events, enrolment references, units, sequencing, assignments with their target sets, annotations, class comments, chat messages), and one **learner log** per learner per class (submissions, marks, comments on the learner's work, learning records, SCORM commits). No learner log content SHALL be placed in a class or site log.

#### Scenario: Submission lands in the learner log
- **WHEN** a student submits work for an assignment
- **THEN** the submission operation is appended to that learner's log for the class and nothing about it is written to the class log

### Requirement: Operation record format
Every operation SHALL be a record containing: a UUID operation identifier; an operation type; the schema version it was written under; the signing device key identifier; the acting learner reference when the signer is a shared device; a per-signer sequence number; a Lamport clock value; the hash of the signer's previous operation in the same log; the signer's wall-clock time as informational data; a canonically encoded payload; and a signature by the device key over every field except the signature. Records SHALL be stored under their operation identifier in a map, so the log is a keyed append-only set.

#### Scenario: Duplicate operation is idempotent
- **WHEN** the same operation arrives twice through different sync paths
- **THEN** the log holds exactly one record and the folded state is unchanged by the second arrival

#### Scenario: Concurrent appends never conflict
- **WHEN** two offline devices each append operations and later sync
- **THEN** both sets of records are present and no record is lost or overwritten regardless of arrival order

### Requirement: Learner-log payloads are encrypted under per-learner keys
In a learner log, the payload of every record SHALL be encrypted with authenticated encryption under that learner's record key, the record envelope (identifier, type, schema version, signer, actor, sequence number, Lamport clock, previous hash, and informational time) SHALL remain in clear, and the signature SHALL cover the envelope and the ciphertext. A peer without the key SHALL still be able to store, deduplicate, order, verify signatures on, and relay records, and SHALL fold them only as opaque entries. Class and site logs SHALL NOT be encrypted, because they carry references and structure only.

#### Scenario: Ciphertext-only replica still syncs
- **WHEN** a successor box that has not yet received a learner's record key holds that learner's log
- **THEN** it stores, orders, and relays the records to entitled devices and cannot read their contents until the key is re-wrapped to it

#### Scenario: Sealed epoch without its key
- **WHEN** a learner's record key has been destroyed and a sealed epoch of their log remains on the box
- **THEN** the epoch's records verify structurally and no payload can be recovered

### Requirement: State is a deterministic fold evaluated on read
The system SHALL derive state by folding over the log: verify each record's signature against the signer key known from the site log; discard records whose signer lacked authority for that operation type at the record's logical time; order the remaining records by Lamport clock, then signer key, then sequence number; and apply the per-type reducer. The fold SHALL be deterministic: the same set of records SHALL yield the same state on every peer independent of arrival order. Peers MAY cache the folded state but SHALL treat the log as the source of truth.

#### Scenario: Same records, same state
- **WHEN** the box and a student device hold the same set of records for a learner log
- **THEN** both derive identical folded state

### Requirement: Authorisation by role at logical time
The fold SHALL accept: device admissions, revocations, and role changes only from administrator devices, with teacher devices also permitted to admit student devices; licence operations only from the site key; enrolment from the site key or from teacher or administrator devices; units, sequencing, assignments, and annotations only from teacher or administrator devices; submissions only from the learner's own device or a shared device acting for that learner; marks only from teacher devices; comments and chat messages from any member of the class; chat moderation, chat pause, and class lifecycle operations only from teacher or administrator devices; learning records from the learner's own device or from a teacher; and box succession only from administrator devices. Records signed by a key that is revoked at their logical time SHALL be discarded and logged.

#### Scenario: Student cannot mark their own work
- **WHEN** a student device appends a mark operation to its own learner log
- **THEN** every peer's fold discards it and records it as rejected

#### Scenario: Operation after revocation
- **WHEN** a revoked device appends an operation with a Lamport clock later than its revocation
- **THEN** the fold discards it, and the box lists the attempt for the administrator

### Requirement: Schema versioning and unknown operations
Every log SHALL carry a schema version, and every record SHALL carry the schema version it was written under. A fold SHALL skip, not throw on, any record whose type is unknown to it or whose major schema version exceeds the version it supports. Skipped records SHALL be counted and listed in the fold result so the client can show that it is behind, and a device SHALL warn its user when skips occur. Raising a log's minimum schema version SHALL be an administrator operation that the box refuses while any admitted device has reported an older supported version, unless the administrator overrides it.

#### Scenario: Old client meets a new operation type
- **WHEN** a device running an older platform version folds a class log containing a new operation type
- **THEN** the state excludes that operation, the device shows "1 update needs a newer version", and no error is raised

### Requirement: Append-only is tamper-evident
Peers SHALL never remove or modify records. The box SHALL check the change history of each log for removals or modifications of records and, on detection, SHALL restore the records from its own replica, flag the responsible device, and record a tamper event in the site log. The system SHALL document that this makes tampering evident and recoverable from the box's replica, not impossible.

#### Scenario: Removed record is restored
- **WHEN** a modified client deletes a mark from a learner log and syncs
- **THEN** the box detects the removal in the history, the record is present again after the next sync, and the device is flagged to the administrator

### Requirement: Concurrency semantics per operation family
The fold SHALL apply these rules. **Admission and roles**: a revocation concurrent with an admission of the same key wins; role changes resolve latest by logical order. **Enrolment**: add and remove resolve latest by logical order, and removal wins a tie. **Comments and annotations**: records are immutable; an edit is a new record superseding the original, a deletion is a tombstone record, concurrent edits are both retained with the latest shown and the other visible as history. **Submissions**: immutable, referencing the submitted document's heads rather than copying it; the current submission is the learner's highest sequence number; teachers cannot alter submissions. **Marks**: one current mark per submission per marker, latest by logical order, with earlier marks retained as history; marks from different markers are kept separately. **Units and sequencing**: a sequencing record sets the complete ordered list for a unit and resolves latest by logical order. **Learning records**: immutable and deduplicated by identifier, with voiding as a separate record. **Chat messages**: immutable and ordered by logical order; a moderation tombstone hides a message for every member, and a message concurrent with its own tombstone resolves to hidden. **Assignments**: a record names a target set of the whole class or listed learner references, and edits supersede by logical order. **Licence events**: totally ordered by the site key's sequence number.

#### Scenario: Two teachers mark the same submission
- **WHEN** two teachers mark the same submission while offline and later sync
- **THEN** both marks are shown, each attributed to its marker, and neither replaces the other

#### Scenario: Concurrent enrolment add and remove
- **WHEN** one teacher removes a learner from a class while another concurrently adds the same learner
- **THEN** after sync the learner is not enrolled, and both operations remain visible in the log

#### Scenario: Message hidden while a reply is in flight
- **WHEN** a teacher hides a message while a learner offline is replying to it
- **THEN** after sync the original is hidden for everyone, the reply remains visible, and both records are in the log

### Requirement: Epoch compaction
The box SHALL be able to seal an epoch of a log by appending a site-signed snapshot record containing the hash of the folded state and the last Lamport clock, creating a successor log document whose genesis references the sealed epoch, and directing peers to the successor. The sealed epoch SHALL be retained by the box for the retention period and SHALL remain verifiable.

#### Scenario: New device joins after a seal
- **WHEN** a device is admitted after a class log has been sealed twice
- **THEN** it receives the current epoch and its genesis snapshot, folds correctly from the snapshot, and can request earlier epochs from the box for history views
