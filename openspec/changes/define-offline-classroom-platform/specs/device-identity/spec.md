## Purpose

Device identity replaces passwords and identity providers with per-device keypairs admitted by the teacher, and anchors leases and seat accounting, while supporting the shared class-set devices common in primary schools.

## ADDED Requirements

### Requirement: Keypair generated on first run
On first run a device SHALL generate an asymmetric signing keypair in the platform's key store with the private key non-exportable where the platform supports it, and SHALL use the public key's identifier as its device identity. No passwords SHALL be required to use the platform on an admitted device.

#### Scenario: Fresh install has an identity before admission
- **WHEN** a student opens the box's URL for the first time
- **THEN** the device holds a keypair and can present its public key for admission without any account creation

### Requirement: Admission by code or QR
A device SHALL join a site by presenting its public key together with an admission code displayed by the box or by a teacher device as text and QR. Admission codes SHALL be time-limited, SHALL be bound to a role and, for students, to a class and optionally to a learner reference, and SHALL be usable by multiple devices only when the teacher chooses a class-wide code. A successful admission SHALL be recorded as a site-log operation signed by an authorised key and SHALL return the site's public key, which the device SHALL pin for all later verification.

#### Scenario: Whole class admitted from one code
- **WHEN** a teacher shows a ten-minute class code and thirty students enter it
- **THEN** each device is admitted with the student role for that class, each appears in the teacher's device list for assignment to a learner reference, and the code stops working after ten minutes

#### Scenario: Code guessed by a device on the LAN
- **WHEN** a device presents an expired or unknown admission code
- **THEN** admission is refused, the attempt is rate-limited, and the failure is shown on the box status page

### Requirement: Roles
The system SHALL support the roles administrator, teacher, and student, and a shared-device designation. The first device admitted with the setup code shown by the box at install SHALL become an administrator. Only administrators SHALL assign the administrator and teacher roles.

#### Scenario: Setup creates the first administrator
- **WHEN** a teacher enters the box's install-time setup code from their laptop
- **THEN** that laptop is admitted as an administrator device and the setup code is invalidated

### Requirement: Revocation and re-issue for lost devices
A teacher or administrator SHALL be able to revoke a device. Revocation SHALL be a site-log operation after which the box refuses sync and lease renewal to that key, and every fold discards later operations from it. A replacement device SHALL be admitted against the same learner reference, and the learner's documents and logs SHALL be shared to it so the learner continues with their existing work. The system SHALL document that unsynced work on the lost device is lost and that the lost device retains licensed rendering until its lease grace ends.

#### Scenario: Student loses a tablet
- **WHEN** a teacher revokes the lost tablet and admits a new one for the same learner reference
- **THEN** the new tablet receives the learner's logs and documents from the box, the old tablet's key no longer syncs, and the seat count is unchanged

### Requirement: Learner sessions on shared devices
A device admitted as shared SHALL support learner sessions: a learner selects their display name from the class roster snapshot and enters a learner PIN set by the teacher, after which operations from that device carry the learner reference as the actor. Ending a session SHALL clear the learner's roster snapshot view and lease keys from memory. The system SHALL document that a PIN is weak authentication acceptable for formative work and that summative use is out of scope.

#### Scenario: Class set of tablets used by two classes
- **WHEN** a tablet is used by a Year 4 learner in the morning and a Year 5 learner in the afternoon
- **THEN** each learner's operations are attributed to their own learner reference, each sees only their own work, and each holds a separate lease on the device

#### Scenario: Wrong PIN
- **WHEN** a learner enters an incorrect PIN three times
- **THEN** the session is not started, further attempts are delayed, and the teacher is shown the attempts

### Requirement: Device identity anchors leases and seats
Leases SHALL be issued to device keys and seats SHALL be allocated to learner references, so that a learner with several devices uses one seat and a shared device carries one lease per learner session.

#### Scenario: Seat follows the learner, lease follows the device
- **WHEN** a learner's device is replaced
- **THEN** the seat allocation is unchanged and a new lease is issued to the new device key

### Requirement: Attribution handle is separate from identity
Each device SHALL carry an attribution handle chosen by its user for public display in open-tier provenance. The handle SHALL be changeable, SHALL NOT be derived from roster data automatically, and SHALL be the only identity that ever leaves the site with open content.

#### Scenario: Teacher shares a document under a chosen name
- **WHEN** a teacher sets their attribution handle and shares a document to the commons
- **THEN** the commons shows that handle and never the teacher's roster record or device key
