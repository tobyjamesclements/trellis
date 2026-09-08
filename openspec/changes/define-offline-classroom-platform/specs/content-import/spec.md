## Purpose

Content import lets a teacher add the files they already have, PDF, EPUB, SCORM, cmi5, and QTI, to a class so they render and run offline, without converting them into anything the teacher did not ask for.

## ADDED Requirements

### Requirement: Supported formats
The system SHALL import PDF files for viewing, EPUB files for reading, SCORM 1.2, SCORM 2004, and cmi5 packages for launching in the local runtime, and QTI 2.x and 3.0 files as native items. A file of any other type SHALL be refused with guidance naming a supported alternative, such as saving a document as PDF.

#### Scenario: Teacher adds a PDF worksheet
- **WHEN** a teacher imports a PDF into a class
- **THEN** members can open it in the viewer on their devices with no connectivity

#### Scenario: Presentation refused with guidance
- **WHEN** a teacher tries to import a presentation file
- **THEN** the import is refused with the suggestion to export it as PDF first

### Requirement: Imported content is site tier by default
Imported files SHALL be stored as bundles, site tier by default, with the source file hash and declared tier recorded. A teacher MAY declare an import open tier by confirming the right to share it and choosing a licence. Import SHALL never produce licensed-tier artefacts; commercial content SHALL enter the site only as packs.

#### Scenario: Scanned pages stay at the site
- **WHEN** a teacher imports a PDF without declaring it shareable
- **THEN** it is site tier, syncs only within the site, and cannot later be promoted to open

### Requirement: Import is local and deduplicated
Import SHALL work from a file chosen on the teacher's device or from removable media at the box, with no connectivity. Files SHALL be stored once by content address, SHALL be subject to the size budgets, and SHALL reach class members through the share policy at their next contact.

#### Scenario: Same textbook scan in two classes
- **WHEN** two teachers import the same PDF into two classes
- **THEN** the box stores it once and both classes reference it

### Requirement: Offline rendering and reading progress
The viewer, the reader, and the runtime SHALL work from the device's local replica. The device SHALL remember each learner's position in a PDF or EPUB, and SHALL record a learning record when a learner reaches the end of an imported document and MAY record progress at intervals.

#### Scenario: Chapter finished at home
- **WHEN** a learner reads to the end of an EPUB chapter assigned as homework
- **THEN** the device records a completion learning record that appears in the teacher's overview after the next sync

### Requirement: Imported packages run like packs without leases
Imported SCORM and cmi5 packages SHALL launch through the same runtime as licensed packs, SHALL need no lease, SHALL never expire on a device, and SHALL record their results in the learner log in the same way.

#### Scenario: Open courseware package
- **WHEN** a teacher imports an openly licensed SCORM package and a learner runs it at home
- **THEN** it launches offline, its commits reach the learner log, and it never recalls itself

### Requirement: QTI import into native items
QTI import SHALL map each supported interaction to a native item, SHALL keep test and section structure as a quiz, SHALL report any interaction it cannot represent, and SHALL leave the imported items editable by the teacher.

#### Scenario: Question bank imported
- **WHEN** a teacher imports a QTI package with forty choice items and two unsupported interactions
- **THEN** forty items and the test structure are created, the two are reported by name, and the teacher can edit any item
