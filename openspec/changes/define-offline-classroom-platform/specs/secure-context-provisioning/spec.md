## Purpose

Secure-context provisioning gives every box a publicly trusted HTTPS identity on a private network so that service workers and Web Crypto work on student devices, without ever asking a teacher to install a certificate authority.

## ADDED Requirements

### Requirement: Per-box hostname in a project-run zone
Each box SHALL be assigned a hostname of the form `<box-id>.<project-zone>` at install, registered with the project registry using the site key. The box SHALL report its LAN address or addresses to the registry, which SHALL publish them as address records, and SHALL update the registration when its address changes. The box identifier SHALL be random and SHALL carry no school-identifying information.

#### Scenario: Box address changes
- **WHEN** the box receives a new LAN address from the school's DHCP server
- **THEN** it updates the registry within a bounded time and, until propagation, continues to answer on the old address where possible

### Requirement: Publicly trusted certificate via ACME DNS-01
The box SHALL generate its own TLS private key and obtain a certificate for its hostname from a publicly trusted certificate authority using ACME with the DNS-01 challenge, answered through the registry. The private key SHALL never leave the box. The system SHALL NOT ship, install, or require a local certificate authority root on any device.

#### Scenario: First certificate at install
- **WHEN** a box completes install with internet connectivity
- **THEN** it holds a publicly trusted certificate for its hostname and a student device on the LAN opens the URL with no warning and can register a service worker

### Requirement: Renewal cadence that survives shrinking lifetimes
The box SHALL attempt renewal whenever one third of the certificate's lifetime remains and SHALL retry daily on failure. The design SHALL assume certificate lifetimes will fall to 47 days and SHALL treat the resulting need for internet contact roughly every two to four weeks as the platform's real connectivity requirement. The box SHALL warn administrators and teachers at 30, 14, and 7 days before expiry through the platform interface and on the box status page, with instructions for renewing through a temporary connection such as a phone hotspot.

#### Scenario: Short-lived certificate in 2029
- **WHEN** the certificate authority issues 47-day certificates
- **THEN** the box attempts renewal at day 31 and the platform's stated connectivity requirement is met by a few minutes of internet every two to three weeks

#### Scenario: Warning shown ahead of expiry
- **WHEN** renewal has failed for two weeks and 14 days of validity remain
- **THEN** teachers see a warning in the platform and the box status page explains how to connect the box temporarily

### Requirement: Issuance not throttled by shared-zone rate limits
The project zone SHALL be provisioned so that per-box certificate issuance is not limited by the certificate authority's per-registered-domain rate limits, by listing the zone on the Public Suffix List, by a rate-limit arrangement with the authority, or by using multiple authorities.

#### Scenario: Many boxes installed in one week
- **WHEN** two hundred boxes are installed in the same week
- **THEN** every box obtains a certificate without being refused for exceeding a shared rate limit

### Requirement: Two network modes and offline name resolution
The box SHALL support a **box-as-network** mode, in which it provides the classroom Wi-Fi network, DHCP, and DNS and answers its own hostname locally, and a **join-existing-LAN** mode, in which it relies on the school's resolver. In box-as-network mode, LAN sync SHALL continue with no upstream connectivity. In join-existing-LAN mode, the box SHALL detect when devices cannot resolve its hostname and SHALL report it, and the platform SHALL state that LAN sync during an upstream outage depends on the school's resolver continuing to answer.

#### Scenario: Internet outage in box-as-network mode
- **WHEN** the school's internet connection fails for a day
- **THEN** devices on the box's network still resolve its hostname, sync continues, and only cross-site and store functions are unavailable

#### Scenario: Internet outage in join-existing-LAN mode
- **WHEN** the school's internet connection fails and its resolver stops answering after its cache expires
- **THEN** installed devices keep working locally, sync pauses, and the box status page reports that its hostname is not resolving on the LAN

### Requirement: Installer network checks
The installer SHALL test, and report in plain language, whether the school network's DNS rebinding protection blocks the box hostname resolving to a private address, whether the resolver answers the hostname when upstream is unreachable, and whether devices can reach the box on its address. When rebinding protection blocks resolution, the installer SHALL provide the exception the network administrator must add or recommend box-as-network mode.

#### Scenario: Rebinding protection detected
- **WHEN** the school router refuses to return a private address for a public hostname
- **THEN** the installer reports it, names the setting to change with the hostname to allow, and offers box-as-network mode as the alternative

### Requirement: Behaviour after certificate expiry
When the certificate has expired, devices that already installed the application SHALL still open it from the service worker cache and work locally, sync SHALL pause, new devices SHALL NOT be admitted, and the platform SHALL show the reason. Renewal SHALL restore full operation without reinstalling anything on any device.

#### Scenario: Expired certificate during a long outage
- **WHEN** the box has been unable to renew and the certificate has expired
- **THEN** students' installed applications open and edit local work, show that sync is paused for a certificate renewal, and resume automatically after the box renews

### Requirement: No mixed content and no plaintext fallback
All device connections to the box SHALL use TLS under the box's hostname. The platform SHALL NOT fall back to plaintext connections from a secure page, and SHALL NOT use raw address URLs for the application.

#### Scenario: Address-literal URL
- **WHEN** a student opens the box by its raw address rather than its hostname
- **THEN** the box serves only a page that redirects to the hostname and explains why

### Requirement: Registry receives no learner data
The registry SHALL receive only the box identifier, the site public key, LAN addresses, and ACME challenge data. It SHALL NOT receive school names, user data, documents, or usage data.

#### Scenario: Registry data inventory
- **WHEN** the registry's stored data for a box is inspected
- **THEN** it contains the box identifier, site public key, addresses, and challenge records and nothing else
