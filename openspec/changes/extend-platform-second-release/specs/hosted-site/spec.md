## Purpose

A hosted site is the platform run per school by the company for schools that subscribe instead of owning a box: the same binary, the same data model, an ordinary public hostname, and an honest statement of what it gives up.

## ADDED Requirements

### Requirement: The same platform per school
A hosted site SHALL run the unmodified box binary in one isolated instance per school, with its own site key, directory, stock room, and learner record keys. No instance SHALL serve more than one school, and the company SHALL NOT combine data across instances.

#### Scenario: Two schools, two instances
- **WHEN** two schools subscribe
- **THEN** each has its own instance and site key, and nothing in one is reachable from the other

### Requirement: Reachability and transport
A hosted site SHALL be reachable at a public hostname with a publicly trusted certificate. Devices SHALL connect over WebSocket under HTTPS and SHALL need no LAN transport, landing page, or local-network permission. Class codes, QR joins, leases, loaned-device check-in, and every other first-release flow SHALL work unchanged over the internet.

#### Scenario: Join from a lab PC
- **WHEN** a student at a subscribing school enters the class code on a lab PC with internet access
- **THEN** the join completes against the hosted instance exactly as it would against a box

### Requirement: The limitation is stated
The platform SHALL state, in the product description, the subscription terms, and the status page, that a hosted school's devices work offline individually but that collaboration, chat, and sync during a lesson depend on the school's internet connection. A school SHALL be offered a box or a hosted site, not both.

#### Scenario: Internet fails during a lesson at a hosted school
- **WHEN** the school's connection drops mid-lesson
- **THEN** every device continues working on what it holds, sync and chat pause, and the status page explains that this is the hosted trade-off

### Requirement: The company as processor
For hosted sites the company SHALL act as data processor under the school's applicable law: storage encrypted at rest, staff access limited and logged, hosting in a region chosen per country, no use of school data for any purpose other than running the site, and no analytics or reporting across schools.

#### Scenario: Access to a school's instance
- **WHEN** a company engineer accesses a hosted instance to resolve a fault
- **THEN** the access is logged with the reason and the school can obtain the log

### Requirement: Relocation between hosted and local
A school SHALL be able to move from a hosted site to a box, or from a box to a hosted site, by restoring its recovery bundle onto the destination and re-admitting devices by QR. Licences bound to the site key SHALL remain valid after relocation.

#### Scenario: School buys a box after a year hosted
- **WHEN** the school restores its hosted site's recovery bundle onto a new box
- **THEN** the box presents the same site key, licences verify, and devices join it by QR with their existing names and PINs

### Requirement: Subscription lapse
When a subscription lapses, the hosted site SHALL enter a read-only period during which the school can export a full recovery bundle and its data, after which the instance and its data SHALL be deleted and the deletion recorded.

#### Scenario: Lapse and export
- **WHEN** a school stops paying
- **THEN** it can still export everything for the read-only period, and after it the company holds nothing of the school's
