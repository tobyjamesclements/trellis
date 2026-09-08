## Purpose

Licensed packs are the commercial content unit: signed, encrypted, versioned, content-addressed bundles that travel independently of licences, remain inert without one, and are rendered only from a per-site watermarked copy.

## ADDED Requirements

### Requirement: Pack bundle format
A licensed pack SHALL be a single file consisting of a publisher-signed manifest and an encrypted payload. The manifest SHALL carry: a stable pack family identifier, a version, the content address of the previous version if any, the publisher key identifier and the publisher's certificate chain to the project root, the pack kind (native content, cmi5, SCORM 1.2, SCORM 2004, QTI, or other opaque), the hash of the plaintext payload, the encryption scheme and content key identifier, and catalogue metadata (title, description, cover image, size) in cleartext. The item index and all content SHALL be inside the encrypted payload. The pack SHALL be addressed by the hash of the entire file.

#### Scenario: Catalogue shows an installed but unlicensed pack
- **WHEN** a pack file is installed on a box that holds no licence for it
- **THEN** the catalogue displays its title, publisher, version, and size from the cleartext manifest and shows a "no licence" state without revealing any item titles or content

#### Scenario: Tampered pack is rejected
- **WHEN** a pack file whose manifest signature does not verify, or whose payload hash does not match the manifest, is installed
- **THEN** the box refuses to install it and records the failure with the file's hash

### Requirement: Packs are inert without a licence
The box SHALL store an installed pack without decrypting it until a valid licence for that pack family and version is activated at the site. A pack without a licence SHALL NOT be relayed to any device and SHALL NOT be rendered anywhere.

#### Scenario: Pack sideloaded before purchase
- **WHEN** a school receives a pack by USB before buying a licence
- **THEN** the pack is installed and listed as unlicensed, no device receives its bytes, and activation of a licence later makes it available without reinstalling the pack

### Requirement: Installation paths and no platform reinstall
The box SHALL accept pack files by upload through the administrator interface, by scanning a removable volume or designated folder, and by download from the store when connectivity exists. Installing, updating, or removing a pack SHALL NOT require reinstalling, restarting, or updating the platform. Duplicate installs SHALL be detected by content address.

#### Scenario: USB sideload of several packs
- **WHEN** an administrator inserts a USB drive holding four pack files, one of which is already installed
- **THEN** the box installs the three new packs, reports the duplicate as already present, and the catalogue updates live

### Requirement: Versioning
Each pack version SHALL be a distinct content address linked to its predecessor through the manifest. A licence SHALL cover a pack family and a version range as stated in the token. The box SHALL retain any pack version that is referenced by an assignment or unit until the administrator removes it and SHALL present the newest licensed version by default.

#### Scenario: New version installed alongside old
- **WHEN** version 3 of a pack is installed while a unit still references version 2
- **THEN** both versions remain available, new assignments default to version 3, and the unit continues to resolve version 2

### Requirement: Site copy with per-site watermark
On activation of a licence, the box SHALL produce a site copy of the pack: it SHALL decrypt the publisher payload with the content key from the licence, SHALL embed a site watermark carrying the site identifier and licence identifier into images and into the text rendering configuration, SHALL leave video and audio unmodified because transcoding them on the box is impractical, SHALL re-encrypt the whole result under a per-pack site key, and SHALL retain the original publisher ciphertext for reprocessing. Re-encryption SHALL happen for every pack, including packs with no markable media, so that a leaked key unlocks one site's copy only. Only the site copy SHALL ever be relayed to devices. The publisher content key SHALL never leave the box.

#### Scenario: Leaked image traces to the site
- **WHEN** an image from a pack is found outside the school
- **THEN** the watermark embedded during site-copy generation identifies the site and licence it was produced for

#### Scenario: Video relies on the visible mark
- **WHEN** a video from a pack is played on a leased device
- **THEN** the player overlays the visible site and lease mark, and the design records that a captured video traces to the site only through that overlay

#### Scenario: Device receives only the site copy
- **WHEN** a leased device fetches a pack
- **THEN** it receives the site copy encrypted under the per-pack site key and never receives the publisher ciphertext or the publisher content key

### Requirement: Rendering constraints on devices
A device SHALL render licensed content only while it holds a valid lease covering that pack, SHALL decrypt into memory only, SHALL NOT write decrypted pack content to durable storage, and SHALL display the visible watermark on every rendered page. The system SHALL treat these constraints as deterrence on an untrusted client, not as a security boundary.

#### Scenario: Rendering after lease expiry
- **WHEN** the device's lease for a pack has passed its grace period
- **THEN** the device stops rendering that pack's content and discards the wrapped key while retaining the encrypted site copy so a renewed lease restores access without a new download

### Requirement: SCORM and other opaque packages as packs
A pack of kind cmi5, SCORM 1.2, or SCORM 2004 SHALL contain the package unchanged inside the encrypted payload, and the system SHALL launch it through the local runtime without extracting it to durable storage. The same wrapping SHALL apply to other opaque package kinds.

#### Scenario: Launch a licensed SCORM package offline
- **WHEN** a student with a valid lease opens a SCORM pack while offline
- **THEN** the package launches from the decrypted in-memory site copy and its runtime calls are served locally

### Requirement: Pack removal
An administrator SHALL be able to remove a pack from the site. Removal SHALL delete the site copy and the publisher ciphertext from the box, SHALL record a catalogue operation so devices drop their cached copies on next contact, and SHALL leave references in units and assignments in a "pack removed" state.

#### Scenario: Removed pack disappears from devices
- **WHEN** an administrator removes a pack and a leased device next contacts the box
- **THEN** the device deletes its cached site copy and the wrapped key for that pack
