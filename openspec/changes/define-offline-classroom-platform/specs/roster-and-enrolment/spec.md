## Purpose

Roster and enrolment build the school's learner directory from class joins and keep personal data out of the CRDT layer: the logs carry opaque learner references, and display names travel only as replaceable signed snapshots.

## ADDED Requirements

### Requirement: Directory built from joins
The box SHALL maintain a learner directory populated by class joins and by names a teacher pre-creates. Each entry SHALL hold a display name, a PIN verifier, the learner reference, and the classes the learner belongs to, and nothing the platform did not need to ask for. The directory SHALL be editable by teachers for their classes and by administrators for the site.

#### Scenario: Directory after the first week
- **WHEN** four teachers have each started a class and their students have joined
- **THEN** the directory holds one entry per student, with a student who joined two classes appearing once

### Requirement: Opaque learner references
Each learner SHALL be assigned a random learner reference when their directory entry is created. Logs, documents, leases, and statements SHALL identify learners only by this reference. The mapping from learner reference to display name SHALL exist only in the box's directory and in roster snapshots.

#### Scenario: Log inspection reveals no identity
- **WHEN** a class log is read from any device's storage
- **THEN** it contains learner references and no names, PINs, or contact details

### Requirement: Roster snapshots distributed outside the CRDT
The box SHALL distribute display names as roster snapshots: signed by the site key, encrypted to the receiving device key, versioned, and replaced wholesale rather than merged. Snapshots SHALL be stored outside the document repository and SHALL be deleted when the device is revoked. Scope SHALL be: teachers and administrators receive display names and learner references for their classes; shared and loaned devices receive the display names of the classes they serve, for session selection; and a snapshot SHALL omit a learner as soon as they are removed or retired.

#### Scenario: Teacher sees names offline
- **WHEN** a teacher opens a class overview with no connectivity
- **THEN** learner references resolve to names from the latest snapshot the device received

#### Scenario: Removed learner disappears from the lab PC
- **WHEN** a learner is removed from a class and the lab PC next syncs
- **THEN** the PC's session picker no longer offers that name, and their learner reference remains in historical logs unresolved

### Requirement: Enrolment operations
Enrolment SHALL be recorded as class-log operations adding or removing a learner reference. A join SHALL produce an enrolment operation signed by the site key; teacher additions and removals SHALL be signed by the teacher device. Class membership derived from the fold SHALL drive share policy and lease content.

#### Scenario: Teacher removes a learner
- **WHEN** a teacher removes a learner from a class
- **THEN** a removal operation is appended, the learner's devices stop receiving that class's documents at the next sync, and the learner's leases lose that class's packs

### Requirement: Directory protection
The box's directory SHALL be stored encrypted at rest, SHALL be accessible only to administrator and teacher devices through the box interface within their scope, and SHALL never be replicated as an Automerge document or sent to any project-run service.

#### Scenario: Directory not in the repository
- **WHEN** the document repository on the box is enumerated
- **THEN** no document contains directory records
