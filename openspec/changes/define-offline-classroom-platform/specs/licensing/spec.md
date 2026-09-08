## Purpose

Licensing binds a commercial pack to one box through a separately delivered, offline-verifiable, signed token, the way a site licence for a textbook covers every learner in a school, and records every change of licence state as an auditable operation in the site log.

## ADDED Requirements

### Requirement: Licence token content
A licence token SHALL be a signed document carrying: a licence identifier; the publisher key identifier and certificate chain to the project root; the pack family identifier and the version range covered; the site key identifier it is bound to; an optional validity window, whose absence means the licence has no end date; the maximum lease duration and grace period in days; whether printing is permitted; and the pack content key wrapped to the site key. The token SHALL be signed by the publisher key. It SHALL carry no seat, copy, cohort, or device count.

#### Scenario: Token bound to another site is refused
- **WHEN** a token whose site key identifier does not match this box's site key is imported
- **THEN** the box refuses activation and reports that the licence belongs to a different box

#### Scenario: Token without an end date
- **WHEN** a token carrying no validity window is activated
- **THEN** the pack remains licensed at the site indefinitely and no expiry is ever shown for it

### Requirement: A site licence covers every learner at the box
An activated licence SHALL entitle every learner admitted to the box, in any class, to borrow the pack. The box SHALL NOT count, allocate, or limit learners, devices, or copies under a licence, and SHALL present no allocation step to teachers or administrators.

#### Scenario: Whole school on one licence
- **WHEN** a box with four hundred admitted learners activates one licence for a pack
- **THEN** any of them can borrow the pack once a teacher adds it to one of their classes, and nothing about the licence changes as learners join or leave

### Requirement: Offline verification against an embedded root
The box SHALL verify a token entirely offline by checking the publisher certificate chain against the project root key embedded in the platform at install and the token signature against the publisher key. The project root key SHALL be updateable only through a signed platform update. Publisher keys SHALL NOT need to be embedded at install.

#### Scenario: New publisher verifies without a platform update
- **WHEN** a token from a publisher the box has never seen arrives with a certificate signed by the project root
- **THEN** the box verifies and activates it with no network access and no platform update

#### Scenario: Chain does not reach the root
- **WHEN** a token's certificate chain is signed by a key that is not certified by the embedded root
- **THEN** the box refuses activation and records the attempt

### Requirement: Publisher key status
The box SHALL accept a signed publisher key status list, delivered with packs, with tokens, by store download, or by file import, that revokes compromised publisher keys. A token signed by a revoked key SHALL NOT activate, and leases for packs whose licence was signed by a revoked key SHALL NOT be renewed after the status list is applied.

#### Scenario: Revoked publisher key stops renewals
- **WHEN** a status list revoking a publisher key is applied to the box
- **THEN** existing leases for that publisher's packs run to their expiry and grace and are not renewed, and the administrator is notified

### Requirement: Token delivery online or offline
The box SHALL obtain tokens by fetching from the store when connectivity exists and by import from a file, a pasted string, or a QR code scanned by an admitted device. The site SHALL display its site key identifier as text and as a QR code so that a purchase made elsewhere, including by a chain's head office or a ministry buying for many boxes, can be bound to it.

#### Scenario: Purchase on a phone, activation on an offline box
- **WHEN** a teacher buys a licence on a phone by entering the site identifier shown on the box and later scans the resulting QR token with an admitted device on the LAN
- **THEN** the box activates the licence with no internet connection of its own

#### Scenario: Chain buys for twelve boxes
- **WHEN** a chain's office buys licences for twelve boxes using their twelve site identifiers
- **THEN** it receives twelve tokens, each of which activates only on its own box

### Requirement: The stock room
The box SHALL present its licensed packs to teachers as a stock room from which a pack is added to a class in one action, with no quantity, seat, or allocation step. Unlicensed installed packs SHALL appear in the stock room with a "no licence" state so a teacher knows what the school could buy.

#### Scenario: Teacher adds a pack to a class
- **WHEN** a teacher opens the stock room and adds a licensed pack to their class
- **THEN** the pack appears in the class content and every member's device borrows it at its next contact with the box

### Requirement: Licence state changes are box-signed operations
Activation, deactivation, revocation, and, for tokens with a validity window, expiry observation SHALL each be recorded as an operation in the site log, signed by the site key, with the token embedded in the activation operation. The fold SHALL ignore, and log, any licence operation not signed by the site key.

#### Scenario: Audit trail of a licence
- **WHEN** an administrator reviews a licence
- **THEN** the site log yields the ordered history of activation, any deactivation, and any revocation, each verifiable against the site key

#### Scenario: Forged licence operation ignored
- **WHEN** a device other than the box injects a licence activation into the site log
- **THEN** every peer's fold skips it, records it as rejected, and the box reports the signing device to the administrator

### Requirement: Dated licences
Where a token carries a validity window, the box and every device SHALL judge validity against their own clocks, a token outside its window SHALL NOT support new leases, and the box SHALL record an expiry-observed operation when it first observes the end passing. Derivative works and references SHALL be retained after expiry as specified by the tier boundary. The platform SHALL present undated licences as the normal case and dated ones as a publisher's choice.

#### Scenario: Expired dated licence blocks new leases
- **WHEN** a device requests a lease renewal after the box's clock has passed a dated token's end
- **THEN** the renewal is refused, the device's current lease runs to its own expiry and grace, and the administrator is shown the expired licence

### Requirement: Revocation and deactivation
A publisher revocation SHALL be a signed record naming the licence identifier, delivered by any token delivery path. An administrator deactivation SHALL be a site-log operation. On either, the box SHALL stop issuing and renewing leases for the licence, SHALL destroy the per-pack site key after the longest outstanding lease's grace period, and SHALL record the event. The system SHALL state that devices which do not contact the box continue rendering until their lease grace ends; revocation reaches offline devices no sooner than that.

#### Scenario: Revocation bound on offline devices
- **WHEN** a publisher revokes a licence and one device does not contact the box for weeks
- **THEN** that device stops rendering when its existing lease grace ends, and the administrator's licence view shows which devices have not yet acknowledged the revocation
