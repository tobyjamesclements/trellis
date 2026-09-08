## Purpose

Storage lifecycle keeps a box with thousands of documents and a device with limited browser storage responsive: memory eviction by document identifier, compaction per document family, size budgets, and persistent storage on devices.

## ADDED Requirements

### Requirement: LRU eviction of loaded documents by identifier
The box and each device SHALL keep loaded documents in an LRU cache keyed by document identifier with a configurable memory budget. When the budget is exceeded, the least recently synchronised or accessed document SHALL be flushed to durable storage and unloaded. Eviction SHALL never lose data, and an evicted document SHALL be reloaded on demand when a peer requests it or a user opens it.

#### Scenario: Box serves more documents than fit in memory
- **WHEN** a box holding four thousand documents with a budget for four hundred is contacted by a device requesting a document not loaded
- **THEN** the box loads the requested document from storage, evicts the least recently used document if needed, and syncs without error

### Requirement: Compaction per document family
The system SHALL compact as follows. Open-tier content documents SHALL retain full history; the box MAY offer a squash fork that records the squash in provenance and retains the original. Learner logs SHALL be retired at retention boundaries by destroying the learner record key and then deleting the ciphertext; learner-owned content documents SHALL be squashed or dropped at the same boundaries. Class and site logs SHALL be compacted by epoch sealing. Compaction SHALL never alter folded state or verified lineage.

#### Scenario: Large open document offered a squash fork
- **WHEN** an open document's history exceeds the configured threshold
- **THEN** the box offers the teacher a squash fork for new readers, the original remains available, and the fork's provenance records the squash and the source heads

### Requirement: Size budgets
Each content document SHALL have a configurable size budget. When a document approaches its budget the editor SHALL warn, and when it exceeds the budget the editor SHALL refuse further inline growth and direct the author to split the document or move media to bundles. Each pack SHALL declare its size, and a site SHALL have a configurable cap on total pack storage per device.

#### Scenario: Document over budget
- **WHEN** an author tries to paste content that would take a document past its budget
- **THEN** the paste is refused with the size and the suggestion to split or attach

### Requirement: Persistent storage on devices
A device SHALL request persistent storage from the browser on first run and SHALL report its storage state (persistent or best-effort, quota, usage) to the box at each contact. When persistence is not granted, the device SHALL warn the user and the box SHALL show the device as at risk in the teacher's device list.

#### Scenario: Persistence denied
- **WHEN** a browser declines the persistent storage request
- **THEN** the device warns that work may be evicted by the browser, and the teacher sees the device marked at risk

### Requirement: Selective pack caching on devices
A device SHALL cache the site copies of packs assigned to the learner's current units up to the site's per-device cap, SHALL evict cached packs no longer assigned first, and SHALL let the learner choose additional packs to keep offline within the cap.

#### Scenario: Cap reached
- **WHEN** a new unit assigns a pack that would exceed the device's cap
- **THEN** the device evicts the oldest unassigned cached pack, and if the cap still cannot be met, shows which packs will be unavailable offline

### Requirement: Dropping documents on instruction
A device SHALL delete its local replica of a document when the box instructs it to through a drop operation it is entitled to see, and SHALL acknowledge the drop with a signed operation.

#### Scenario: Retired learner's documents removed from a teacher device
- **WHEN** a learner is retired and the teacher's device next syncs
- **THEN** the device deletes that learner's log and documents and records a drop acknowledgement

### Requirement: Durability under abrupt power loss
The box SHALL write documents, logs, keys, and pack copies so that loss of power at any moment corrupts nothing already stored and loses at most the changes in flight, which devices resend at their next contact. The box SHALL check and repair its storage on every boot, SHALL minimise write amplification on flash media, and SHALL count unclean shutdowns and show them on the status page.

#### Scenario: Power cut during a lesson
- **WHEN** the box loses power while thirty devices are syncing
- **THEN** it boots cleanly, every document and log it had stored is intact, and the devices resend the changes that were in flight
