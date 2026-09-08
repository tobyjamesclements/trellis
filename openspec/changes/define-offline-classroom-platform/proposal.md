## Why

Schools in parts of Latin America and East Africa have patchy internet, often available only at school, and no platform that lets a teacher set up a class in minutes, add purchased textbooks and their own files, and keep the class working when the connection drops or students take loaned laptops home. Publishers have no way to sell into those schools without their content walking out of the door. Local-first CRDT tooling (Automerge, automerge-repo) is mature enough to build this on, if the licensing, identity, and secure-context problems it raises are specified honestly up front.

## What Changes

This change establishes the founding specification for Trellis, scoped to its first release: an offline-first, LAN-local classroom platform built on Automerge, sold to schools, school chains, and governments as a box plus site licences for content packs, with all data local to the box. Nothing exists yet, so there are no modifications or removals. Capabilities deliberately deferred are specified separately in `extend-platform-second-release`.

**The product in one paragraph.** A school buys a box (a Raspberry Pi or a cheap laptop) and site licences for packs, the way it buys a class set of textbooks. A teacher names a class, gets a URL and a code, adds packs from the stock room, their own PDF, EPUB, SCORM, or QTI files, and collaborative documents, and presses start. Students join by code with a name and a PIN on lab PCs or loaned laptops, use the class chat, do homework assigned to the class or to individuals, and take laptops home offline. The teacher sees the next morning what was done. The comparator is Kolibri; the differences are collaborative documents, commercial packs that go home on loan and recall themselves, and a licence model as simple as a stock room.

- **Three document families with distinct merge semantics**: Automerge-native content documents (structural merge), content-addressed bundles (opaque, never merged), and class-state logs (append-only signed operation records folded on read).
- **Content tiers as an enforced boundary**: an open tier for material a teacher declares shareable, a licensed tier for commercial packs that are never mergeable or redistributable, and a site tier for everything else a school makes, including teacher files, class collaborations, learner work, and derivative works from licensed packs.
- **A class with a lifecycle**: name, URL, and code; start as the publish step; content added at any time; chat; homework to the class or to individuals; an overview of who did what.
- **Site licences per box, no counting**: a signed, encrypted, content-addressed pack travels separately from a signed licence token bound to one box and verified offline against a root key embedded at install. Every learner admitted to the box can borrow every licensed pack. Packs are inert without a licence and can be sideloaded by USB. Licences have no end date unless the token carries one.
- **Loans for offline use**: student devices hold a time-boxed lease on the packs assigned to their classes, renewed whenever the device meets the box, going overdue with a grace period and then recalling itself. Open and site-tier content is never leased and never expires.
- **Per-site watermarking and an honest threat model**: the box re-encrypts every pack into a site copy and watermarks images and text at activation; video carries only a visible render-time mark. The design records that offline rendering places keys on untrusted devices and that this is deterrence and traceability, not DRM.
- **Identity without an identity provider**: device keypairs; class codes that live while the class is live; joining by code with self-registration of a name and a PIN; learner sessions on shared lab PCs; check-out and check-in of loaned laptops that wipes the previous borrower; revocation and re-issue for lost devices.
- **Content import for the files teachers have**: PDF and EPUB viewers, SCORM and cmi5 launch, and QTI import into native items, all site tier by default.
- **An item engine**: native items that render and mark themselves offline, results recorded as learning records, teacher override and authoring, formative only.
- **HTTPS for the application shell only, never for class continuity**: the shell is served from the box's own publicly certified hostname; documents and pack bytes travel over LAN transports authenticated by the site key, so a lapsed certificate pauses onboarding and updates but never sync. Box-as-network mode, in which the box is the classroom Wi-Fi, DHCP, and DNS with a captive landing page, is the default.
- **Sync built on automerge-repo, not a new protocol**: symmetric peers in protocol, a star topology through the box in deployment, share policy by tier and role, licensed pack bytes only to leased peers, and no sync with any peer outside the site.
- **Storage that survives the site**: LRU eviction by document ID, compaction by epoch snapshot or squash, key destruction for learner logs, size budgets, persistent storage on devices, and crash-safe writes on hardware that loses power without warning.
- **Standards**: xAPI as the learning-record model with the learner log as the LRS; cmi5 and SCORM launched locally; QTI imported. OneRoster import and QTI and Common Cartridge export are deferred.
- **Data protection by partitioning and key destruction**: per-learner logs and documents, learner-log payloads encrypted under per-learner keys so retirement destroys the key, pseudonymous references instead of embedded PII, display names distributed as replaceable signed snapshots outside the CRDT, and no learner data sent to any project-run service, under whatever data-protection law applies to the school.
- **Localisation**: English and Spanish interfaces at launch, chosen per device, with the content language carried by each pack and document.
- **Recovery**: a dead box is rebuilt from the replicas on class devices; keys come back from a recovery bundle generated at install or by re-issue from the store; learner record keys return from the staff devices that hold them.
- **Distribution**: one self-contained binary with embedded web assets, a flashable Raspberry Pi image with the Pi 5 as reference hardware, a signed Windows build, and pack installation that never requires reinstalling the platform.

**Deferred to `extend-platform-second-release`**: forking, signed lineage, and the commons registry; QTI and Common Cartridge export and Common Cartridge import; OneRoster and MIS import; passkey-backed staff identity; the wrapped client for managed iPads; a project-run public origin for the shell; and the hosted variant for schools that subscribe instead of buying a box.

Departures from the originating brief, and the interview that reshaped the scope, are recorded with rationale in `design.md`.

## Capabilities

### New Capabilities

- `class-lifecycle`: Creating a class with a name, URL, and code; start and stop; adding content at any time; the class chat; homework assigned to the class or to individuals; and the teacher's overview.
- `open-content-documents`: Automerge-native content documents for teacher material and class collaborations: concurrent editing, attachments by reference, origin and author metadata, in-document history, and drafts that stay private until added to a live class.
- `content-tier-boundary`: The open / site / licensed tier model, the immutable tier tag on every document and bundle, the rules that stop licensed material entering open documents, and what a teacher may derive from a licensed pack versus what stays with the publisher.
- `content-import`: Adding a teacher's own PDF, EPUB, SCORM, cmi5, and QTI files to a class so they render and run offline, site tier by default.
- `item-assessment`: The native item model, the offline item player, auto-marking with results as learning records, teacher override and authoring, and the formative-only boundary.
- `licensed-packs`: The signed, encrypted, versioned, content-addressed pack bundle; installation, sideloading, resumable transfer, inertness without a licence, the re-encrypted site copy with per-site watermarking, and cmi5 and SCORM package wrapping.
- `licensing`: Site licence tokens bound to one box with no counting, the root-to-publisher key chain and offline verification, delivery online or by file and QR, the stock room, and licence events as auditable operations.
- `device-leases`: Loans that let licensed packs render offline on a device: issuance, sliding renewal, overdue grace and recall, caps, the clock-rollback guard, and the guarantee that open and site-tier content is never leased.
- `class-state-log`: The signed operation record, the keyed append-only set, encrypted payloads for learner logs, schema versioning and unknown-op skipping, the fold, authorisation by role, and concurrency semantics per operation family including chat and homework.
- `device-identity`: Per-device keypairs, class codes and the QR that carries the box's trust parameters, joining by code with self-registration, roles, learner sessions on shared devices, check-out and check-in of loaned devices, and revocation and re-issue.
- `document-sync`: Synchronisation over automerge-repo, LAN transports authenticated by the site key, share policy by tier and role, the star topology, licensed pack bytes only to leased peers, and no sync outside the site.
- `storage-lifecycle`: In-memory LRU eviction, compaction and key destruction per document family, size budgets, persistent storage on devices, and durability under abrupt power loss.
- `learning-records`: xAPI statements as signed operations with pseudonymous actors, deduplication and voiding, LRS-style queries, cmi5 launch, and the SCORM runtime API shim.
- `roster-and-enrolment`: A learner directory built from class joins, opaque learner references in the CRDT layer, display-name snapshots distributed outside the CRDT, and enrolment operations.
- `secure-context-provisioning`: HTTPS delivery of the shell from a per-box hostname with a publicly trusted certificate, ACME DNS-01 and renewal cadence, the optional name-constrained site authority for managed fleets, box-as-network mode with a captive landing page, installer checks, and behaviour after certificate expiry.
- `platform-time`: Logical ordering for operations, the box's time-source hierarchy, and the explicit non-reliance on authoritative wall-clock time.
- `data-protection`: Per-learner partitioning, per-learner record keys and key destruction, drop signals for plaintext replicas, subject access export, PII minimisation, and no learner data to project-run services.
- `localisation`: English and Spanish interfaces at launch, language per device, content language per pack and document, and locale formatting.
- `site-recovery`: The install-time recovery bundle, rebuilding a box from device replicas, box key succession, and recovery of packs, licences, pack keys, and learner record keys.
- `distribution`: The single self-contained binary, the Raspberry Pi image with the Pi 5 as reference hardware, the signed Windows build, pack installation without platform reinstall, and platform updates.

### Modified Capabilities

None. This is the first change in the project; there are no existing specifications.

## Impact

- **Codebase**: Greenfield. A TypeScript monorepo is expected (PWA client, box server, shared DSL and fold, transport adapters), with Automerge (WASM core) and automerge-repo as the sync foundation. Rust remains an option for the box runtime later; Java is excluded because automerge-java is core-only with no repo layer.
- **Project-run services**: a DNS zone and ACME challenge service for per-box certificates, and a signing root for publisher keys. Neither is on the path of day-to-day classroom operation and neither receives learner data. The commons registry, public shell origin, and hosted infrastructure belong to the second release.
- **External systems**: an external store issues signed licence tokens (payment internals out of scope); publishers produce packs with a documented tooling contract, tagged by language.
- **Operational and legal**: code-signing accounts, Public Suffix List listing or a CA rate-limit arrangement for the box hostname zone, publisher agreements that define derivative-work rights and accept a per-box site licence with no device counting, and a data-protection impact template that schools adapt to their country's law.
- **Explicitly out of scope**: summative or regulated assessment, capability-based authorisation and revocation under eventual consistency, federated identity, anything requiring authoritative wall-clock time such as deadline enforcement, payment processing internals, and any central collection of learner data for chains, governments, or funders.
