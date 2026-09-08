## Purpose

Document sync moves Automerge documents and pack bytes between devices and the box using automerge-repo unchanged, over LAN transports that authenticate the box by its site key rather than by the web PKI, with share policy by tier and role and a star topology.

## ADDED Requirements

### Requirement: automerge-repo is the sync layer
The system SHALL synchronise Automerge documents using the automerge-repo sync protocol and its network and storage adapter interfaces without modification. The system SHALL NOT define a new document sync protocol; every LAN transport SHALL be an automerge-repo network adapter. Pack bytes, which are not documents, SHALL be transferred by a content-addressed fetch over the same transports.

#### Scenario: Standard client interoperates
- **WHEN** a device connects to the box with an unmodified automerge-repo client over any of the platform's transports after authenticating
- **THEN** documents the share policy permits synchronise without any platform-specific protocol extension

### Requirement: LAN transports authenticated by the site key
The platform SHALL provide these transports to the box's LAN address. **Hash-pinned WebTransport**: the box presents a short-lived self-signed certificate that satisfies browsers' requirements for hash verification, currently ECDSA P-256 and at most fourteen days of validity, and the device verifies it against a site-signed schedule of certificate hashes it already holds. **Signalling-free WebRTC**: the box operates as an ICE-lite agent with static credentials and a long-lived DTLS certificate whose fingerprint the device holds signed by the site key, the device constructs the box's session description locally, and no signalling server is involved. **WebSocket over HTTPS**: used only while the box holds a valid publicly trusted or fleet-trusted certificate. A device SHALL prefer hash-pinned WebTransport, then signalling-free WebRTC, then WebSocket, according to what its browser supports, and in every case the box SHALL prove possession of the site key before any document is shared.

#### Scenario: Chromium device with an expired shell certificate
- **WHEN** a Chromebook opens the installed application after the box's certificate has expired
- **THEN** it connects over hash-pinned WebTransport using the schedule it holds and syncs normally

#### Scenario: Safari device
- **WHEN** a device running Safari connects to the box
- **THEN** it uses signalling-free WebRTC, verifies the box's DTLS fingerprint against the site-signed value it holds, and syncs normally

#### Scenario: Impersonating box on the LAN
- **WHEN** another machine on the LAN answers on the box's address without the site key
- **THEN** the device's transport verification fails and no document is shared

### Requirement: Transport parameters travel with admission and every contact
The box SHALL deliver to each device, signed by the site key: its LAN addresses and ports, a schedule of upcoming WebTransport certificate hashes covering at least twelve months, its WebRTC static credentials and DTLS fingerprint, and the shell URL. The device SHALL receive them in the admission QR and SHALL refresh them at every contact, SHALL keep the last known set, and SHALL locate the box by its last known addresses before falling back to the hostname.

#### Scenario: Device returns after six months
- **WHEN** a device that last contacted the box six months ago reconnects
- **THEN** it connects with a certificate hash from the schedule it holds and receives a refreshed schedule

#### Scenario: Box address changed while the device was away
- **WHEN** the box's LAN address has changed since a device's last contact
- **THEN** the device tries its last known addresses, then the hostname, and the box status page recommends a fixed address in join-existing-LAN mode

### Requirement: Authenticated connections
A peer SHALL prove possession of an admitted, unrevoked device key by challenge-response before any document is shared. Unauthenticated connections SHALL be offered only the admission flow. Where a transport cannot verify the device's identity at the transport layer, this application-level proof SHALL be the device's authentication.

#### Scenario: Revoked device connects
- **WHEN** a device whose key has been revoked opens a sync connection
- **THEN** the box completes no sync and returns it to the admission flow

### Requirement: Star topology in deployment
Devices SHALL synchronise only with the box in the initial platform, and the box SHALL relay between devices. The protocol SHALL remain symmetric so that direct device-to-device sync can be enabled later; devices SHALL refuse sync connections from non-box peers until that is enabled by site configuration.

#### Scenario: Box down
- **WHEN** the box is unreachable
- **THEN** devices continue working locally, do not sync with each other, and resume sync when the box returns

### Requirement: Share policy by tier and role
The box SHALL share a document with a peer only as follows. Open-tier documents: any admitted site device. Site-tier documents owned by a class: teachers and administrators of the site, and students of that class who hold a valid lease for every licensed pack the document references. Site-tier documents owned by a learner: that learner's devices, teachers of the class, and administrators. Class logs: members of that class. Learner logs: that learner's devices, teachers of the class, and administrators. Site log: every admitted device. Devices SHALL apply the same policy to documents they hold.

#### Scenario: Student cannot obtain another learner's log
- **WHEN** a student device requests a classmate's learner log by document identifier
- **THEN** the box does not share it, and the request is recorded

#### Scenario: Annotation requires a lease
- **WHEN** a site-tier annotation references pack P and a student's lease does not cover P
- **THEN** the box does not share that annotation with the student's device

### Requirement: Document identifiers are not disclosed beyond entitlement
The box SHALL treat a document identifier as a bearer capability within the site and SHALL not disclose identifiers of documents a device is not entitled to receive.

#### Scenario: Class listing is scoped
- **WHEN** a student device requests the list of documents for its class
- **THEN** the list contains only documents the share policy would deliver to that device

### Requirement: Licensed pack bytes go only to leased peers within the site
The box SHALL serve a pack's site copy only to a device presenting a valid lease that names that pack, or to a teacher or administrator device of the site, and SHALL refuse every other request. Pack bytes SHALL never leave the site by any transport.

#### Scenario: Lease-less request for pack bytes
- **WHEN** an admitted student device without a lease for pack P requests P's bytes
- **THEN** the box refuses and the device shows that a lease is required

### Requirement: No live sync outside the site
The box SHALL NOT establish document sync with any peer outside the site, so that no site-tier document, log, or pack byte can ever be offered to an external peer. Content SHALL leave the site only by an explicit export performed by a teacher.

#### Scenario: External peer attempts to sync
- **WHEN** a peer that is not an admitted device of the site attempts to open a sync connection to the box
- **THEN** the box refuses, and the only way content leaves the site is an explicit export by a teacher

### Requirement: Sync resumes incrementally
After any interruption, sync SHALL resume by exchanging only the changes the other peer lacks, and a device returning after weeks offline SHALL receive every change made in its absence for documents it is entitled to.

#### Scenario: Return from a fortnight offline
- **WHEN** a device reconnects after two weeks with local changes to three documents
- **THEN** its changes reach the box, it receives all changes made at school in the meantime, and no full re-download is required for documents it already holds
