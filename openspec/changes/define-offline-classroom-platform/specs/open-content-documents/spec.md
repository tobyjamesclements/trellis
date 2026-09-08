## Purpose

Content documents are the Automerge-native layer for teacher material and class collaborations: concurrent editing without a server, attachments by reference, origin and author metadata, in-document history, and drafts that stay private until added to a live class.

## ADDED Requirements

### Requirement: Content documents are Automerge-native
The system SHALL represent every open-tier and site-tier content document as a single Automerge document whose body uses native Automerge structures (text, lists, maps) so that concurrent edits merge structurally without a server. Media and other binary attachments SHALL be held outside the document as bundles of the same tier referenced by content address, never as inline bytes.

#### Scenario: Concurrent offline edits merge without conflict
- **WHEN** two admitted devices edit different paragraphs of the same document while disconnected and later both sync with the box
- **THEN** both edits are present in the merged document on every peer and no edit is discarded or overwritten

#### Scenario: Attachment inserted by reference
- **WHEN** an author inserts an image into a document
- **THEN** the image is stored as a bundle addressed by its content hash and the document holds only that reference

### Requirement: Origin, tier, language, and authors
Every content document SHALL carry its origin document identifier and the heads at which it was created, its immutable tier, its language, and the list of author identifiers who contributed, where an author identifier is a device key identifier or a learner reference and never a roster name.

#### Scenario: Author list stays pseudonymous
- **WHEN** a student contributes to a collaboration on a shared lab PC
- **THEN** the author list records the student's learner reference and no name

### Requirement: Class collaborations
A teacher SHALL be able to create a collaboration in a class: a site-tier document that every member of the class can edit concurrently, with each edit attributed. A teacher SHALL be able to lock a collaboration, after which it is read-only for members, and unlock it.

#### Scenario: Whole class writes a story
- **WHEN** thirty learners edit a collaboration during a lesson and two continue at home
- **THEN** every edit is present after the devices next meet the box, and the teacher can see who wrote what

#### Scenario: Locked at the end of the unit
- **WHEN** a teacher locks the collaboration
- **THEN** members can read it and cannot edit it until it is unlocked

### Requirement: Teacher documents and drafts
A teacher SHALL be able to author documents that remain private to their devices until added to a live class. Teacher documents SHALL be site tier by default and MAY be declared open tier with a licence.

#### Scenario: Worksheet drafted at home
- **WHEN** a teacher writes a worksheet on their laptop and adds it to the class the next day
- **THEN** no student saw it before it was added, and every member receives it at their next sync

### Requirement: History within a document
The system SHALL show the changes between any two points in a document's history, attributed to the authors who made them.

#### Scenario: What changed overnight
- **WHEN** a teacher compares a collaboration's state now with its state at the end of the lesson
- **THEN** the changes made since are shown with the learner reference of each author
