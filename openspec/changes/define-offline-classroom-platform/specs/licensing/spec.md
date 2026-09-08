## Purpose

Licensing binds commercial packs to a site through separately delivered, offline-verifiable, signed tokens, and makes every change of licence state an auditable operation in the site's state log.

## ADDED Requirements

### Requirement: Licence token content
A licence token SHALL be a signed document carrying: a licence identifier; the publisher key identifier and certificate chain to the project root; the pack family identifier and the version range covered; the site key identifier it is bound to; the entitlement model, which SHALL be one of seat count, cohort (a learner cap for named classes), or whole site; a validity window (not-before and not-after); the maximum lease duration and grace period in days; whether printing is permitted; the reassignment policy for seats; and the pack content key wrapped to the site key. The token SHALL be signed by the publisher key.

#### Scenario: Token bound to another site is refused
- **WHEN** a token whose site key identifier does not match this box's site key is imported
- **THEN** the box refuses activation and reports that the licence belongs to a different site

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
The box SHALL obtain tokens by fetching from the store when connectivity exists and by import from a file, a pasted string, or a QR code scanned by an admitted device. The site SHALL display its site key identifier as text and as a QR code so that a purchase made elsewhere can be bound to it.

#### Scenario: Purchase on a phone, activation on an offline box
- **WHEN** a teacher buys a licence on a phone by entering the site identifier shown on the box and later scans the resulting QR token with an admitted device on the LAN
- **THEN** the box activates the licence with no internet connection of its own

### Requirement: Licence state changes are box-signed operations
Activation, seat allocation, seat release, expiry observation, deactivation, and revocation SHALL each be recorded as an operation in the site log, signed by the site key, with the token embedded in the activation operation. The fold SHALL ignore, and log, any licence operation not signed by the site key. Because the site key is the only valid signer, seat allocation SHALL be totally ordered and SHALL never over-allocate.

#### Scenario: Audit trail of a seat
- **WHEN** an administrator reviews a licence
- **THEN** the site log yields the ordered history of activation, each seat allocation with the learner reference and time, each release, and any revocation, each verifiable against the site key

#### Scenario: Forged allocation ignored
- **WHEN** a device other than the box injects a seat allocation operation into the site log
- **THEN** every peer's fold skips it, records it as rejected, and the box reports the signing device to the administrator

### Requirement: Seat allocation semantics
Under the seat-count model, the box SHALL allocate a seat to a learner reference, not to a device, at the first lease issued for that learner and pack, and SHALL refuse leases once seats are exhausted while reporting the shortfall. A seat SHALL be released only by an administrator or teacher action or when the learner is retired, and released seats SHALL be reusable subject to the token's reassignment policy. Under the cohort model the box SHALL count enrolled learner references in the named classes against the cap. Under the whole-site model no counting SHALL apply.

#### Scenario: Learner with two devices uses one seat
- **WHEN** a learner uses a school tablet and a home laptop that are both admitted for that learner reference
- **THEN** one seat is allocated and both devices receive leases

#### Scenario: Seats exhausted
- **WHEN** the thirty-first learner requests a lease on a thirty-seat licence
- **THEN** no lease is issued, the learner's device shows that no seat is available, and the teacher is shown the shortfall against the licence

### Requirement: Validity window and expiry
The box and every device SHALL judge validity against their own clocks, and a token outside its validity window SHALL NOT support new leases. The box SHALL record an expiry-observed operation when it first observes not-after passing. Derivative works and references SHALL be retained after expiry as specified by the tier boundary.

#### Scenario: Expired licence blocks new leases
- **WHEN** a device requests a lease renewal after the box's clock has passed the token's not-after
- **THEN** the renewal is refused, the device's current lease runs to its own expiry and grace, and the administrator is shown the expired licence

### Requirement: Revocation and deactivation
A publisher revocation SHALL be a signed record naming the licence identifier, delivered by any token delivery path. An administrator deactivation SHALL be a site-log operation. On either, the box SHALL stop issuing and renewing leases for the licence, SHALL destroy the per-pack site key after the longest outstanding lease's grace period, and SHALL record the event. The system SHALL state that devices which do not contact the box continue rendering until their lease grace ends; revocation reaches offline devices no sooner than that.

#### Scenario: Revocation bound on offline devices
- **WHEN** a publisher revokes a licence and one device does not contact the box for weeks
- **THEN** that device stops rendering when its existing lease grace ends, and the administrator's licence view shows which devices have not yet acknowledged the revocation
