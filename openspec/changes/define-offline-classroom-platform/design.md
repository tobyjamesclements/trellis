## Context

See `proposal.md` for motivation and the capability list. This document records how the platform fits together, where the originating brief was challenged, the decisions taken with their alternatives, an honest threat model, and the questions that remain open.

Constraints that shape everything below:

- **Automerge and automerge-repo are the sync foundation.** No new sync protocol. automerge-repo has no per-change access control: a document identifier plus a connection is a bearer capability, and the only policy hook is whether to share a document with a peer at all. Transports are pluggable network adapters, which is what makes the transport decisions below possible without touching the protocol.
- **Automerge history is append-only.** Deleting inside a document leaves tombstones; forgetting is only possible by dropping or squashing whole documents, or by destroying the key that protects their contents.
- **Every client is untrusted.** A PWA on a student's device can be modified, its storage read, its clock changed. Nothing in this design assumes a tamper-proof client.
- **The box is a Raspberry Pi or cheap laptop**: limited memory, possibly no battery-backed clock, storage that can die, and a network the school may not control.
- **Secure context is required by the application shell**, for service workers and Web Crypto, and no public CA issues certificates for private addresses. IndexedDB itself does not need HTTPS; the brief's phrasing overstated that. Data transport does not need the web PKI at all, which is the central change from the first draft of this design.
- **Browser facts that bound the transport design** (checked September 2026): WebTransport is Baseline across Chromium, Firefox, and Safari 26.4; WebKit has stated it will not implement the `serverCertificateHashes` option; Chrome's Local Network Access permission gates WebSocket and WebTransport connections from public origins to private addresses since Chrome 147, with WebRTC expected to follow.
- **Out of scope** (from the proposal): summative assessment, capability-based authorisation and revocation under eventual consistency, federated identity, authoritative wall-clock time, payment internals.

### System shape

```
                          internet (intermittent, never on the daily path)
   +-------------+  +---------------+  +-----------------+  +------------------+
   |  registry   |  | public origin |  |  licence store  |  | commons registry |
   |  DNS zone + |  | (app shell,   |  |  (external,     |  | (content-addr.   |
   |  ACME DNS-01|  |  optional)    |  |   signs tokens) |  |  releases, open) |
   +------+------+  +-------+-------+  +--------+--------+  +---------+--------+
          |                 |                   |                     |
   .......|.................|...................|.....................|..........
          |   school LAN or box-provided Wi-Fi  |   publish / pull    |
          v                 v                   v                     v
   +--------------------------------------------------------------------------+
   |  BOX  (always-on peer, stable address, durable storage)                  |
   |  site key | transport identities | pack store | lease register           |
   |  learner record keys | directory (PII) | share policy | fold cache       |
   |  shell over HTTPS (own hostname)                                         |
   +----------+--------------------------+----------------------+------------+
              |  LAN transports pinned to the site key            |
              |  (WebTransport by hash | WebRTC ICE-lite | WSS)   |
      +-------+-------+          +-------+--------+       +-------+---------+
      | teacher dev   |          | student dev    |       | shared / iPad   |
      | admin/teacher |          | one learner    |       | learner PINs,   |
      | roster snap,  |          | leases, docs,  |       | wrapped client  |
      | record keys   |          | own record key |       | via MDM         |
      +---------------+          +----------------+       +-----------------+
                    (star topology: devices talk only to the box)
```

### Document families and tiers

```
                    | open tier          | site tier            | licensed tier
  ------------------+--------------------+----------------------+------------------
  content documents | Automerge, fork-   | Automerge, bound to  | (none: licensed
  (structural merge)| able, published as | site, never exported | material is never
                    | releases           | teacher derivatives, | a document)
                    |                    | learner work         |
  ------------------+--------------------+----------------------+------------------
  bundles           | plaintext media,   | plaintext media for  | signed+encrypted
  (content address, | OER packages       | site docs; learner   | packs; site copy
   never merged)    |                    | bundles under the    | with watermark
                    |                    | learner record key   |
  ------------------+--------------------+----------------------+------------------
  logs              | (none)             | site log, class logs | (licence events
  (signed op set,   |                    | in clear; learner    |  live in the site
   fold on read)    |                    | logs with encrypted  |  log, box-signed)
                    |                    | payloads             |
```

## Where the brief was challenged

Each item states what the brief assumed, why it does not hold, and what the specs do instead.

1. **Lease expiry and validity windows are wall-clock enforcement on an untrusted clock.** The brief excludes anything needing authoritative time, yet expiry is exactly that. Resolution: the specs distinguish *fairness* uses of time (deadlines, excluded) from *deterrence* uses (leases, included), judge every time check against the verifier's own clock, add a clock-rollback guard, and state the enforcement bound explicitly: an offline device renders until lease grace ends, whatever has happened at the box.

2. **"Internet only at install and 90-day renewal" is eroding.** CA/Browser Forum ballot SC-081 caps certificate lifetimes at 200 days from March 2026, 100 days from March 2027, and 47 days from March 2029. With the certificate confined to the shell (item 22), this now bounds how often a school can onboard new devices from the box, not whether class runs.

3. **Public DNS to a private address does not survive an upstream outage and is blocked by rebinding protection.** Once the resolver's cache expires, `pi-7f3a9c.example.org` stops resolving. Many routers (dnsmasq `stop-dns-rebind`, OpenWrt, pfSense, Fritz!Box) refuse public names that resolve to private addresses. The specs add a box-as-network mode as the reliable configuration, keep join-existing-LAN with installer checks, and, with item 22, confine the consequence of a resolution failure to shell loading.

4. **Let's Encrypt rate limits.** Fifty certificates per registered domain per week means the hostname zone cannot scale as a plain subdomain if every box has its own certificate. Public Suffix List listing or a rate-limit arrangement is an operational prerequisite for that path.

5. **Fully disconnected schools cannot be served by any public-CA design.** True, and now largely moot: the pinned transports need no CA, the public origin needs internet on devices once, and a managed fleet can carry a name-constrained site authority (item 23). Only the "no internet anywhere, no MDM, browser-only" corner remains unserved, and the design says so.

6. **"Attachments are the licensed family" is too neat.** Open-tier media and openly licensed packages are also opaque bundles. The families are by *representation* (document, bundle, log) with *tier* orthogonal, and a **site tier** was added for teacher derivatives and learner work.

7. **A single class-wide state log conflicts with per-student deletion.** The log family is split into site, class, and learner logs; learner logs and learner-owned documents are the deletable unit.

8. **"Append-only list" is the wrong Automerge structure.** The log is a map keyed by operation identifier (a grow-only set) with explicit logical ordering fields, and operation bodies are stored as signed canonical bytes, which also makes payload encryption (item 25) a local change.

9. **Device identity is not student identity.** UK primaries run shared class sets. The identity spec adds shared devices with learner sessions, seats per learner, and leases per device and learner.

10. **"Licensed material must not be mergeable into open documents" cannot be enforced against copying.** It is enforced structurally, and the residual is handled by watermark traceability and licence terms. The spec says so rather than claiming prevention.

11. **"Sync must refuse to relay packs outside the site" while packs are sideloadable by USB.** The ciphertext is not secret; the *site copy* is what is controlled, and it goes only to leased peers. Pack bytes never leave the site by any transport.

12. **"Peers are symmetric" plus access control is the excluded problem.** The initial platform is a star through the box; the protocol stays symmetric so mesh can come later.

13. **"Publisher public key embedded at install" needs a level of indirection.** The embedded key is a project root that certifies publisher keys, with a signed key-status list for revocation.

14. **The box is "just a peer" for documents only.** For licensing, identity, PII, certificates, and now transport identity it is a privileged trust anchor. The recovery spec adds an install-time recovery bundle, box succession, and store re-issue.

15. **Raspberry Pi 4 has no real-time clock.** A time-source hierarchy is specified, and the Pi 5 with its clock battery is the reference hardware.

16. **Client-side watermarking is strippable.** The box produces a watermarked, re-encrypted site copy at activation for images and text. Video is not transcoded on a Pi; it carries only the visible render-time mark, and the threat model records that.

17. **Purchase "online" and a box with no connectivity.** Tokens are small; delivery by file, paste, or QR makes the licence path fully offline for the box.

18. **Lease renewals as log operations would flood the log.** Seat allocation is logged; renewals live in a box-side register.

19. **Browser storage on iOS threatens "full replica on every device".** Persistent storage is requested and reported, packs are cached selectively, and managed iPad fleets get a wrapped client (item 26).

20. **xAPI actors are PII by default.** Actors use the account form with the site as home page and the learner reference as name.

21. **OneRoster is the right model but not what UK MIS export.** A generic column mapping is added and connectors are left open.

22. **Using HTTPS as the data transport made the web PKI a daily dependency.** Secure context is needed by the shell, not by the data. Moving documents and pack bytes onto LAN transports authenticated by the site key turns a lapsed certificate from "class stops syncing" into "new devices and shell updates wait". This is the largest change from the first draft and it retires most of the mitigations items 2 to 5 needed.

23. **Rejecting a local CA root was really rejecting manual installation.** Fleets under mobile device management push a certificate profile in one action, and X.509 name constraints confine a leaked site authority to the box's own name. The specs allow a name-constrained site authority for managed fleets, never require it, and never let the platform ask a person to install one.

24. **"Git for the classroom" needs releases, not a live relay.** Teachers publish and pull; they do not need continuous cross-school sync. The commons is a content-addressed registry of signed releases that can be mirrored on removable media, and no live sync with any external peer exists.

25. **Cooperative deletion is weaker than key destruction.** Learner-log payloads and learner bundles are encrypted under per-learner keys; retirement and retention destroy the key, so every ciphertext-only copy dies with it. Automerge text documents cannot be value-encrypted without losing structural merge, so learner content documents remain droppable plaintext documents.

26. **iPads are the exception the PWA story hides.** WebKit will not implement hash-pinned WebTransport, and iPadOS storage limits are the harshest. iPad fleets are almost always managed through Apple School Manager, so a wrapped client distributed that way is the natural fit, with signalling-free WebRTC as the browser path.

## Goals / Non-Goals

**Goals:**
- One fold implementation shared by every peer so state is identical everywhere.
- Every licence, identity, and transport decision verifiable offline against keys the peer already holds.
- Every cross-boundary flow (open to commons, licensed to devices, learner data to teachers) governed by one share policy that is stated, not emergent.
- Every unavoidable weakness written down next to the control that bounds it.

**Non-Goals:**
- Preventing a determined person with a leased device from extracting plaintext. Deterrence and traceability only.
- Byzantine fault tolerance among peers. Tamper-evidence with the box as the recovering replica.
- Live sync between sites. Cross-site sharing is publish and pull.
- Real-time presence or cursors in the initial platform.
- Mesh sync between student devices.
- A general-purpose LMS feature set beyond what the capabilities name.

## Decisions

### D1. TypeScript throughout; the box is a single compiled binary

**Decision**: One TypeScript monorepo: PWA client, box server, a shared package holding the operation DSL, the fold, the share policy, the transport adapters, and the crypto helpers, and a thin native wrapper for iPadOS around the same client. The box binary is produced with a single-file compiler for the runtime (Bun `--compile` or Node single-executable) with web assets embedded.

**Rationale**: The fold and the share policy must be byte-for-byte identical on every peer. automerge-repo's reference implementation is TypeScript and is the one the browser must use anyway. Rust's automerge-repo is younger and would mean two fold implementations.

**Alternatives**: Rust box with the TypeScript client (rejected for the divergence reason, revisit if a Pi cannot keep up); Java (excluded: core-only bindings, no repo layer).

### D2. Star topology in deployment, symmetric protocol, pluggable transports

**Decision**: Devices connect only to the box. The box relays. Devices refuse non-box peers until a site setting enables mesh. Every transport is an automerge-repo network adapter, so the sync protocol is untouched by D12.

**Rationale**: The only access control automerge-repo offers is share policy; enforcing it in one place is tractable. Recovery still works because the new box pulls from devices.

**Alternatives**: Full mesh with per-device share policy (deferred); box-plus-mesh only for open documents (plausible later, since open documents have no entitlement rules beyond site membership).

### D3. Three log instances and a keyed operation set

**Decision**: Site log, class logs, learner logs. Each is an Automerge map from operation UUID to a bytes value containing the canonically encoded, signed record. Ordering is by (Lamport, signer key, sequence). Each signer chains its own records by previous-hash. Learner-log payloads are ciphertext under the learner record key (D14); envelopes stay in clear so peers can order, deduplicate, and relay without the key.

**Rationale**: Per-learner partitioning and per-learner keys are the only deletion mechanisms Automerge allows. A keyed set makes duplicates idempotent. Storing records as bytes keeps Automerge's per-field overhead off a log that may reach hundreds of thousands of records, and lets encryption wrap the payload without changing the structure.

**Alternatives**: One class-wide list (rejected for deletion and size); one Automerge map per field of each record (rejected for memory); a non-Automerge log synced separately (rejected: it would be a new sync protocol).

### D4. The operation DSL

**Decision**: Operation types are declared once in the shared package: name, schema version introduced, payload schema, authorisation predicate (role at logical time), and reducer. The fold is generated from these declarations. Peers report their supported schema version in the sync handshake and in a periodic site-log heartbeat; the box refuses to raise a log's minimum version while any admitted device reports an older one, unless overridden.

**Rationale**: Concurrency semantics have to be explicit per type; a table of declarations is auditable in a way that scattered reducers are not. Unknown types skip and count, so an old device shows "n updates need a newer version" rather than crashing or silently diverging.

### D5. Key hierarchy

```
   project root key (embedded at install; rotates via signed platform update)
        |
        +--> publisher keys (certified by root; carried in packs and tokens)
        |        +--> pack manifests, licence tokens, key-status lists
        |
   site key (box; site identity; signs admissions, licence ops, leases,
        |     roster snapshots, transport parameters; recovery bundle holds it)
        |
        +--> per-pack site keys  = HKDF(site master secret, pack address)
        |        (encrypt site copies; wrapped to device keys in leases)
        |
        +--> transport identities (WebTransport certificate schedule derived
        |        from a schedule secret; WebRTC DTLS key); in the bundle
        |
        +--> learner record keys (random, NOT derived; box key store; wrapped
        |        to learner, teacher, and admin device keys; destroyed to
        |        delete; recovered from staff devices or directory backup)
        |
        +--> device keys (generated on device; admitted into the site log;
                 staff keys optionally recoverable through a passkey)
```

**Decision**: Ed25519 for all signing keys where the platform's Web Crypto supports it, with ECDSA P-256 accepted for devices that lack it; key identifiers carry an algorithm prefix so the fold verifies either. Per-pack site keys and transport schedules are derived from secrets in the recovery bundle. Learner record keys are deliberately not derivable, because a key that can be re-derived cannot be destroyed.

### D6. Site copy produced by the box at activation

**Decision**: The box decrypts the publisher payload once, watermarks images and the text rendering configuration with the site and licence identifiers, leaves video and audio untouched, re-encrypts everything under the per-pack site key, keeps the publisher ciphertext for reprocessing, and serves only the site copy. Re-encryption always happens even when nothing is markable. The publisher content key never leaves the box.

**Rationale**: Anything the client does can be undone by a modified client; anything the box does before bytes reach a device cannot. Re-encrypting is cheap and confines a leaked key to one site. Transcoding video on a Pi 5 would take hours per pack and is not worth a mark a screen recording defeats anyway; the visible overlay carrying site and lease identifiers is the honest control for video.

**Alternatives**: Client-side watermarking only (weak); per-device site copies (unworkable on shared devices and too costly); video transcoding on a cloud service before delivery (moves publisher plaintext off the box and adds an online step).

### D7. Lease defaults

**Decision**: 30 days sliding, renewed on every contact; 7 days grace with a persistent notice; capped by licence not-after; publishers and administrators may only lower the defaults; per (device, learner).

**Rationale**: UK half-terms are two weeks; 30 days covers every break except summer, when expiry is acceptable. Sliding renewal means a device that attends school never notices leases exist.

### D8. Seats per learner, leases per device

**Decision**: Seat allocation is keyed by learner reference; leases by device key.

**Rationale**: This matches how publishers price and how schools deploy devices. A lost device costs nothing against the seat count.

### D9. Licence operations are box-signed only

**Decision**: The fold accepts licence operations only when signed by the site key. The box serialises them locally.

**Rationale**: A single writer for seat allocation removes concurrent over-allocation by construction. Multi-box sites are a per-box or split-token matter (open question 4).

### D10. Identity without an identity provider

**Decision**: Device keypairs; admission by short-lived codes bound to role and class, where the QR form also carries the box's LAN addresses, site key fingerprint, transport parameters, and shell URL signed by the site key; roles in the site log; revocation as an operation; replacement devices admitted against the same learner reference; staff devices may register a passkey so a replacement laptop is admitted by assertion; an attribution handle separate from roster identity; shared devices with learner PINs.

**Rationale**: No passwords to reset, no accounts to provision, nothing to phish. The QR makes the teacher's device the trust bootstrap for the box, so admission never depends on DNS or a certificate. Passkeys give staff the one thing device keys lack, recovery of identity across devices, through the platform account they already have, and WebAuthn is available because the shell is a secure context. Students do not get passkeys: six-year-olds and shared tablets do not suit biometrics, and the learner reference already survives device replacement.

**Alternatives**: Passwords (rejected by the brief); federated login (excluded); passkeys for everyone (rejected for the student reasons above).

### D11. Roster as replaceable signed snapshots outside the CRDT

**Decision**: Learner references are random and stable by source identifier. Names travel only as site-signed, device-encrypted, versioned snapshots outside the document repository, scoped by role, deleted on revocation.

**Rationale**: PII in an append-only CRDT is PII forever. Roster data has a single source so it needs no merge.

### D12. HTTPS for the shell; LAN transports pinned to the site key for data

**Decision**: The application shell is the only thing that needs a secure context, and it is served over HTTPS from either the box's own hostname (per-box public certificate via the registry and ACME DNS-01, as originally designed) or a project-run public origin. Documents and pack bytes travel over transports that authenticate the box by its site key:

```
  transport                 trust anchor            browsers          notes
  ------------------------- ----------------------- ----------------- -------------------------------
  WebTransport, hash-pinned site-signed schedule    Chromium; verify  P-256 self-signed certs, <=14
                            of certificate hashes   Firefox           days each; box pre-generates a
                                                                      year from a schedule secret
  WebRTC data channel,      site-signed DTLS        all, incl. Safari box is ICE-lite with static
  signalling-free           fingerprint + static                      credentials; device builds the
                            ICE credentials                           remote SDP locally; device
                                                                      authenticates at app layer
  WebSocket over HTTPS      public or fleet CA      all               only while a shell certificate
                                                                      is valid; the original design
```

The device prefers them in that order. Transport parameters ride in the admission QR and are refreshed, signed, at every contact. Chrome's Local Network Access prompt is requested deliberately at admission when the shell came from the public origin; shells from the box's hostname are already in the local address space and do not prompt. For managed fleets a name-constrained site authority may replace the public certificate. iPad fleets get the wrapped client (D22).

**Rationale**: It keeps "open a URL" onboarding and makes class continuity independent of the web PKI. A lapsed certificate now pauses onboarding and updates instead of sync, so certificate lifetimes, DNS during outages, rebinding protection, and rate limits all drop off the critical path. WebRTC is the universal fallback because WebKit rejects hash pinning and because the W3C group has an open issue about removing `serverCertificateHashes` altogether; if Chromium ever followed, the design survives.

**What must be spiked before this is relied on**: signalling-free WebRTC to an ICE-lite box with static credentials (browsers require minimum credential lengths and a consistent answer SDP; libraries such as werift or libdatachannel need checking for ICE-lite support); Firefox's handling of `serverCertificateHashes`; the address space Chrome assigns to a document served from a service worker cache when the network is down; and iPadOS WebRTC data channel stability in the background.

**Alternatives**: Per-box certificates as the foundation (the first draft; kept as the WebSocket path and as the shell source); local CA root installed by hand (rejected by the brief); a cloud relay as the origin (rejected: not offline-first); native apps everywhere (rejected: loses zero-install onboarding; kept for iPads).

### D13. Time

**Decision**: Lamport clocks order everything. The box takes time from NTP, then a hardware clock, then an attestation from an administrator or teacher device at boot, then its last persisted time, never going backwards. The Pi 5 with its clock battery is the reference hardware, so the lower rungs are exceptional. Devices keep a high-water mark and suspend licensed rendering if their clock falls more than an hour behind it.

### D14. Data protection by partition, key destruction, and drop

**Decision**: Learner data only in learner logs and learner-owned documents. The box generates a random record key per learner, wraps it to the learner's devices and to the staff devices of their classes with the lease wrapping mechanism, and encrypts learner-log payloads and learner bundles under it. Retirement and retention destroy the key after a hold, then delete ciphertext and drop plaintext documents, with signed acknowledgements from devices. In-document deletion is described honestly as tombstoning.

**Rationale**: Key destruction is the only deletion that works on copies you no longer control, and this platform is built to make copies. Sealed epochs, backups, successor boxes, and any future relay hold ciphertext only. The residual is exactly the devices that held the key and never return, which is the same residual the cooperative design had, now confined to a smaller set. Learner content documents cannot be value-encrypted without breaking the text CRDT, so they keep the drop mechanism.

**Alternatives**: Cooperative drop only (the first draft; weaker); encrypting whole Automerge documents at rest per device (does nothing for copies the box made); a Keyhive-style encrypted sync layer (D23, not yet).

### D15. Recovery

**Decision**: Install-time recovery bundle (site key, ACME account key, directory key, transport schedule secret, DTLS key) under a passphrase, file plus printable QR, with nagging until confirmed and a drill; rebuild pulls replicas from devices; succession by an administrator device when no bundle exists, with store re-issue of licences to the new site key; learner record keys return by re-wrapping from the staff devices that hold them or from the encrypted directory backup.

**Rationale**: Open documents and logs are recoverable from the class by construction. Keys are not, and the licence anchor, the transport identity, and the ability to read learner records are all keys.

### D16. Pack bytes over a content-addressed fetch, not a document

**Decision**: Packs are fetched by hash over whichever LAN transport the device is using, gated by lease. They are never Automerge documents.

### D17. Launched content: cmi5 forward, SCORM legacy

**Decision**: cmi5 is the recommended packaging for new publisher content: the pack carries the course structure, the runtime launches each assignable unit with local launch parameters, and the session and content statements land in the learner log as ordinary xAPI. SCORM 1.2 and 2004 are supported through the runtime API shim with commit-granularity logging, attempts bound to the starting device, and ADL SCORM-profile statements for completion, success, and score.

**Rationale**: cmi5 is what xAPI-native content authoring tools already produce and it needs nothing the platform does not already have. Keeping SCORM is a market requirement, not a preference.

### D18. Interchange

**Decision**: Import always produces open or site documents (never licensed), requires a tier and licence declaration, and records the source hash; export is gated by tier with placeholders for licensed references and a lossiness report; releases for the commons use the native bundle form.

### D19. Default open licence (provisional)

**Decision**: Provisional platform default of CC BY-SA 4.0 for open-tier content, overridable per site, with the fork rule that share-alike cannot be dropped. See open question 3.

### D20. Compaction

**Decision**: Open documents keep full history with an optional squash fork recorded in provenance; class and site logs seal epochs with a site-signed snapshot; learner logs are retired by key destruction; learner documents squash or drop at retention boundaries; LRU by document identifier with configurable budgets on box and device.

### D21. The commons is a registry of releases

**Decision**: Cross-site sharing is publish and pull. A release is a native bundle (Automerge document at chosen heads, provenance with a signed publication event, open attachments) stored in a content-addressed registry. The box and the registry both check tier, licensed references, lineage, and licence declaration. Pulling imports a fork whose provenance names the release; publishing a release of that fork lets the upstream author pull and merge it, which is the pull-request loop. Releases are plain files, so a USB drive is a mirror. There is no live sync with any peer outside the site.

**Rationale**: Teachers want releases and merges, not a shared cursor across schools. A registry needs no access control beyond "open only", works with intermittent connectivity, and gives the laundering check a single chokepoint. It also removes the one external sync peer the first draft had to defend.

**Alternatives**: A live automerge-repo relay (the first draft; more to secure, less useful); a git repository of Automerge files (workable but re-implements the registry with worse tooling for non-technical teachers).

### D22. Wrapped client for managed iPads

**Decision**: The same web client inside a thin native shell, distributed through Apple School Manager and MDM, pinning the site key and using the LAN transports or a TLS connection whose trust is the site key. No separate feature set.

**Rationale**: It sidesteps WebKit's transport stance and iPadOS storage eviction for the fleets most likely to hit both, using the distribution channel those fleets already use.

### D23. Keyhive is the intended successor for access control, not the foundation

**Decision**: Ink & Switch's Keyhive and the Beelay sync protocol target exactly the excluded problem: capability-based authorisation and end-to-end encryption for Automerge under eventual consistency. They are pre-alpha and unaudited, so this platform builds the star topology, share policy, and per-learner keys itself, and keeps them shaped so Keyhive can replace them: per-document and per-learner symmetric keys wrapped to device keys, signed delegations recorded as operations, and no assumption that the box can read every document.

**Rationale**: Building on a research prototype would put a school's data on an unstable base. Designing so the prototype can slot in later costs little.

## Threat model and residual risk

The platform's licensing controls are deterrence and traceability. The table records what each control actually achieves against each adversary.

```
  Asset                 Adversary                    Control                          Residual risk (accepted)
  --------------------- ---------------------------- -------------------------------- --------------------------------
  Licensed plaintext    Student with a leased        Site copy encrypted; keys in     Modified client can dump plain-
                        device, modified client      lease; render in memory only;    text. Leak traces to the site
                                                     no durable plaintext; watermark  via the watermark, not to the
                                                     on images/text; overlay on video student. Video traces only if
                                                                                      the overlay survives capture.
  Licensed plaintext    Teacher (holds site copy     Same, plus licence terms and     Same. Teachers are trusted more
                        keys legitimately)           audit trail of who was leased    than the design can enforce.
  Pack ciphertext       Anyone with a USB copy       Inert without licence; content   None beyond storage cost; the
                                                     key wrapped to site key          ciphertext is not secret.
  Publisher content key Attacker with the box's      Never leaves the box; box data   Box compromise exposes every
                        storage                      partition encrypted              pack at that site.
  Seat limits           Site trying to over-use      Box is the only allocator;       A modified box binary could
                        seats                        allocation logged and signed     ignore limits.
  Lease expiry          Student who never returns    Local clock check; rollback      A modified client renders
                                                     guard; grace bound               forever.
  Revocation            Offline device               Not renewable; keys discarded    Renders until grace ends.
                                                     on next contact
  Open commons          Person laundering licensed   No document form; no import      Retyping and screenshots cannot
                        content                      path; release checks at box and  be stopped. Traceable, reportable.
                                                     registry; watermark
  Lineage/attribution   Person stripping authors     Signed events; tamper-evident    Fresh retyped copy has no lineage
                        from a fork                  against history; registry        and cannot be detected.
                                                     refuses unverified
  Learner records       Lost or stolen device        Payloads under the learner       A device holding the key that
                                                     record key; key in the platform  never returns keeps readable
                                                     key store; key destruction on    records; nothing else does.
                                                     retirement
  Learner records       Stolen box storage, backups, Encrypted partition; payload     Key store on the same device if
                        successor box, sealed epochs ciphertext without the key store unattended boot is required
                                                                                      (open question 8).
  Learner documents     Lost or stolen device        OS storage protection; drop on   Plaintext text CRDTs on a device
  (Automerge text)                                   next contact; pseudonymous refs  that never returns are
                                                                                      unrecoverable and undeletable.
  Log integrity         Modified client removing     Signatures; history check;       Not Byzantine-tolerant: relies on
                        or forging records           box restores; forged keys fail   the box replica and on device
                                                     authorisation                    keys not being extracted.
  LAN transport         Attacker on the LAN          Site key pinning via QR and      First admission by typed code
                        impersonating the box        signed transport parameters;     over the hostname trusts DNS and
                                                     device challenge-response        the shell certificate once.
  Application shell     Compromise of the public     Per-box shells are verified by   The public origin is a supply-
                        origin or the project's      the box against the root-signed  chain trust point for every site
                        release pipeline             release; TLS for the origin      installed from it.
  Site authority (MDM)  Leaked site CA key           X.509 name constraints to the    A device that does not enforce
                                                     box hostname; MDM-only           name constraints trusts the key
                                                     distribution                     for any name. Modern browsers
                                                                                      enforce them.
```

### Offline-first versus licence enforcement

The brief asked for these conflicts to be flagged, not papered over.

```
  Enforcement need        What offline-first breaks             Resolution and bound
  ----------------------- ------------------------------------- -------------------------------------------
  Seat limits             Concurrent allocation on many peers   Single writer (box); devices never allocate
  Validity window         No trusted clock anywhere             Local clocks + rollback guard; bound = grace
  Revocation              Offline device cannot be reached      Bound = remaining lease + grace (<= 37 days
                                                                by default)
  Lease expiry            Clock rollback, data reset            Guard; reset also destroys the lease
  No relay outside site   Packs travel by USB anyway            Only the site copy is controlled; ciphertext
                                                                is not secret; no external sync peer exists
  Watermark               Client can strip                      Box-side site copy marks images and text
                                                                before they leave; video has only the
                                                                visible overlay
  Publisher key revoke    Status list needs delivery            Travels with packs/tokens; until then old
                                                                keys verify
  Audit for publishers    Log lives at the site                 Publishers see it only if the site shares it
                                                                (not designed here)
```

## Risks / Trade-offs

- **Risk: hash-pinned WebTransport is removed from the standard or from Chromium.** WebKit already refuses it and the W3C group has an open issue on removal. Mitigation: signalling-free WebRTC is the universal path and is built regardless; WebSocket over a valid certificate remains.
- **Risk: signalling-free WebRTC fails the spike.** Mitigation: iPads fall back to the wrapped client, browsers without WebTransport fall back to the certificate path, and the design degrades to the first draft rather than to nothing.
- **Risk: Chrome's Local Network Access prompt confuses students or is refused.** Mitigation: deliberate, explained request at admission; installing the shell from the box's hostname avoids the prompt entirely; the wrapped client is not subject to it.
- **Risk: the public origin becomes a supply-chain single point.** Mitigation: signed releases, reproducible builds, and the per-box shell path whose releases the box verifies against the root key; treat the public origin as optional at launch (open question 10).
- **Risk: certificate lifetime shrinks faster than schools' connectivity improves.** Mitigation: it now affects onboarding and updates only; hotspot renewal; public origin; site authority for managed fleets.
- **Risk: join-existing-LAN mode fails on school networks with rebinding protection.** Mitigation: installer checks with the exact exception; box-as-network mode recommended; sync unaffected either way.
- **Risk: transport schedule or DTLS key lost with the box.** Mitigation: both derive from or live in the recovery bundle; succession re-issues parameters by QR.
- **Risk: iOS storage eviction or quota loses unsynced student work.** Mitigation: persistent-storage request and reporting, selective pack caching, wrapped client for managed fleets.
- **Risk: log growth outpaces a Pi's memory.** Mitigation: per-learner partitioning, bytes-encoded records, epoch sealing, LRU eviction, size budgets.
- **Risk: a modified client is the whole threat model for licensing.** Mitigation: none beyond what is written above; publisher agreements must reflect it.
- **Risk: a lost recovery bundle strands every licence and the transport identity.** Mitigation: nagging until confirmed, drills, succession plus store re-issue and QR re-admission.
- **Risk: learner record keys are lost when the box and all staff devices are lost together.** Mitigation: the optional encrypted directory backup; otherwise the records are unrecoverable, which is the same outcome as deletion and is acceptable for formative data.
- **Risk: teachers import content they do not have rights to share as open.** Mitigation: tier declaration, provenance with source hash, release checks at box and registry; not preventable.
- **Risk: shared-device PINs are weak.** Mitigation: formative-only scope, rate limiting, teacher visibility.
- **Risk: multiple boxes in one school break the single-allocator model.** Mitigation: per-box tokens or split tokens (open question 4).
- **Trade-off: star topology means no sync when the box is off.** Accepted for access-control tractability.
- **Trade-off: site copies double pack storage on the box.** Accepted for key separation.
- **Trade-off: the box holds every learner record key.** Accepted; the box already holds the directory, and Keyhive would relax this later.
- **Trade-off: three transports to build and test.** Accepted; each is a small adapter over the same protocol, and two are needed for browser coverage regardless.

## Migration Plan

Not applicable: this is a greenfield specification with no existing deployment. Delivery sequencing will be captured in `tasks.md` when the specification is accepted; it is deliberately absent from this change.

## Open Questions

Genuinely open decisions, with a recommendation where the evidence supports one. Items 1, 2, 4, and 16 change externally observable behaviour and should be settled before implementation planning; the rest can be resolved during it.

1. **Default network mode.** Recommend box-as-network as the Pi image default and join-existing-LAN as an explicit choice with installer checks.
2. **Seat model with publishers.** Recommend seats per learner with a cap of two admitted devices per learner. Confirm publishers accept per-learner counting and whether reassignment of released seats should be limited.
3. **Default open licence.** Recommend CC BY-SA 4.0 as the platform default with per-site override.
4. **Multi-box sites.** Recommend one token per box for the initial platform.
5. **Box runtime packaging.** Bun compile versus Node single-executable; decide on Pi memory footprint, Automerge WASM start-up, and which WebRTC library builds cleanly into it.
6. **Retention policy defaults.** One year after the academic year is a placeholder; the DPIA template should drive the default.
7. **UK MIS connectors.** Which of Wonde, Xporter, or direct SIMS/Arbor/Bromcom exports to support beyond OneRoster CSV and the generic mapping.
8. **Box disk encryption key handling.** Unattended boot on a Pi without a TPM means the key is on the device. Recommend accepting the residual for the Pi and documenting it, with passphrase boot as an option.
9. **Code signing route.** Azure Trusted Signing versus an OV/EV certificate for Windows; Apple Developer notarisation for macOS and the wrapped iPad client.
10. **Public origin at launch.** Whether the project runs the public shell origin from day one or relies on per-box shells until demand from schools without box connectivity justifies it.
11. **Publisher key-status cadence.** How often status lists are cut and whether packs must embed the latest list at build time.
12. **Signing algorithm floor.** Whether any target school devices still lack Ed25519 in Web Crypto.
13. **Direct device-to-device sync.** Whether it is ever wanted; if so, open documents only.
14. **Pack size budget and per-device cap defaults.** Depends on launch publishers' media profiles and the cheapest target devices.
15. **Publisher visibility of licence audit trails.** Whether publishers get any view of seat allocation history, and through what channel.
16. **Transport spikes.** The outcomes of the signalling-free WebRTC spike, the Firefox hash-pinning check, and the service-worker address-space check decide whether iPads need the wrapper for transport or only for storage, and whether the public origin is usable without a permission prompt.
17. **Passkey policy.** Which passkey providers schools permit for staff, and whether some schools' IT policies forbid synced passkeys, in which case staff fall back to device keys with the recovery bundle path.
18. **Directory backup to administrator devices.** Whether the encrypted keyring and directory backup is on by default, given it places learner record keys on more devices in exchange for recoverability.
