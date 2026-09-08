## Purpose

Device leases let licensed packs go home on student devices the way textbooks do: a loan that renews whenever the device meets the box, goes overdue, and recalls itself, with the classroom box as the licence anchor and an honest limit on what expiry can enforce.

## ADDED Requirements

### Requirement: Lease content and binding
A lease SHALL be a document signed by the site key, bound to one device key and one learner reference, listing the licensed packs currently added to any class the learner is enrolled in, carrying for each pack the per-pack site key wrapped to the device key, and stating an issued-at time, an expiry time, and a grace-until time. A shared or loaned device SHALL hold one lease per learner who has a session on it. No allocation, count, or approval SHALL precede issuance.

#### Scenario: Lease follows class content
- **WHEN** a learner's two classes have packs A and B added and the site also holds licensed pack C that no class of theirs uses
- **THEN** the lease issued to that learner's device wraps keys for A and B only

#### Scenario: Pack added to a class mid-term
- **WHEN** a teacher adds pack C to a class
- **THEN** each member's lease gains C at the device's next contact with the box

### Requirement: Loans in the interface
The interface SHALL present leases to teachers and students as loans: a pack is borrowed when the device holds a lease for it, overdue during grace, and returned when the lease ends or the device is checked in. No count of available copies SHALL ever be shown, because none exists.

#### Scenario: Student sees their loans
- **WHEN** a student opens their device at home
- **THEN** each licensed pack shows as borrowed with the date it must next meet the box, and open and site-tier content shows no such state

### Requirement: Default duration, renewal, and caps
The default lease duration SHALL be 30 days, sliding: every authenticated contact between the device and the box SHALL renew the lease to a fresh 30 days from the time of contact. For dated licences the expiry SHALL never exceed the licence's end. A publisher MAY lower the maximum lease duration and grace in the token, and a site administrator MAY lower them further for the site; neither MAY raise them above the platform default.

#### Scenario: Daily renewal at school
- **WHEN** a device connects to the box on Monday
- **THEN** its lease expiry moves to 30 days from Monday, and on Tuesday it moves to 30 days from Tuesday

#### Scenario: Publisher cap applied
- **WHEN** a token sets a maximum lease duration of 14 days
- **THEN** leases for that pack are issued for 14 days while other packs on the same device keep 30

### Requirement: Grace and recall
The default grace period SHALL be 7 days after expiry. During grace, the device SHALL continue to render licensed content and SHALL show a persistent notice that the loan is overdue and the device must meet the box. After grace, the pack SHALL be recalled: the device SHALL stop rendering it, SHALL discard the wrapped keys, and SHALL retain pack titles and the learner's own work so nothing the learner created is lost. A recalled pack SHALL be borrowed again automatically at the next contact if the learner is still enrolled.

#### Scenario: Device away over a two-week break
- **WHEN** a device last contacted the box 16 days before the end of a two-week break
- **THEN** it renders licensed homework throughout the break with 14 days of lease remaining on return

#### Scenario: Device never returns
- **WHEN** a device passes 37 days without contacting the box
- **THEN** licensed content no longer renders on it, its open-tier and site-tier content and its own submissions remain fully usable, and reconnecting to the box later restores the loans

### Requirement: Open and site-tier content is never leased
The system SHALL never require a lease for open-tier or site-tier documents and bundles, including teacher-imported files and collaborations, and such content SHALL never expire on a device.

#### Scenario: Recall does not affect class documents
- **WHEN** a device's leases have all been recalled
- **THEN** every document, imported file, and collaboration the device holds continues to open and edit normally

### Requirement: Clock-rollback guard
The device SHALL maintain a high-water mark of the latest time it has observed from its own clock and from the box at each contact. If the device clock reads more than one hour earlier than the high-water mark, the device SHALL suspend rendering of licensed content until its next contact with the box. The system SHALL record that this guard is deterrence: clearing the device's site data removes the mark but also removes the lease and keys.

#### Scenario: Clock set back to extend a loan
- **WHEN** a student sets the device clock back three weeks after the lease has expired
- **THEN** licensed content does not render because the clock is behind the high-water mark, and other content is unaffected

### Requirement: Leases are not logged, losses are
Lease issuance and renewal SHALL NOT be recorded as log operations; the box SHALL keep a local lease register with the latest expiry per device and learner, and SHALL record a lease-lost event in the site log only when a device has passed grace without contact. The teacher's class overview SHALL show overdue loans from the register.

#### Scenario: Renewals do not touch the log
- **WHEN** thirty devices renew leases every school day for a term
- **THEN** the site log gains no lease operations and the teacher can still see each device's last contact and any overdue loans

### Requirement: Revocation propagation and its bound
When a device is revoked, a learner is retired, a loaned device is checked in, a pack is removed from every class a learner is in, or a licence is revoked or deactivated, the box SHALL refuse further renewals for the affected lease and SHALL instruct the device to discard keys at its next contact. The system SHALL document that an affected device which never contacts the box continues to render until its grace ends and that this is the enforcement bound.

#### Scenario: Lost device stops at grace
- **WHEN** a teacher marks a device lost on day 3 of its 30-day lease
- **THEN** the device, if it never reconnects, renders licensed content for at most 34 more days and the administrator view shows it as unacknowledged until then

### Requirement: Check-in ends the loan on that device
When a loaned device is checked in at the box, every lease held on it SHALL be ended, the wrapped keys destroyed, and the cached site copies retained only if the next borrower's classes use the same packs.

#### Scenario: Laptop returned on Friday
- **WHEN** a loaned laptop is checked in and its borrower's classes and the next borrower's classes share one pack
- **THEN** the previous borrower's leases are ended, that pack's site copy stays cached, and the other packs' copies are deleted

### Requirement: Lease requests need an authenticated device and an enrolled learner
The box SHALL issue a lease only to a device that has proven possession of an admitted, unrevoked device key, for a learner reference enrolled in at least one class at the site.

#### Scenario: Unadmitted device on the LAN
- **WHEN** an unknown device on the school network requests a lease
- **THEN** the box refuses and offers only the class join flow
