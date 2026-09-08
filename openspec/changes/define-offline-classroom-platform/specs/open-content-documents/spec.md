## Purpose

Open-tier content documents are the "git for the classroom" layer: Automerge-native documents that teachers author, fork, diff, merge, and share between schools, carrying attribution and lineage that survive every fork.

## ADDED Requirements

### Requirement: Open content documents are Automerge-native
The system SHALL represent every open-tier content document as a single Automerge document whose body uses native Automerge structures (text, lists, maps) so that concurrent edits merge structurally without a server. Media and other binary attachments SHALL be held outside the document as open-tier bundles referenced by content address, never as inline bytes.

#### Scenario: Concurrent offline edits merge without conflict
- **WHEN** two admitted devices edit different paragraphs of the same open document while disconnected and later both sync with the box
- **THEN** both edits are present in the merged document on every peer and no edit is discarded or overwritten

#### Scenario: Attachment inserted by reference
- **WHEN** an author inserts an image into an open document
- **THEN** the image is stored as an open-tier bundle addressed by its content hash and the document holds only that reference

### Requirement: Every open document carries provenance metadata
Every open-tier content document SHALL carry a provenance record containing: the origin document identifier and the heads at which it was created; an ordered list of fork, merge, and publication events, each recording the source document identifier, the source heads, the acting author identifier, and the acting site identifier; the list of author identifiers who contributed; and the content licence as an SPDX identifier. Author identifiers in provenance SHALL be attribution handles chosen by authors for public display, never roster identity data.

#### Scenario: New document records its origin
- **WHEN** a teacher creates a new open document
- **THEN** the provenance record names that document as its own origin, lists the teacher's attribution handle as an author, and carries the site's default open licence

#### Scenario: Provenance never names a learner
- **WHEN** a student contributes to an open document on an admitted device
- **THEN** the author list records the student's attribution handle or device-derived identifier and contains no roster name, date of birth, or contact detail

### Requirement: Forks are separate documents that preserve history and lineage
The system SHALL implement a fork as a new document with a new document identifier that contains the complete change history of the source document at the fork point. The fork SHALL append a fork event to the provenance record and SHALL retain every prior fork event, author, and origin entry from the source. Because Automerge has no publish step, a fork is the only mechanism by which draft work is separated from a live document.

#### Scenario: Fork carries lineage two levels deep
- **WHEN** school B forks a document that school A had previously forked from school C
- **THEN** school B's document lists both prior fork events and all three schools' authors, and its origin still names school C's original document

#### Scenario: Draft branch does not leak into the live document
- **WHEN** a teacher forks a live class document to prepare next week's material and edits the fork
- **THEN** students subscribed to the live document see none of those edits until the teacher performs an explicit merge

### Requirement: Merge is an intentional operation between documents sharing history
The system SHALL merge one open document into another only on an explicit action by a user with edit rights on the target, only when both documents share history through a fork relationship, and only when both documents are open tier. A merge SHALL append a merge event to the target's provenance record and SHALL union the author lists.

#### Scenario: Teacher merges a reviewed branch
- **WHEN** a teacher with edit rights merges their draft fork into the live class document
- **THEN** the draft's changes appear in the live document, the provenance record gains a merge event naming the draft, and the author list contains every author from both documents

#### Scenario: Merge refused between unrelated documents
- **WHEN** a user attempts to merge two open documents that do not share fork history
- **THEN** the system refuses the merge and offers to insert a reference or copy content as a new authored contribution instead

### Requirement: Documents are diffable across history and forks
The system SHALL produce a structural diff between any two points in one document's history and between a fork and its source at any pair of heads they share history for.

#### Scenario: Diff a fork against its source
- **WHEN** a teacher compares their fork with the source document it was forked from
- **THEN** the system shows the changes made on each side since the fork point, attributed to the authors who made them

### Requirement: Provenance events are signed
Every origin, fork, merge, and publication event in a provenance record SHALL be signed by the device key of the actor that performed it and SHALL name the actor's site identifier. A peer SHALL treat an unsigned or wrongly signed event as absent.

#### Scenario: Fork event carries a verifiable signature
- **WHEN** a teacher forks a document
- **THEN** the appended fork event verifies against the teacher's device key and any peer can check it without inspecting the change history

### Requirement: Lineage is tamper-evident
A peer receiving an open document SHALL verify that the provenance record is consistent with the document's own change history and with the event signatures: the origin and each fork event SHALL correspond to heads that exist in the history, each event SHALL carry a valid signature, and provenance entries present at the recorded fork heads SHALL still be present. A document that fails this check SHALL be marked "lineage unverified" on that peer, SHALL NOT be published to the commons registry, and SHALL be reported to the site administrator.

#### Scenario: Removed attribution is detected
- **WHEN** a document arrives whose current provenance omits an author that the history shows was present at the recorded fork heads
- **THEN** the receiving peer marks it lineage unverified and the box refuses to publish it to the commons registry

### Requirement: Licence inheritance on fork
A fork SHALL inherit the licence of its source. The system SHALL allow the licence of a fork to be changed only to a licence the source licence permits, and SHALL refuse changes that remove a share-alike obligation.

#### Scenario: Share-alike cannot be dropped
- **WHEN** a teacher forks a document licensed CC BY-SA 4.0 and attempts to relicense the fork as CC BY 4.0
- **THEN** the system refuses and explains that the source licence requires share-alike
