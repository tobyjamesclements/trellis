## Purpose

Document sync moves Automerge documents between devices and the box using automerge-repo unchanged, with share policy by tier and role, a star topology through the box, and strict rules on where licensed bytes may go.

## ADDED Requirements

### Requirement: automerge-repo is the sync layer
The system SHALL synchronise Automerge documents using the automerge-repo sync protocol and its network and storage adapter interfaces without modification. The system SHALL NOT define a new document sync protocol. Pack bytes, which are not documents, SHALL be transferred by a content-addressed fetch over the same transport.

#### Scenario: Standard client interoperates
- **WHEN** a device connects to the box with an unmodified automerge-repo client over the platform's WebSocket transport after authenticating
- **THEN** documents the share policy permits synchronise without any platform-specific protocol extension

### Requirement: Authenticated connections
A peer SHALL prove possession of an admitted, unrevoked device key by challenge-response before any document is shared. Unauthenticated connections SHALL be offered only the admission flow.

#### Scenario: Revoked device connects
- **WHEN** a device whose key has been revoked opens a sync connection
- **THEN** the box completes no sync and returns it to the admission flow

### Requirement: Star topology in deployment
Devices SHALL synchronise only with the box in the initial platform, and the box SHALL relay between devices. The protocol SHALL remain symmetric so that direct device-to-device sync can be enabled later; devices SHALL refuse sync connections from non-box peers until that is enabled by site configuration.

#### Scenario: Box down
- **WHEN** the box is unreachable
- **THEN** devices continue working locally, do not sync with each other, and resume sync when the box returns

### Requirement: Share policy by tier and role
The box SHALL share a document with a peer only as follows. Open-tier documents: any admitted site device, and the commons relay when enabled. Site-tier documents owned by a class: teachers and administrators of the site, and students of that class who hold a valid lease for every licensed pack the document references. Site-tier documents owned by a learner: that learner's devices, teachers of the class, and administrators. Class logs: members of that class. Learner logs: that learner's devices, teachers of the class, and administrators. Site log: every admitted device. Devices SHALL apply the same policy to documents they hold.

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
The box SHALL serve a pack's site copy only to a device presenting a valid lease that names that pack, or to a teacher or administrator device of the site, and SHALL refuse every other request. Pack bytes SHALL never be relayed to the commons relay or to any peer outside the site.

#### Scenario: Lease-less request for pack bytes
- **WHEN** an admitted student device without a lease for pack P requests P's bytes
- **THEN** the box refuses and the device shows that a lease is required

### Requirement: Commons relay carries open documents only
When a site enables cross-site sharing, the box SHALL connect to the commons relay as a peer and SHALL offer only open-tier documents with verified lineage. The commons relay SHALL refuse any document whose tier is not open or that references a licensed pack address, and SHALL never receive class logs, learner logs, site logs, site-tier documents, or pack bytes.

#### Scenario: Site-tier document never reaches the commons
- **WHEN** the box's share policy is evaluated for the commons peer
- **THEN** the set offered contains no site-tier or log documents, and a document that somehow arrives with a non-open tier is rejected by the relay

### Requirement: Sync resumes incrementally
After any interruption, sync SHALL resume by exchanging only the changes the other peer lacks, and a device returning after weeks offline SHALL receive every change made in its absence for documents it is entitled to.

#### Scenario: Return from a fortnight offline
- **WHEN** a device reconnects after two weeks with local changes to three documents
- **THEN** its changes reach the box, it receives all changes made at school in the meantime, and no full re-download is required for documents it already holds
