## Purpose

Platform time defines what the system does and does not rely on clocks for: logical ordering for records, a defensible time source on boxes without a battery-backed clock, and no enforcement that requires authoritative wall-clock time.

## ADDED Requirements

### Requirement: Logical ordering, not wall-clock ordering
Ordering and conflict resolution of log operations SHALL depend only on Lamport clocks, signer identity, and sequence numbers. Wall-clock timestamps in records SHALL be informational and SHALL NOT affect folded state.

#### Scenario: Device with a wrong clock
- **WHEN** a device whose clock is a year behind appends operations
- **THEN** its operations are ordered by their Lamport clocks and the folded state is the same as if its clock were correct

### Requirement: Box time-source hierarchy
The box SHALL take time from, in order of preference: network time when upstream connectivity exists; a hardware real-time clock when present; time attested by an administrator or teacher device at boot when neither is available; and otherwise the last persisted time. The box SHALL persist its time at least every minute and SHALL never adopt a time earlier than its last persisted time. The box SHALL display its time source and confidence on the status page.

#### Scenario: Pi without a real-time clock boots offline
- **WHEN** a box without a hardware clock boots with no upstream connectivity
- **THEN** it resumes from its last persisted time, adopts the first administrator or teacher device's attested time if later, and shows "time attested by device" on the status page

### Requirement: No authoritative-time enforcement
The platform SHALL treat due dates as advisory labels. It SHALL record each submission with the submitting device's time and the box's stored time, SHALL never reject or penalise work automatically for lateness, and SHALL present lateness to teachers as information derived from both times.

#### Scenario: Late submission is accepted
- **WHEN** a learner submits after an assignment's due date
- **THEN** the submission is accepted and shown to the teacher with both timestamps and a late indicator, with no automatic consequence

### Requirement: Time-dependent licence checks are local and bounded
Licence validity and lease expiry SHALL be judged by each verifier against its own clock with the clock-rollback guard, and the platform SHALL document that this is deterrence bounded by lease grace, not enforcement against a manipulated clock.

#### Scenario: Box clock far behind
- **WHEN** the box's clock is wrong by months because it booted with no time source
- **THEN** leases it issues carry expiry times derived from that clock, devices judge them against their own clocks, and the status page flags the low-confidence time source for the administrator to correct
