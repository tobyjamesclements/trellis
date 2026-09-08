## Purpose

Data protection makes a school's obligations as data controller achievable on an append-only CRDT: learner records are encrypted under keys the school can destroy, learner documents can be dropped, identities are referenced rather than embedded, and no learner data reaches the platform vendor.

## ADDED Requirements

### Requirement: Learner data is partitioned into droppable documents
All data about an individual learner (submissions, marks, comments on their work, learning records, SCORM and cmi5 session data, and learner-owned site-tier documents) SHALL live in that learner's logs and documents. Class and site logs SHALL contain only learner references and operations about class structure.

#### Scenario: Deleting one learner touches no shared document
- **WHEN** a learner is retired
- **THEN** every document dropped belongs to that learner alone and no class or open document is altered

### Requirement: Learner records are encrypted under per-learner keys
The box SHALL generate a random record key for each learner reference. Learner-log payloads and learner-owned bundles SHALL be encrypted under it as specified by the class-state log. Record keys SHALL NOT be derivable from the site key, SHALL be held by the box, and SHALL be wrapped to the device keys of the learner's own devices, the teachers of the learner's classes, and administrators, using the same wrapping mechanism as leases. Learner-owned content documents, which need plaintext for structural merge, SHALL remain droppable plaintext documents.

#### Scenario: Backup without keys is unreadable
- **WHEN** a backup of the box's learner logs is copied off the box without the key store
- **THEN** every record payload in it is ciphertext and no learner data can be read from it

#### Scenario: New teacher gains access
- **WHEN** a teacher is assigned to a class
- **THEN** the box wraps each enrolled learner's record key to the teacher's device key and the teacher can read the learner logs after the next sync

### Requirement: Retirement destroys the key and drops the replicas
An administrator SHALL be able to retire a learner reference. Retirement SHALL be a site-log operation after which the box stops replicating the learner's documents, destroys the learner's record key after a configurable hold period defaulting to 30 days, deletes the learner's documents and ciphertext, and instructs every device that held them to destroy its copy of the key and drop its replicas. Devices SHALL acknowledge with signed operations, and the administrator SHALL be able to see which devices have not yet acknowledged. The system SHALL document that every copy holding ciphertext only, including sealed epochs, backups, and successor boxes, becomes unreadable at key destruction, while a device that already held the key and never reconnects cannot be forced to comply.

#### Scenario: Retirement with one device offline
- **WHEN** a learner is retired and one teacher device is on leave for a month
- **THEN** the key is destroyed on the box and every other device after the hold, the administrator sees the one device as unacknowledged, and it destroys its key and replicas when it reconnects

#### Scenario: Sealed epochs die with the key
- **WHEN** a retired learner's log has three sealed epochs retained for audit
- **THEN** their records remain structurally verifiable and their payloads are unrecoverable once the key is destroyed

### Requirement: Deletion within documents is not deletion
The platform SHALL state that removing content inside an Automerge document leaves it in history, SHALL provide key destruction, document-level drop, and history squash as the only true deletion mechanisms, and SHALL NOT offer an in-document "permanently delete" action that implies otherwise.

#### Scenario: Teacher asks to erase a comment
- **WHEN** a teacher deletes a comment containing something inappropriate
- **THEN** the comment is tombstoned in the fold, and the interface explains that removing it from history requires the learner log's key destruction or squash at the next retention boundary, or dropping the document

### Requirement: Retention defaults
Learner logs and learner-owned documents SHALL be retained by default until one year after the end of the academic year in which they were created. At the boundary the box SHALL destroy the learner's record key for that class, delete the ciphertext at leisure, and squash or drop learner-owned content documents according to the site's configured policy. Sealed log epochs SHALL follow the same policy. Open-tier documents SHALL have no retention limit.

#### Scenario: End-of-year processing
- **WHEN** the retention boundary passes for last year's classes
- **THEN** the box destroys the record keys for those learner logs, applies the configured policy to learner documents, and records what it did in the site log

### Requirement: Subject access export
The box SHALL export everything held for one learner reference (documents, decrypted records, statements, leases, and drop history) as a portable bundle while the record key exists, so the school can answer a subject access request; resolving the reference to a person SHALL be done by the school from its directory.

#### Scenario: Parent requests their child's data
- **WHEN** an administrator exports a learner reference's data
- **THEN** the bundle contains all of that learner's documents and decrypted records and the administrator resolves the reference to the child using the directory

### Requirement: No learner data to project-run services
The registry, the public origin, the commons registry, and any telemetry SHALL never receive learner references, roster data, learner documents, logs, statements, or record keys. Telemetry SHALL be off by default. The commons registry SHALL receive only open-tier releases with attribution handles.

#### Scenario: Commons release inspected
- **WHEN** a release sent from a box to the commons registry is inspected
- **THEN** it contains an open document with provenance handles and no learner reference, log, roster field, or key

### Requirement: Protection at rest
The box SHALL store its directory, key store, logs, documents, and pack copies on an encrypted data partition. The platform SHALL document that device-side storage relies on the operating system's protection, that record keys on devices are held in the platform's key store, and that decrypted licensed content is never written to durable storage.

#### Scenario: Stolen storage card
- **WHEN** the box's storage medium is removed and read on another computer
- **THEN** the data partition is unreadable without the box's key material
