## Purpose

Content interchange lets teachers bring QTI and Common Cartridge material in and take open material out, with an Automerge-native internal model and export that respects the tier of every part.

## ADDED Requirements

### Requirement: Import into the native model
The system SHALL import QTI items and tests and Common Cartridge packages into native Automerge content documents. The importer SHALL require the user to declare the tier (open or site) and, for open, the licence, SHALL record the source file hash and declared tier in provenance, and SHALL never produce licensed-tier artefacts: commercial content SHALL enter the site only as packs.

#### Scenario: Teacher imports their own item bank
- **WHEN** a teacher imports a QTI file they authored and declares it open under CC BY-SA 4.0
- **THEN** the items become open documents whose provenance records the import hash, the declared licence, and the teacher's attribution handle

#### Scenario: Import defaults to site tier when undeclared
- **WHEN** a user imports a cartridge without confirming the right to share it
- **THEN** the content is created as site tier and cannot later be promoted to open

### Requirement: Export of open content
The system SHALL export open-tier documents as QTI where items are representable, as Common Cartridge for units, and as a native bundle containing the Automerge document, its provenance, and its open attachments. Exports SHALL include attribution and licence, and native bundles SHALL import into another site with lineage intact.

#### Scenario: Round trip between schools by file
- **WHEN** school A exports a unit as a native bundle and school B imports it
- **THEN** school B's copy is a fork whose provenance names school A's document, heads, and authors

### Requirement: Licensed material is never exported
Export of site-tier documents SHALL be refused. A unit or cartridge that references licensed pack items SHALL export with placeholders carrying the pack family identifier, version, item path, and a licence notice in place of the content.

#### Scenario: Mixed unit exported
- **WHEN** a teacher exports a unit containing two open documents and three licensed pack items
- **THEN** the cartridge contains the two documents and three placeholders, and no pack content

#### Scenario: Annotated worksheet export refused
- **WHEN** a teacher tries to export a site-tier annotation document
- **THEN** the export is refused with the reason that site-tier content cannot leave the site

### Requirement: Lossy export is declared
Where the native model holds structure that QTI or Common Cartridge cannot represent, the export SHALL succeed with a report listing what was simplified or omitted.

#### Scenario: Unsupported interaction type
- **WHEN** an item uses an interaction the target format lacks
- **THEN** the export produces the nearest representation and the report names the item and the simplification
