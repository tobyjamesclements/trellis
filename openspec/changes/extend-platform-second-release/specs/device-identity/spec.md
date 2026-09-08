## ADDED Requirements

### Requirement: Passkey-backed staff identity
An administrator or teacher device MAY register a passkey with the site, recorded as a site-log operation carrying the passkey's public key. A replacement device that presents a valid assertion for a registered passkey SHALL be admitted with the same role and staff reference without a code, and the box SHALL offer to revoke the previous device key. Passkeys SHALL NOT be used for student identity.

#### Scenario: Teacher replaces a lost laptop
- **WHEN** a teacher signs in on a new laptop with the passkey synced by their platform account
- **THEN** the box admits the new device key with the teacher role and offers to revoke the lost device
