## ADDED Requirements

### Requirement: Project-run public origin for the shell
The shell SHALL additionally be loadable from a project-run public origin serving the same signed release as the box. A device installed from it SHALL record its source so updates come from the same place, and SHALL keep its stored data partitioned by site identifier. The public origin SHALL receive only shell requests with no site or learner identifiers.

#### Scenario: Install from the public origin
- **WHEN** a school's devices have internet access at school but its box has not been able to obtain a certificate
- **THEN** students install the shell from the public origin, join by QR, and sync with the box over a LAN transport

#### Scenario: Public origin data inventory
- **WHEN** the public origin's logs for a school's devices are inspected
- **THEN** they contain shell requests and nothing that identifies the site or a learner
