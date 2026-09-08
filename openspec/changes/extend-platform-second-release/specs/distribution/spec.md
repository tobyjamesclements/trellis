## ADDED Requirements

### Requirement: Wrapped client for managed tablets
The platform SHALL provide a native wrapper around the same web client for iPadOS, distributed through Apple School Manager and mobile device management, for fleets where the browser client's storage or transport limits are unacceptable. The wrapper SHALL pin the site key, SHALL use the same LAN transports or a TLS connection whose trust is the site key, and SHALL have no features the browser client lacks.

#### Scenario: iPad fleet deployed by MDM
- **WHEN** a school pushes the wrapped client to its managed iPads
- **THEN** each iPad joins the site by the same join flow and syncs over the LAN with no certificate authority installed
