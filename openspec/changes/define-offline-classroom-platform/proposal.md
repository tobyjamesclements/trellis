## Why

Schools with unreliable or absent connectivity have no classroom platform that keeps a class working through an outage, lets students carry work home with no signal, and still gives publishers a way to sell content into the same install without that content leaking into the open commons. Local-first CRDT tooling (Automerge, automerge-repo) is now mature enough to build this on, and the licensing, identity, and secure-context problems it raises are tractable but only if they are specified honestly up front rather than discovered in implementation.

## What Changes

This change establishes the founding specification for Trellis: an offline-first, LAN-local classroom platform built on Automerge, plus the content marketplace model it must support. It introduces every capability of the system; nothing exists yet, so there are no modifications or removals.

- **Three document families with distinct merge semantics**: Automerge-native content documents (structural merge, forkable), content-addressed bundles (opaque, never merged), and class-state logs (append-only signed operation records folded on read).
- **Content tiers as a first-class, enforced boundary**: an open tier (forkable, diffable, shareable, with lineage that survives forking), a licensed tier (commercial packs that are never forkable, mergeable, or redistributable), and a site tier for teacher-created derivative works that reference or embed licensed material and therefore stay within the licensed site.
- **Offline-verifiable licensing**: signed, encrypted, content-addressed packs that travel separately from signed licence tokens bound to a site, seat or cohort count, and validity window, verified against a root key embedded at install. Packs are inert without a licence and can be sideloaded by USB.
- **Device leases for offline rendering**: the classroom box is the licence anchor; student devices hold a time-boxed, renewable lease with a defined grace period. Open-tier content is never leased and never expires.
- **Per-site watermarking and an honest threat model**: leaked licensed content is traceable to a site; the design records that offline rendering places keys on untrusted devices and that this is deterrence and traceability, not DRM.
- **Auditable licence state**: activation, seat allocation, expiry, and revocation are signed operations in the class-state log.
- **Identity without an identity provider**: device keypairs admitted by code or QR, roles carried in the class-state log, a re-issue path for lost devices, and learner sessions on shared class-set devices.
- **Secure context on a LAN without a local CA root**: a project-run DNS zone gives each box a public hostname resolving to its LAN address with a publicly trusted certificate obtained via ACME DNS-01. This is the highest-risk requirement and its failure modes are specified explicitly.
- **Sync built on automerge-repo, not a new protocol**: symmetric peers in protocol, a star topology through the box in deployment, share policy by tier and role, licensed pack bytes relayed only to leased peers, and an optional open-only commons relay between schools.
- **Storage lifecycle**: LRU eviction by document ID, compaction by epoch snapshot or squash, per-document size budgets, and persistent-storage requests on devices.
- **Standards**: xAPI as the primary learning-record model with the per-learner state doc acting as the LRS; SCORM via a local JavaScript API shim; OneRoster for enrolment and MIS import; QTI and Common Cartridge as import/export only, with licence-gated export.
- **Data protection by partitioning**: per-learner documents that the box can stop replicating and drop, pseudonymous references instead of embedded PII, roster data distributed as replaceable signed snapshots outside the CRDT, and no learner PII ever sent to project-run services.
- **Recovery**: a dead box is rebuilt from the replicas held on class devices; the box key, licences, and pack keys are recovered from a recovery bundle generated at install or by re-issue from the store.
- **Distribution**: one self-contained binary with embedded web assets, a flashable Raspberry Pi image, signed Windows and notarised macOS installers, and pack installation that never requires reinstalling the platform.

Departures from the originating brief (for example the erosion of the 90-day certificate renewal assumption, DNS behaviour during upstream outages, shared class-set devices, and the split of the class-wide state log into per-learner documents) are recorded with rationale in `design.md`.

## Capabilities

### New Capabilities

- `open-content-documents`: Automerge-native open-tier content documents: creation, forking as separate documents, intentional merge, diff, and lineage, attribution, and licence metadata that survives forking.
- `content-tier-boundary`: The open / site / licensed tier model, the immutable tier tag on every document and bundle, the rules that stop licensed material entering open documents, and what a teacher may derive from a licensed pack versus what stays with the publisher.
- `licensed-packs`: The signed, encrypted, versioned, content-addressed pack bundle; installation, sideloading, inertness without a licence, the site copy with per-site watermarking, and SCORM package wrapping.
- `licensing`: Licence tokens, the root-to-publisher key chain and offline verification, binding to a site and to seat or cohort counts and validity windows, token delivery online or by file/QR, seat allocation and release, revocation, and licence events as auditable operations.
- `device-leases`: Time-boxed leases that permit offline rendering of licensed packs on a device, their issuance, renewal, expiry, grace behaviour, caps, clock-rollback guard, and the guarantee that open-tier content is never leased.
- `class-state-log`: The signed operation record, the keyed append-only set, schema versioning and unknown-op skipping, the fold that derives state on read, authorisation of operations by role, and explicit concurrency semantics per operation family.
- `device-identity`: Per-device keypairs, admission by code or QR, roles, revocation and re-issue for lost devices, learner sessions on shared devices, and device identity as the anchor for leases and seat accounting.
- `document-sync`: Synchronisation over automerge-repo, share policy by tier and role, the star topology through the box, refusal to relay licensed pack bytes to unleased peers, and the open-only commons relay between sites.
- `storage-lifecycle`: In-memory LRU eviction by document ID, compaction and squash policies per document family, document and pack size budgets, and persistent storage on devices.
- `learning-records`: xAPI statements as signed operations with pseudonymous actors, deduplication and voiding, LRS-style queries, and the SCORM runtime API shim that writes to the learner's state document.
- `roster-and-enrolment`: OneRoster-modelled enrolment, MIS import, opaque learner references in the CRDT layer, and roster snapshots distributed outside the CRDT.
- `content-interchange`: Import of QTI and Common Cartridge into the native model, export of open-tier content in QTI, Common Cartridge, and native bundle form, and refusal to export licensed material.
- `secure-context-provisioning`: Per-box hostnames in a project-run DNS zone, publicly trusted certificates via ACME DNS-01, renewal cadence, behaviour during upstream outages and after certificate expiry, installer checks, and the prohibition on shipping a local CA root.
- `platform-time`: Logical ordering for operations, the box's time-source hierarchy on hardware without a reliable clock, and the explicit non-reliance on authoritative wall-clock time.
- `data-protection`: Per-learner document partitioning, drop signals and best-effort deletion at the edge, retention defaults, subject access export, PII minimisation in the CRDT layer, and the guarantee that project-run services receive no learner PII.
- `site-recovery`: The install-time recovery bundle, rebuilding a box from device replicas, box key succession, and recovery of packs, licences, and pack keys.
- `distribution`: The single self-contained binary, the Raspberry Pi image, signed Windows and notarised macOS builds, pack installation without platform reinstall, and platform updates.

### Modified Capabilities

None. This is the first change in the project; there are no existing specifications.

## Impact

- **Codebase**: Greenfield. A TypeScript monorepo is expected (PWA client, box server, shared DSL and fold), with Automerge (WASM core) and automerge-repo as the sync foundation. Rust remains an option for the box runtime later; Java is excluded because automerge-java is core-only with no repo layer.
- **Project-run services**: a DNS zone and ACME challenge service for box hostnames, an optional open-only commons relay, and a signing root for publisher keys. These are the only network dependencies and none of them receive learner data.
- **External systems**: an external store issues signed licence tokens (payment internals out of scope); school MIS exports feed enrolment via OneRoster; publishers produce packs with a documented tooling contract.
- **Operational and legal**: code-signing and notarisation accounts, Public Suffix List listing or a CA rate-limit arrangement for the box hostname zone, publisher agreements that define derivative-work rights, and a DPIA template for schools as data controllers.
- **Explicitly out of scope**: summative or regulated assessment, capability-based authorisation and revocation under eventual consistency, federated identity, anything requiring authoritative wall-clock time such as deadline enforcement, and payment processing internals.
