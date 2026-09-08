## Purpose

Roster and enrolment bring school management data into the site using the OneRoster model while keeping personal data out of the CRDT layer: the logs carry opaque learner references, and names travel only as replaceable signed snapshots.

## ADDED Requirements

### Requirement: OneRoster-modelled import
The box SHALL import enrolment data in OneRoster CSV form (organisations, academic sessions, courses, classes, users, enrolments) and through a configurable column mapping for other management-system exports. Imports SHALL create or update a local directory on the box and SHALL be repeatable: a re-import SHALL reconcile against the existing directory using the source identifiers rather than duplicating records.

#### Scenario: Termly re-import
- **WHEN** an administrator imports the new term's export containing three new pupils and two leavers
- **THEN** the directory gains three learners, marks two as left, and proposes the corresponding enrolment operations for the affected classes

### Requirement: Opaque learner references
Each learner in the directory SHALL be assigned a random learner reference on first import, stable across re-imports by source identifier. Logs, documents, leases, and statements SHALL identify learners only by this reference. The mapping from learner reference to person SHALL exist only in the box's directory and in roster snapshots.

#### Scenario: Log inspection reveals no identity
- **WHEN** a class log is read from any device's storage
- **THEN** it contains learner references and no names, dates of birth, contact details, or management-system usernames

### Requirement: Roster snapshots distributed outside the CRDT
The box SHALL distribute identity data as roster snapshots: signed by the site key, encrypted to the receiving device key, versioned, and replaced wholesale rather than merged. Snapshots SHALL be stored outside the document repository and SHALL be deleted when the device is revoked. Scope SHALL be: teachers and administrators receive names, year group, source identifier, and learner reference for their classes; shared devices receive display names for their classes only; a learner's personal device receives that learner's own name only.

#### Scenario: Teacher sees names offline
- **WHEN** a teacher opens a class view on a train with no connectivity
- **THEN** learner references resolve to names from the latest snapshot the device received

#### Scenario: Snapshot revision removes a leaver
- **WHEN** a learner leaves the school and the next snapshot omits them
- **THEN** devices replace their snapshot, the leaver's name is no longer resolvable on them, and their learner reference remains in historical logs unresolved

### Requirement: Enrolment operations
Enrolment SHALL be recorded as class-log operations adding or removing a learner reference, signed by a teacher or administrator device. Import-proposed changes SHALL become operations only when an administrator confirms them or when the site is configured to apply imports automatically. Class membership derived from the fold SHALL drive share policy and cohort licence counting.

#### Scenario: Manual enrolment between imports
- **WHEN** a teacher adds a newly arrived pupil to a class before the next import
- **THEN** an enrolment operation is appended, the pupil's device becomes entitled to class documents, and the next import reconciles rather than duplicates

### Requirement: Directory protection
The box's directory SHALL be stored encrypted at rest, SHALL be accessible only to administrator devices through the box interface, and SHALL never be replicated as an Automerge document or sent to any project-run service.

#### Scenario: Directory not in the repository
- **WHEN** the document repository on the box is enumerated
- **THEN** no document contains directory records
