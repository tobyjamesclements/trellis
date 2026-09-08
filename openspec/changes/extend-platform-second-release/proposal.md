## Why

The first release of Trellis (`define-offline-classroom-platform`) deliberately leaves out capabilities that matter once schools are running it: sharing open material between schools, importing rosters from school management systems, a hosted variant for schools that would rather subscribe than own a box, and identity and device conveniences for managed fleets. Specifying them now, against the first release, means the first release's data structures leave room for them and nobody has to guess later what "the commons" or "hosted" was meant to be.

## What Changes

This change adds second-release capabilities on top of the first release. It depends on `define-offline-classroom-platform` and should be archived after it.

- **Forking and the commons**: forks as separate documents that preserve history, signed provenance events, intentional merge, diff across forks, tamper-evident lineage, licence inheritance, attribution handles, and a commons registry of signed, content-addressed releases that schools publish to and pull from, mirrorable on removable media. No live sync between sites is introduced.
- **Structured interchange**: QTI and Common Cartridge export of open content, Common Cartridge import, and declared lossiness.
- **Roster import**: OneRoster-modelled import from management-system exports, reconciled with the directory the first release builds from class joins.
- **Passkey-backed staff identity**: a teacher's or administrator's identity recoverable on a new device through a passkey.
- **Wrapped client for managed iPads**: the same web client in a native shell distributed through Apple School Manager, for fleets where WebKit's transport stance and iPadOS storage limits bite.
- **Project-run public origin for the shell**, with the local-network permission handling it needs, so a school whose box cannot obtain a certificate can still onboard devices that have internet access.
- **Hosted site**: the same platform binary run per school by the company at a public hostname, one or the other with a local box, with the company as data processor, regional hosting, relocation between hosted and local through the recovery bundle, and an honest statement that collaboration in a hosted school needs the school's internet during lessons.

## Capabilities

### New Capabilities

- `content-interchange`: Export of open-tier content as QTI, Common Cartridge, and native bundles; Common Cartridge import; refusal to export licensed material; declared lossiness; and publishing and pulling releases through the commons registry.
- `hosted-site`: The hosted variant: the same binary per school at a public hostname, ordinary certificates and transports, the company as processor, regional hosting, relocation to and from a local box, subscription lapse, and the honest limitation during outages.

### Modified Capabilities

- `open-content-documents`: adds forks that preserve history, signed provenance events, intentional merge, diff across forks, tamper-evident lineage, licence inheritance, and attribution handles.
- `roster-and-enrolment`: adds OneRoster-modelled import and reconciliation with self-registered learners.
- `device-identity`: adds passkey-backed staff identity.
- `distribution`: adds the wrapped client for managed tablets.
- `secure-context-provisioning`: adds the project-run public origin as a second shell source.
- `document-sync`: adds local-network permission handling for shells loaded from the public origin, and states that cross-site sharing happens only through releases.

## Impact

- **Codebase**: additions to the same monorepo; a native wrapper project for iPadOS; hosted deployment tooling (one container per school).
- **Project-run services**: the commons registry, the public shell origin, and hosted infrastructure in regions chosen per country. The commons registry and the public origin receive no learner data; hosted infrastructure holds a school's data under a processor agreement.
- **External systems**: management-system exports for roster import; Apple School Manager and device management for the wrapped client and the site authority.
- **Operational and legal**: processor agreements and regional hosting for the hosted variant; governance and takedown handling for the commons; notarisation for the wrapped client.
- **Sequencing**: archive `define-offline-classroom-platform` first; the deltas here add requirements to capabilities it creates.
