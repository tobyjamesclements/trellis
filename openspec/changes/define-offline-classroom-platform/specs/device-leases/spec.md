## Purpose

Device leases let licensed content render offline on student devices for homework while keeping the classroom box, not the internet, as the licence anchor, with explicit expiry, renewal, and grace behaviour and an honest limit on what expiry can enforce.

## ADDED Requirements

### Requirement: Lease content and binding
A lease SHALL be a document signed by the site key, bound to one device key and one learner reference, listing the packs the learner is entitled to, carrying for each pack the per-pack site key wrapped to the device key, and stating an issued-at time, an expiry time, and a grace-until time. A shared device SHALL hold one lease per learner who has a session on it.

#### Scenario: Lease scoped to entitlement
- **WHEN** a learner is enrolled in a class with licences for packs A and B but not pack C
- **THEN** the lease issued to that learner's device wraps keys for A and B only

### Requirement: Default duration, renewal, and caps
The default lease duration SHALL be 30 days, sliding: every authenticated contact between the device and the box SHALL renew the lease to a fresh 30 days from the time of contact. The expiry SHALL never exceed the licence's not-after. A publisher MAY lower the maximum lease duration and grace in the token, and a site administrator MAY lower them further for the site; neither MAY raise them above the platform default.

#### Scenario: Daily renewal at school
- **WHEN** a device connects to the box on Monday
- **THEN** its lease expiry moves to 30 days from Monday, and on Tuesday it moves to 30 days from Tuesday

#### Scenario: Publisher cap applied
- **WHEN** a token sets a maximum lease duration of 14 days
- **THEN** leases for that pack are issued for 14 days while other packs on the same device keep 30

#### Scenario: Lease capped by licence end
- **WHEN** a lease is renewed 10 days before the licence's not-after
- **THEN** the lease expiry is set to the licence's not-after, not 30 days ahead

### Requirement: Grace behaviour
The default grace period SHALL be 7 days after expiry. During grace, the device SHALL continue to render licensed content and SHALL show a persistent notice that the lease has expired and the device must reconnect at school. After grace, the device SHALL stop rendering licensed content, SHALL discard the wrapped keys, and SHALL retain pack titles and the learner's own work so nothing the learner created is lost.

#### Scenario: Device away over a half-term break
- **WHEN** a device last contacted the box 16 days before the end of a two-week break
- **THEN** it renders licensed homework throughout the break with 14 days of lease remaining on return

#### Scenario: Device never returns
- **WHEN** a device passes 37 days without contacting the box
- **THEN** licensed content no longer renders on it, its open-tier content and its own submissions remain fully usable, and reconnecting to the box later restores a lease if the learner is still entitled

### Requirement: Open-tier content is never leased
The system SHALL never require a lease for open-tier or site-tier documents, and such content SHALL never expire on a device.

#### Scenario: Expired lease does not affect open content
- **WHEN** a device's lease has expired and passed grace
- **THEN** every open-tier document and site-tier document the device holds continues to open and edit normally

### Requirement: Clock-rollback guard
The device SHALL maintain a high-water mark of the latest time it has observed from its own clock and from the box at each contact. If the device clock reads more than one hour earlier than the high-water mark, the device SHALL suspend rendering of licensed content until its next contact with the box. The system SHALL record that this guard is deterrence: clearing the device's site data removes the mark but also removes the lease and keys.

#### Scenario: Clock set back to extend a lease
- **WHEN** a student sets the device clock back three weeks after the lease has expired
- **THEN** licensed content does not render because the clock is behind the high-water mark, and open content is unaffected

### Requirement: Lease issuance is recorded coarsely
Seat allocation SHALL be recorded in the site log at first issuance for a learner and pack. Routine renewals SHALL NOT be recorded as log operations; the box SHALL keep a local lease register with the latest expiry per device and learner, and SHALL record a lease-lost event in the site log only when a device has passed grace without contact.

#### Scenario: Renewals do not flood the log
- **WHEN** thirty devices renew leases every school day for a term
- **THEN** the site log gains no renewal operations and the administrator can still see each device's last contact and lease expiry from the box's register

### Requirement: Revocation propagation and its bound
When a device is revoked, a learner is retired, a seat is released, or a licence is revoked or deactivated, the box SHALL refuse further renewals for the affected lease and SHALL instruct the device to discard keys at its next contact. The system SHALL document that an affected device which never contacts the box continues to render until its grace ends and that this is the enforcement bound.

#### Scenario: Lost device stops at grace
- **WHEN** a teacher marks a device lost on day 3 of its 30-day lease
- **THEN** the device, if it never reconnects, renders licensed content for at most 34 more days and the administrator view shows it as unacknowledged until then

### Requirement: Lease requests need an authenticated device and an entitled learner
The box SHALL issue a lease only to a device that has proven possession of an admitted, unrevoked device key, for a learner reference that is enrolled in a class holding an active licence or that holds an allocated seat.

#### Scenario: Unadmitted device on the LAN
- **WHEN** an unknown device on the school network requests a lease
- **THEN** the box refuses and offers only the admission flow
