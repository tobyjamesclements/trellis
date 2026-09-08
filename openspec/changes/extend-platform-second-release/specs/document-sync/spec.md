## ADDED Requirements

### Requirement: Local network permission
When the shell was loaded from a public origin, the client SHALL request the browser's local-network permission at a deliberate moment during the join, SHALL explain why it is needed, and SHALL explain what will not work if it is refused. Shells loaded from the box's own hostname SHALL not need the permission because the document is already in the local address space.

#### Scenario: Chrome prompts once
- **WHEN** a student who installed from the public origin first connects to the box
- **THEN** the browser shows its local-network prompt once, the application explains it beforehand, and after approval the device syncs without further prompts

#### Scenario: Permission refused
- **WHEN** a student refuses the prompt
- **THEN** the application explains that work stays on the device until the permission is granted, and shows how to grant it

### Requirement: Cross-site sharing only through releases
Cross-site sharing of open-tier content SHALL happen only by publishing and pulling releases through the commons registry. The box SHALL still establish no document sync with any peer outside the site.

#### Scenario: Registry is not a sync peer
- **WHEN** the box publishes a release
- **THEN** it performs a single upload by content address and opens no sync session with the registry
