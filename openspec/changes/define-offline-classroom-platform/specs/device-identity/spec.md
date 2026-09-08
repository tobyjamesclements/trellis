## Purpose

Device identity replaces passwords and identity providers with per-device keypairs joined to classes by code, supports the shared lab PCs and loaned laptops these schools actually have, and anchors leases to devices while identity follows the learner.

## ADDED Requirements

### Requirement: Keypair generated on first run
On first run a device SHALL generate an asymmetric signing keypair in the platform's key store with the private key non-exportable where the platform supports it, and SHALL use the public key's identifier as its device identity. No passwords SHALL be required to use the platform on an admitted device.

#### Scenario: Fresh install has an identity before joining
- **WHEN** a student opens the box's URL for the first time
- **THEN** the device holds a keypair and can present its public key to join a class without any account creation

### Requirement: Class codes and staff codes
Each class SHALL have a class code, issued when the class is created, that is valid while the class is live and invalid while it is stopped. A class code SHALL admit devices with the student role into that class only. Staff SHALL be admitted with short-lived codes issued by an administrator, bound to the teacher or administrator role. Every code SHALL have a QR form that also carries, signed by the site key, the box's LAN addresses, the site key fingerprint, the current LAN transport parameters, and the shell URL, so that a device can reach and verify the box without name resolution. Failed code attempts SHALL be rate-limited and shown on the box status page.

#### Scenario: Class code follows the class
- **WHEN** a teacher stops a class at the end of term
- **THEN** its code stops admitting devices until the class is started again

#### Scenario: Joining without name resolution
- **WHEN** a student scans the teacher's QR on a network where the box's hostname does not resolve
- **THEN** the device connects to the box's LAN address over a pinned transport, verifies the site key fingerprint from the QR, and completes the join

#### Scenario: Code guessed by a device on the LAN
- **WHEN** a device presents an unknown or stopped code
- **THEN** admission is refused, further attempts are delayed, and the failure is shown on the box status page

### Requirement: Joining by code with self-registration
A student joining with a class code SHALL either select their existing name at the site and enter their PIN, or register by entering a display name and choosing a PIN, after which the box SHALL create a learner reference, record the device admission and the class enrolment as site-log and class-log operations signed by the site key, and return the site's public key, which the device SHALL pin. Teachers SHALL be able to rename learners, merge duplicates, remove a learner from the class, and reset a PIN. A teacher MAY pre-create learners from a typed or pasted list of names so students only select and set a PIN.

#### Scenario: Thirty students join in the first lesson
- **WHEN** a teacher shows the class code and thirty students each enter a name and a PIN on lab PCs
- **THEN** thirty learner references exist, each is enrolled in the class, and the teacher's class overview lists them for tidying

#### Scenario: Same student, second class
- **WHEN** a student who already joined one class enters another class's code
- **THEN** they select their existing name and PIN, no second learner reference is created, and the new enrolment is recorded

#### Scenario: Duplicate names merged
- **WHEN** a student registered twice by mistake and the teacher merges the two entries
- **THEN** one learner reference remains, both devices resolve to it, and the merged learner's records fold as one

### Requirement: Roles and device designations
The system SHALL support the roles administrator, teacher, and student, and the device designations shared and loaned. The first device admitted with the setup code shown by the box at install SHALL become an administrator. Only administrators SHALL assign the administrator and teacher roles and SHALL designate devices as shared or loaned.

#### Scenario: Setup creates the first administrator
- **WHEN** a teacher enters the box's install-time setup code from their laptop
- **THEN** that laptop is admitted as an administrator device and the setup code is invalidated

### Requirement: Learner sessions on shared devices
A device designated shared SHALL support learner sessions: a learner selects their display name from the roster snapshot of a class on that device and enters their PIN, after which operations from that device carry the learner reference as the actor. Ending a session SHALL clear the learner's keys and roster view from memory. The system SHALL document that a PIN is weak authentication acceptable for formative work and that summative use is out of scope.

#### Scenario: Lab PC used by two classes
- **WHEN** a lab PC is used by a learner from one class in the morning and a learner from another in the afternoon
- **THEN** each learner's operations are attributed to their own learner reference, each sees only their own work, and each holds a separate lease on the device

#### Scenario: Wrong PIN
- **WHEN** a learner enters an incorrect PIN three times
- **THEN** the session is not started, further attempts are delayed, and the teacher is shown the attempts

### Requirement: Check-out and check-in of loaned devices
A device designated loaned SHALL be checked out to one learner at the box by a teacher or administrator, which SHALL start that learner's session, issue their leases, and cache their classes' content. It SHALL be checked in at the box on return, which SHALL end the leases, destroy the borrower's record key and wrapped keys on the device, drop the borrower's learner documents and logs from the device with signed acknowledgements, and clear the session, leaving shared class content cached for the next borrower. A loaned device not checked in by its due date SHALL be shown as overdue, and a teacher MAY mark it lost, which SHALL revoke it.

#### Scenario: Weekly rotation
- **WHEN** a laptop checked out to one learner on Monday is checked in on Friday and checked out to another on the following Monday
- **THEN** the second learner cannot see the first learner's work or messages on the device, and the first learner's work is intact on the box

#### Scenario: Laptop not returned
- **WHEN** a loaned laptop passes its due date without check-in
- **THEN** the teacher's overview shows it as overdue with the borrower, and marking it lost revokes the device so it stops syncing and its loans run out at grace

### Requirement: Revocation and re-issue for lost devices
A teacher or administrator SHALL be able to revoke a device. Revocation SHALL be a site-log operation after which the box refuses sync and lease renewal to that key, and every fold discards later operations from it. A replacement device SHALL be admitted against the same learner reference by the join flow, and the learner's documents and logs SHALL be shared to it so the learner continues with their existing work. The system SHALL document that unsynced work on the lost device is lost and that the lost device retains licensed rendering until its lease grace ends.

#### Scenario: Student loses a laptop
- **WHEN** a teacher revokes the lost laptop and the student joins again on another device with their existing name and PIN
- **THEN** the new device receives the learner's logs and documents from the box and the old device's key no longer syncs

### Requirement: Identity follows the learner, leases follow the device
Leases SHALL be issued to device keys, and everything a learner makes SHALL be attributed to their learner reference, so that a learner can use a lab PC, a loaned laptop, and a replacement device over a term and see one body of work.

#### Scenario: Same learner, three devices
- **WHEN** a learner works on a lab PC on Monday, a loaned laptop at home, and a different lab PC on Friday
- **THEN** the teacher sees one learner with one set of submissions and records
