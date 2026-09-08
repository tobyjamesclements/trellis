## Purpose

Data protection makes a school's obligations as data controller achievable on an append-only CRDT: learner data lives in documents that can be dropped, identities are referenced rather than embedded, and no learner data reaches the platform vendor.

## ADDED Requirements

### Requirement: Learner data is partitioned into droppable documents
All data about an individual learner (submissions, marks, comments on their work, learning records, SCORM commits, and learner-owned site-tier documents) SHALL live in that learner's logs and documents. Class and site logs SHALL contain only learner references and operations about class structure.

#### Scenario: Deleting one learner touches no shared document
- **WHEN** a learner is retired
- **THEN** every document dropped belongs to that learner alone and no class or open document is altered

### Requirement: Retirement and drop
An administrator SHALL be able to retire a learner reference. Retirement SHALL be a site-log operation after which the box stops replicating the learner's documents, deletes them after a configurable hold period defaulting to 30 days, and instructs every device that held them to drop its replicas. Devices SHALL acknowledge drops with signed operations, and the administrator SHALL be able to see which devices have not yet acknowledged. The system SHALL document that a device that never reconnects cannot be made to drop its replica and that this residual is bounded by lease grace only for licensed content, not for learner data.

#### Scenario: Retirement with one device offline
- **WHEN** a learner is retired and one teacher device is on leave for a month
- **THEN** the box and every other device drop the documents, the administrator sees the one device as unacknowledged, and the drop completes when it reconnects

### Requirement: Deletion within documents is not deletion
The platform SHALL state that removing content inside an Automerge document leaves it in history, SHALL provide document-level drop and history squash as the only true deletion mechanisms, and SHALL NOT offer an in-document "permanently delete" action that implies otherwise.

#### Scenario: Teacher asks to erase a comment
- **WHEN** a teacher deletes a comment containing something inappropriate
- **THEN** the comment is tombstoned in the fold, and the interface explains that removing it from history requires squashing the learner log at the next retention boundary or dropping the document

### Requirement: Retention defaults
Learner logs and learner-owned documents SHALL be retained by default until one year after the end of the academic year in which they were created, then squashed or dropped according to the site's configured policy. Sealed log epochs SHALL follow the same policy. Open-tier documents SHALL have no retention limit.

#### Scenario: End-of-year processing
- **WHEN** the retention boundary passes for last year's classes
- **THEN** the box applies the configured policy to those learner logs and documents and records what it did in the site log

### Requirement: Subject access export
The box SHALL export everything held for one learner reference (documents, logs, statements, leases, and drop history) as a portable bundle, so the school can answer a subject access request; resolving the reference to a person SHALL be done by the school from its directory.

#### Scenario: Parent requests their child's data
- **WHEN** an administrator exports a learner reference's data
- **THEN** the bundle contains all of that learner's documents and records and the administrator resolves the reference to the child using the directory

### Requirement: No learner data to project-run services
The registry, the commons relay, and any telemetry SHALL never receive learner references, roster data, learner documents, logs, or statements. Telemetry SHALL be off by default. The commons relay SHALL receive only open-tier documents with attribution handles.

#### Scenario: Commons upload inspected
- **WHEN** the data sent from a box to the commons relay is inspected
- **THEN** it contains open documents with provenance handles and no learner reference, log, or roster field

### Requirement: Protection at rest
The box SHALL store its directory, logs, documents, and pack copies on an encrypted data partition. The platform SHALL document that device-side storage relies on the operating system's protection and that decrypted licensed content is never written to it.

#### Scenario: Stolen storage card
- **WHEN** the box's storage medium is removed and read on another computer
- **THEN** the data partition is unreadable without the box's key material
