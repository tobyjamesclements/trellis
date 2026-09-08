## Purpose

The tier boundary keeps paid content out of the open commons and keeps the open commons open: it defines the open, site, and licensed tiers, makes the tier of every artefact immutable, and states what a teacher may derive from a licensed pack.

## ADDED Requirements

### Requirement: Three tiers with fixed representations
The system SHALL classify every content artefact into exactly one tier at creation. The **open** tier SHALL contain forkable Automerge content documents and plaintext bundles intended for sharing. The **site** tier SHALL contain Automerge content documents and plaintext bundles bound to one site, used for teacher-created derivative works and for learner work. The **licensed** tier SHALL contain only encrypted, signed packs referenced by content address; licensed material SHALL never exist as an Automerge document.

#### Scenario: Licensed pack has no document form
- **WHEN** any component attempts to create an Automerge document whose tier is licensed
- **THEN** the operation is rejected and the only representation offered for licensed material is a pack reference by content address

### Requirement: Tier is immutable and carried by the artefact
The tier of a document or bundle SHALL be recorded in the artefact itself at creation, SHALL be included in what the artefact's creator signs or the first change commits, and SHALL NOT be changeable afterwards. The system SHALL provide no operation that promotes site-tier content to the open tier; the only route to open-tier content is fresh authoring in an open-tier document.

#### Scenario: Tier change attempt
- **WHEN** a user or peer attempts to change the tier field of an existing document from site to open
- **THEN** the change is refused by the editor and, if it arrives via sync, the receiving peer treats the document as site tier and flags it

### Requirement: Licensed material cannot be merged into an open document
The system SHALL refuse any merge whose source and target differ in tier, and SHALL provide no import, paste-from-pack, or copy operation that places decrypted licensed content into an open-tier document. The pack viewer SHALL offer "insert reference" into site-tier and class-log contexts only.

#### Scenario: Site-tier annotation cannot be merged into an open document
- **WHEN** a teacher attempts to merge a site-tier annotated worksheet into an open-tier document
- **THEN** the merge is refused with an explanation that site-tier content cannot enter the open tier

#### Scenario: Pack viewer offers no path into open documents
- **WHEN** a teacher viewing a licensed pack item selects "use this in my document" while an open-tier document is the target
- **THEN** the only offered targets are site-tier documents and class assignments, and the open document is not selectable

### Requirement: Open documents must not reference licensed content
An open-tier document SHALL NOT contain a reference to a licensed pack address or pack item. The editor SHALL refuse to insert such a reference. A peer that receives an open-tier document containing a licensed reference SHALL quarantine it: it SHALL NOT relay the document further, SHALL mark it for administrator review, and the box SHALL refuse to publish it as a release.

#### Scenario: Open document with licensed reference is quarantined
- **WHEN** the box receives an open-tier document that references a licensed pack item
- **THEN** the box stops relaying that document to other peers, refuses to publish it as a release, and lists it in the administrator's review queue

### Requirement: Permitted derivative works from licensed packs
The system SHALL permit a teacher at a licensed site to create the following from a licensed pack, regardless of publisher settings: annotations attached to pack anchors, sequencing of pack items into units and lessons, assignment of pack items to classes and learners, formative marks and comments about learner work on pack items, and private teaching notes. Annotations and notes that embed licensed excerpts SHALL be site tier. Sequencing and assignment SHALL be recorded as class-log operations that reference pack items by pack address and item path without copying content.

#### Scenario: Teacher sequences pack items into a unit
- **WHEN** a teacher builds a unit that orders three items from a licensed pack and two open documents
- **THEN** the unit is stored as class-log operations holding references only, and the open documents remain open tier

#### Scenario: Annotation with excerpt stays at the site
- **WHEN** a teacher writes an annotation that quotes a paragraph from a licensed pack
- **THEN** the annotation is stored in a site-tier document that syncs only within the site and is never exportable

### Requirement: What stays with the publisher
Licensed pack content, its structure and item banks, its media, and any decrypted rendering of it SHALL remain the publisher's: the system SHALL NOT export, relay outside the site, fork, or persist decrypted copies of it. Printing or PDF export of rendered pack pages SHALL be permitted only when the licence token grants it, and every such output SHALL carry the site watermark.

#### Scenario: Print disallowed by licence
- **WHEN** a teacher attempts to print a page of a pack whose licence does not grant printing
- **THEN** the system refuses and shows the licence restriction

### Requirement: Derivative works survive licence expiry as references
When a licence expires or is revoked, the system SHALL retain the teacher's sequencing, assignments, annotations, marks, and notes, SHALL continue to show pack item titles as references, and SHALL stop rendering the licensed content itself.

#### Scenario: Unit outlives the licence
- **WHEN** a licence for a pack used in a unit expires
- **THEN** the unit still lists the pack items by title with a "licence required" state, the open documents in the unit still render, and the teacher's annotations remain readable except for embedded licensed excerpts

### Requirement: The boundary is enforced structurally, not against copying
The system SHALL enforce the tier boundary through representation, refused operations, and relay policy. The system SHALL NOT claim to prevent a person from manually retyping or copying licensed content into an open document; that residual risk SHALL be addressed by watermark traceability, quarantine on detection, and licence terms.

#### Scenario: Manually copied content is traceable, not prevented
- **WHEN** a person retypes licensed material into an open document and shares it
- **THEN** the system has not blocked the act, but any rendered licensed source they worked from carried the site watermark and the commons registry accepts takedown reports against any release containing it
