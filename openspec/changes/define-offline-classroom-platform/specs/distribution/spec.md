## Purpose

Distribution gets the box into a teacher's hands as one file or one image that runs without an installer ceremony, and keeps content and platform updates separate.

## ADDED Requirements

### Requirement: Single self-contained binary
The box SHALL ship as one executable per supported platform (Linux arm64 and x64, Windows x64, macOS) with the web application assets embedded. First run SHALL create the data directory, show the setup code, and require no separately installed runtime.

#### Scenario: Teacher runs the box on a laptop
- **WHEN** a teacher downloads the executable and runs it
- **THEN** the box starts, shows its setup code and URL, and serves the application with no further installation

### Requirement: Flashable Raspberry Pi image
The platform SHALL provide a flashable image for supported Raspberry Pi models, with the Raspberry Pi 5 and its clock battery as the reference hardware, that boots directly into the box, shows the setup code on an attached display and on a status page, and supports both network modes. Models without a battery-backed clock SHALL be supported with the time-source hierarchy in force.

#### Scenario: Pi first boot
- **WHEN** a school flashes the image and powers the Pi
- **THEN** it boots into the box, starts box-as-network mode by default, and displays the setup code and URL

### Requirement: Signed and notarised builds
Windows executables and installers SHALL be code-signed so that a default Windows installation runs them without a SmartScreen block, and macOS builds SHALL be signed and notarised. Unsigned builds SHALL NOT be published as releases.

#### Scenario: Windows download
- **WHEN** a teacher runs the installer on a default Windows installation
- **THEN** it runs without a SmartScreen block

### Requirement: Content installs independently of the platform
Installing, updating, or removing packs SHALL never require a platform update, reinstall, or restart, and platform updates SHALL never remove packs, licences, documents, or logs.

#### Scenario: Pack installed months after platform install
- **WHEN** a school buys a new pack a year after installing the box
- **THEN** the pack installs on the existing platform version without any platform change

### Requirement: Platform updates
Platform updates SHALL be signed bundles that the box applies from the store when online or from a file. An update SHALL preserve all data, SHALL roll back automatically if the new version fails to start, and SHALL follow the log schema compatibility rules so older devices keep working until they update.

#### Scenario: Failed update rolls back
- **WHEN** an update is applied and the new version fails to start
- **THEN** the box restarts the previous version with all data intact and reports the failure

### Requirement: Installable offline-capable client
The client SHALL be an installable web application that works offline from its service worker cache and SHALL update itself when connected to the box after a platform update, while keeping local data across updates.

#### Scenario: Client update after box update
- **WHEN** a device connects to a box that has been updated
- **THEN** the client updates in the background and all local documents and leases remain
