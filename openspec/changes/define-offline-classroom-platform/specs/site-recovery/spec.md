## Purpose

Site recovery makes the loss of a box survivable: documents come back from the replicas on class devices, and the site's keys, licences, and pack keys come back from a recovery bundle or by re-issue.

## ADDED Requirements

### Requirement: Recovery bundle at install
At install the box SHALL generate a recovery bundle containing the site key, the ACME account key, and the directory encryption key, encrypted under a recovery passphrase, and SHALL offer it as a file and as a printable QR set. The box SHALL require the administrator to confirm the bundle is stored and SHALL remind them at intervals until confirmed. A recovery drill SHALL verify that a bundle decrypts without performing a rebuild.

#### Scenario: Install without saving the bundle
- **WHEN** an administrator skips saving the recovery bundle
- **THEN** the box shows a persistent reminder to every administrator device until a bundle is confirmed

### Requirement: Every device holds a full replica of what it touched
Every admitted device SHALL retain a full replica of every document it has synchronised, including history, until instructed to drop it, so that the union of device replicas can rebuild a box.

#### Scenario: Teacher device holds the class
- **WHEN** a teacher's laptop has synchronised every class document during the term
- **THEN** it holds complete replicas of those documents and their logs with full history

### Requirement: Rebuild from device replicas
A replacement box restored from a recovery bundle SHALL present the same site key, SHALL be trusted by every device without re-admission, and SHALL request every document each device holds as they connect. The rebuild SHALL be complete when every admitted device has connected or been marked lost, and the administrator SHALL see progress by device.

#### Scenario: Dead drive replaced
- **WHEN** the box's drive fails and a new box is restored from the bundle
- **THEN** each device that connects during the following days uploads its replicas, and the administrator sees which devices have not yet contributed

### Requirement: Succession without a recovery bundle
When no bundle exists, a new box SHALL generate a new site key, and an administrator device SHALL sign a succession operation naming the new key in its replica of the site log. Devices SHALL accept the new box when they see a succession signed by a key that held the administrator role, and SHALL then upload their replicas. The platform SHALL state that succession is a trust downgrade from the original box key and SHALL record it in the site log.

#### Scenario: Administrator authorises a successor
- **WHEN** an administrator device signs a succession for a new box
- **THEN** student devices that next connect see the succession in the site log, pin the new site key, and sync

### Requirement: Recovery of packs, licences, and pack keys
Pack site copies SHALL be recoverable from device caches, from publisher files, or by download. Licence tokens SHALL be recoverable from the activation operations replicated in the site log. Per-pack site keys SHALL be derived from the site key so a bundle restore recovers them. After a succession to a new site key, licences and pack keys SHALL be obtained by re-issue from the store for the new site key identifier, and site copies SHALL be regenerated.

#### Scenario: Restore with bundle
- **WHEN** a box is restored from its bundle
- **THEN** licences in the site log verify against the restored site key, pack keys derive from it, and site copies recovered from devices decrypt

#### Scenario: Restore by succession
- **WHEN** a box is replaced by succession with a new site key
- **THEN** existing licence tokens no longer bind to the site, the store re-issues them for the new key when connectivity exists, and packs are re-processed into new site copies

### Requirement: Directory recovery
The directory SHALL be recoverable by re-import from the management system and, where the administrator has enabled it, from an encrypted directory backup held on administrator devices.

#### Scenario: Names return after rebuild
- **WHEN** a rebuilt box re-imports the term's roster export
- **THEN** learner references in recovered logs resolve to the same people because references are stable by source identifier
