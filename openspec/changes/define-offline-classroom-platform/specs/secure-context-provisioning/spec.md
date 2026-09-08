## Purpose

Secure-context provisioning delivers the application shell over HTTPS so that service workers and Web Crypto are available on student devices, without ever asking a teacher to install a certificate authority by hand, and without making day-to-day classroom operation depend on the web PKI.

## ADDED Requirements

### Requirement: HTTPS is required for the shell only
The application shell (markup, scripts, service worker, and static assets) SHALL be delivered over HTTPS from a secure context. Document sync and pack transfer SHALL NOT depend on the shell's certificate or hostname; they SHALL use the LAN transports specified by document sync, authenticated by the site key. A lapsed or missing shell certificate SHALL pause onboarding of new devices and shell updates from that source, and nothing else.

#### Scenario: Expired certificate, class continues
- **WHEN** the box's certificate has expired and thirty admitted devices arrive for a lesson
- **THEN** every device opens the installed application from its service worker cache, syncs with the box over a site-key-authenticated LAN transport, and only a device that has never been admitted is unable to join

### Requirement: Two shell sources
The shell SHALL be loadable from the box's own hostname under a publicly trusted certificate, and from a project-run public origin. Both sources SHALL serve identical application versions, verified by the box against the signed platform release. A device SHALL partition its stored data by site identifier so that a shell from the public origin can serve more than one site, and SHALL record which source it was installed from so updates come from the same place.

#### Scenario: Install from the public origin
- **WHEN** a school's devices have internet access but its box has never been able to obtain a certificate
- **THEN** students install the shell from the public origin, are admitted by QR, and sync with the box over the LAN transport

#### Scenario: Install from the box
- **WHEN** a school's LAN has no route to the internet for devices but the box holds a valid certificate
- **THEN** students install the shell from the box's hostname with no warning and no internet access on their devices

### Requirement: Per-box hostname in a project-run zone
Each box SHALL be assigned a hostname of the form `<box-id>.<project-zone>` at install, registered with the project registry using the site key. The box SHALL report its LAN address or addresses to the registry, which SHALL publish them as address records, and SHALL update the registration when its address changes. The box identifier SHALL be random and SHALL carry no school-identifying information.

#### Scenario: Box address changes
- **WHEN** the box receives a new LAN address from the school's DHCP server
- **THEN** it updates the registry within a bounded time and, until propagation, continues to answer on the old address where possible

### Requirement: Publicly trusted certificate via ACME DNS-01
The box SHALL generate its own TLS private key and obtain a certificate for its hostname from a publicly trusted certificate authority using ACME with the DNS-01 challenge, answered through the registry. The private key SHALL never leave the box. The system SHALL NOT ship a certificate authority root for manual installation on any device and SHALL NOT require one for any function.

#### Scenario: First certificate at install
- **WHEN** a box completes install with internet connectivity
- **THEN** it holds a publicly trusted certificate for its hostname and a student device on the LAN opens the URL with no warning and can register a service worker

### Requirement: Renewal cadence that survives shrinking lifetimes
The box SHALL attempt renewal whenever one third of the certificate's lifetime remains and SHALL retry daily on failure. The design SHALL assume certificate lifetimes will fall to 47 days. The box SHALL warn administrators and teachers at 30, 14, and 7 days before expiry through the platform interface and on the box status page, stating that expiry affects onboarding and updates only, with instructions for renewing through a temporary connection such as a phone hotspot.

#### Scenario: Short-lived certificate in 2029
- **WHEN** the certificate authority issues 47-day certificates
- **THEN** the box attempts renewal at day 31, and a school that cannot renew for a term keeps syncing while new devices wait for the next renewal or use the public origin

#### Scenario: Warning shown ahead of expiry
- **WHEN** renewal has failed for two weeks and 14 days of validity remain
- **THEN** teachers see a warning that explains what will and will not stop, and the box status page explains how to connect the box temporarily

### Requirement: Issuance not throttled by shared-zone rate limits
Where per-box certificates are issued at scale, the project zone SHALL be provisioned so that issuance is not limited by the certificate authority's per-registered-domain rate limits, by listing the zone on the Public Suffix List, by a rate-limit arrangement with the authority, or by using multiple authorities.

#### Scenario: Many boxes installed in one week
- **WHEN** two hundred boxes are installed in the same week
- **THEN** every box obtains a certificate without being refused for exceeding a shared rate limit

### Requirement: Site certificate authority for managed fleets
A box MAY generate a site certificate authority whose certificate carries name constraints limiting it to the box's own hostname, and MAY issue its shell certificate from it. The site authority SHALL be distributed to devices only through mobile device management or an equivalent fleet tool; the platform SHALL never instruct a person to install it by hand and SHALL never require it. A site using its own authority SHALL need no internet access for certificates.

#### Scenario: MDM fleet with no connectivity
- **WHEN** a school pushes the box's name-constrained authority to its managed devices and the box has no internet for a term
- **THEN** devices install and update the shell from the box's hostname with no warning throughout, and the authority cannot be used to certify any other name

### Requirement: Two network modes and offline name resolution
The box SHALL support a **box-as-network** mode, in which it provides the classroom Wi-Fi network, DHCP, and DNS and answers its own hostname locally, and a **join-existing-LAN** mode, in which it relies on the school's resolver. Name resolution SHALL be needed only to load or update the shell from the box's hostname; the LAN transports SHALL reach the box by address. In join-existing-LAN mode the box SHALL detect when devices cannot resolve its hostname and SHALL report it.

#### Scenario: Internet outage in box-as-network mode
- **WHEN** the school's internet connection fails for a day
- **THEN** devices on the box's network still resolve its hostname, shell updates and onboarding continue, and only cross-site and store functions are unavailable

#### Scenario: Internet outage in join-existing-LAN mode
- **WHEN** the school's internet connection fails and its resolver stops answering after its cache expires
- **THEN** installed devices keep syncing with the box by address, new devices can join only by QR, and the box status page reports that its hostname is not resolving on the LAN

### Requirement: Installer network checks
The installer SHALL test, and report in plain language, whether the school network's DNS rebinding protection blocks the box hostname resolving to a private address, whether the resolver answers the hostname when upstream is unreachable, whether devices can reach the box on its address, and which LAN transports the school's common browsers support. When rebinding protection blocks resolution, the installer SHALL provide the exception the network administrator must add or recommend box-as-network mode.

#### Scenario: Rebinding protection detected
- **WHEN** the school router refuses to return a private address for a public hostname
- **THEN** the installer reports it, names the setting to change with the hostname to allow, notes that sync is unaffected, and offers box-as-network mode as the alternative

### Requirement: Behaviour after certificate expiry
When the shell certificate has expired, devices that already installed the application SHALL open it from the service worker cache and SHALL continue to sync over the LAN transports, shell updates from the box SHALL pause, new devices SHALL be able to join only from the public origin or by a QR that carries the transport parameters, and the platform SHALL show the reason. Renewal SHALL restore full operation without reinstalling anything on any device.

#### Scenario: Expired certificate during a long outage
- **WHEN** the box has been unable to renew and the certificate has expired
- **THEN** students' installed applications open, sync, and show that updates are paused for a certificate renewal, and updates resume automatically after the box renews

### Requirement: No plaintext shell and no mixed content
The shell SHALL never be served over plaintext, the platform SHALL NOT fall back to plaintext connections from a secure page, and the LAN transports SHALL each carry their own encryption. A raw-address URL for the shell SHALL serve only a page that redirects to the hostname and explains why.

#### Scenario: Address-literal URL
- **WHEN** a student opens the box by its raw address rather than its hostname
- **THEN** the box serves only a page that redirects to the hostname and explains why

### Requirement: Registry and public origin receive no learner data
The registry SHALL receive only the box identifier, the site public key, LAN addresses, and ACME challenge data. The public origin SHALL receive only shell requests with no site or learner identifiers. Neither SHALL receive school names, user data, documents, or usage data.

#### Scenario: Registry data inventory
- **WHEN** the registry's stored data for a box is inspected
- **THEN** it contains the box identifier, site public key, addresses, and challenge records and nothing else
