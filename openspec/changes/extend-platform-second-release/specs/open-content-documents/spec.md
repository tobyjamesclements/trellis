## ADDED Requirements

### Requirement: Provenance record of forks, merges, and publications
Every content document SHALL carry, in addition to its origin and authors, an ordered list of fork, merge, and publication events, each recording the source document identifier, the source heads, the acting author identifier, and the acting site identifier, and its content licence as an SPDX identifier when the document is open tier.

#### Scenario: Provenance after two forks
- **WHEN** school B forks a document that school A had previously forked from school C
- **THEN** school B's document lists both fork events and all three sites, and its origin still names school C's original document

### Requirement: Provenance events are signed
Every origin, fork, merge, and publication event SHALL be signed by the device key of the actor that performed it. A peer SHALL treat an unsigned or wrongly signed event as absent.

#### Scenario: Fork event carries a verifiable signature
- **WHEN** a teacher forks a document
- **THEN** the appended fork event verifies against the teacher's device key without inspecting the change history

### Requirement: Forks are separate documents that preserve history and lineage
A fork SHALL be a new document with a new identifier containing the complete change history of the source at the fork point, SHALL append a fork event, and SHALL retain every prior event and author from the source.

#### Scenario: Draft branch does not leak
- **WHEN** a teacher forks a live class document to prepare next term's version and edits the fork
- **THEN** students of the live document see none of those edits until the teacher performs an explicit merge

### Requirement: Merge is an intentional operation between documents sharing history
The system SHALL merge one document into another only on an explicit action by a user with edit rights on the target, only when both share history through a fork relationship, and only when both are the same tier. A merge SHALL append a merge event and union the author lists.

#### Scenario: Merge refused across tiers
- **WHEN** a user attempts to merge a site-tier fork into an open-tier document
- **THEN** the merge is refused with the reason

#### Scenario: Merge refused between unrelated documents
- **WHEN** a user attempts to merge two documents that do not share fork history
- **THEN** the system refuses and offers to insert a reference instead

### Requirement: Diff across forks
The system SHALL produce a structural diff between a fork and its source at any pair of heads they share history for, attributed to authors.

#### Scenario: Compare a fork with its source
- **WHEN** a teacher compares their fork with the document it was forked from
- **THEN** the changes on each side since the fork point are shown with their authors

### Requirement: Lineage is tamper-evident
A peer receiving a document SHALL verify that the provenance record is consistent with the change history and with the event signatures. A document that fails SHALL be marked lineage unverified, SHALL NOT be published as a release, and SHALL be reported to the administrator.

#### Scenario: Removed attribution is detected
- **WHEN** a document arrives whose provenance omits an author that the history shows was present at the recorded fork heads
- **THEN** the receiving peer marks it lineage unverified and the box refuses to publish it

### Requirement: Licence inheritance on fork
A fork SHALL inherit the licence of its source, and the licence of a fork MAY be changed only to a licence the source licence permits; share-alike SHALL NOT be dropped.

#### Scenario: Share-alike cannot be dropped
- **WHEN** a teacher forks a CC BY-SA 4.0 document and attempts to relicense it CC BY 4.0
- **THEN** the system refuses and explains the share-alike obligation

### Requirement: Attribution handles for public display
Each device SHALL carry an attribution handle chosen by its user for display in releases. The handle SHALL be changeable, SHALL NOT be derived from the directory, and SHALL be the only identity that leaves the site with open content.

#### Scenario: Teacher publishes under a chosen name
- **WHEN** a teacher sets an attribution handle and publishes a release
- **THEN** the release shows that handle and never the teacher's directory entry or device key
