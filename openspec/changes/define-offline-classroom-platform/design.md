## Context

See `proposal.md` for motivation and the capability list. This document records how the first release fits together, where the originating brief was challenged, what the discovery interview changed, the decisions taken with their alternatives, an honest threat model, and the questions that remain open.

### The market and the deployment

- **Where**: schools in parts of Latin America and East Africa. Internet is patchy and often available only at school. Power is not reliable. Interfaces must be in English and Spanish at launch.
- **Who buys**: the school, sometimes a chain of schools, sometimes a government contract. Every buyer gets the same thing: a box per site and a site licence per pack per box. Data stays on the box. Nothing is reported centrally to a chain, a ministry, or a funder.
- **What they buy it for**: a teacher names a class, gets a URL and a code, adds packs from the stock room and their own PDF, EPUB, SCORM, and QTI files, adds collaborative documents, and presses start. Students join by code with a name and a PIN on lab PCs or loaned laptops, use the class chat, do homework assigned to the class or to individuals, and take laptops home offline. The teacher looks at the overview the next morning.
- **Devices**: shared Windows lab PCs and school-owned laptops loaned to students on rotation. Not iPads, not personal phones, though the browser client runs on Android if a student has one.
- **The comparator**: Kolibri, which runs offline on the same hardware in the same regions. Trellis differs in collaborative documents, commercial packs that go home on loan and recall themselves, and a licence model as simple as a stock room.
- **The alternative offer**: a hosted subscription instead of a box, one or the other. It is specified in `extend-platform-second-release`, because it is the same binary run per school by the company, and because its promise is weaker: collaboration in a hosted school depends on the school's internet during the lesson.

### Constraints that shape everything below

- **Automerge and automerge-repo are the sync foundation.** No new sync protocol. automerge-repo has no per-change access control: a document identifier plus a connection is a bearer capability, and the only policy hook is whether to share a document with a peer. Transports are pluggable network adapters.
- **Automerge history is append-only.** Forgetting is only possible by dropping or squashing whole documents, or by destroying the key that protects their contents.
- **Every client is untrusted.** A PWA on a student's device can be modified, its storage read, its clock changed.
- **The box is a Raspberry Pi or a cheap laptop** that loses power without warning, may have no battery-backed clock, and may be the only network in the room.
- **Secure context is required by the application shell**, for service workers and Web Crypto, and no public CA issues certificates for private addresses. Data transport does not need the web PKI at all.
- **Browser facts that bound the transport design** (checked September 2026): WebTransport is Baseline across Chromium, Firefox, and Safari 26.4; WebKit has stated it will not implement `serverCertificateHashes`; Chrome's Local Network Access permission gates WebSocket and WebTransport from public origins to private addresses since Chrome 147. With Windows lab PCs and loaned laptops running Chromium browsers, hash-pinned WebTransport is the primary transport and the Safari gap is a second-release concern.
- **Out of scope** (from the proposal): summative assessment, capability-based authorisation and revocation under eventual consistency, federated identity, authoritative wall-clock time, payment internals, and any central collection of learner data.

### System shape

```
                        internet (patchy; never on the daily path)
              +-------------------+      +-----------------------+
              |  registry         |      |  licence store        |
              |  DNS zone +       |      |  (external; issues    |
              |  ACME DNS-01      |      |   site-licence tokens)|
              +---------+---------+      +-----------+-----------+
                        |  cert renewal              |  tokens by download,
   .....................|............................|..  file, or QR
                        v                            v
   +--------------------------------------------------------------------+
   |  BOX  (Pi 5 or cheap laptop; the classroom Wi-Fi by default)       |
   |  site key | transport identities | stock room (packs, site copies) |
   |  lease register | learner record keys | directory | share policy  |
   |  captive landing page -> shell over HTTPS on its own hostname      |
   +---------+-----------------------------+--------------------+-------+
             |  LAN transports pinned to the site key            |
             |  (WebTransport by hash | WebRTC ICE-lite | WSS)   |
      +------+-------+           +---------+--------+    +-------+--------+
      | teacher      |           | lab PC (shared)  |    | loaned laptop  |
      | laptop       |           | learner sessions |    | checked out to |
      | overview,    |           | by name + PIN    |    | one learner;   |
      | record keys  |           |                  |    | goes home      |
      +--------------+           +------------------+    +----------------+
                    (star topology: devices talk only to the box)
```

### Document families and tiers

```
                    | open tier          | site tier              | licensed tier
  ------------------+--------------------+------------------------+------------------
  content documents | Automerge; teacher | Automerge; teacher     | (none: licensed
  (structural merge)| declares shareable | documents, class       | material is never
                    | with a licence     | collaborations,        | a document)
                    |                    | learner work, notes    |
  ------------------+--------------------+------------------------+------------------
  bundles           | declared-open      | imported PDF, EPUB,    | signed+encrypted
  (content address, | files and media    | SCORM, cmi5; media;    | packs; site copy
   never merged)    |                    | learner bundles under  | with watermark
                    |                    | the learner record key |
  ------------------+--------------------+------------------------+------------------
  logs              | (none)             | site log, class logs   | (licence events
  (signed op set,   |                    | in clear; learner logs |  live in the site
   fold on read)    |                    | with encrypted payloads|  log, box-signed)
```

## Where the brief was challenged

Each item states what the brief assumed, why it does not hold, and what the specs do instead. Items 1 to 26 came from the first two rounds; 27 to 32 came from the discovery interview.

1. **Lease expiry is wall-clock enforcement on an untrusted clock.** Fairness uses of time (deadlines) stay excluded; deterrence uses (leases) are judged against the verifier's own clock with a rollback guard, and the bound is stated: an offline device renders until grace ends.
2. **"Internet only at install and 90-day renewal" is eroding.** CA/Browser Forum ballot SC-081 takes certificate lifetimes to 47 days by March 2029. With the certificate confined to the shell (item 22), this bounds how often new devices can be onboarded, not whether class runs.
3. **Public DNS to a private address fails in an outage and is blocked by rebinding protection.** Box-as-network mode is the default; the consequence of a resolution failure is confined to shell loading.
4. **Let's Encrypt rate limits.** Public Suffix List listing or a rate-limit arrangement is a prerequisite for per-box certificates at scale.
5. **Fully disconnected schools cannot be served by any public-CA design.** The pinned transports need no CA; a managed fleet can carry a name-constrained site authority (item 23). The remaining corner, no internet ever and no fleet management, needs a few minutes of hotspot connectivity every few weeks, and the design says so.
6. **"Attachments are the licensed family" is too neat.** Families are by representation; tier is orthogonal; a site tier holds everything a school makes.
7. **A single class-wide state log conflicts with per-student deletion.** Site, class, and learner logs.
8. **"Append-only list" is the wrong Automerge structure.** A map keyed by operation identifier with explicit logical ordering and signed canonical bytes.
9. **Device identity is not student identity.** Learner sessions on shared devices; the interview added loaned devices with check-out and check-in.
10. **"Licensed material must not be mergeable into open documents" cannot be enforced against copying.** Enforced structurally; the residual is traceability and licence terms.
11. **"Sync must refuse to relay packs outside the site" while packs are sideloadable by USB.** The site copy is what is controlled; pack bytes never leave the site by any transport.
12. **"Peers are symmetric" plus access control is the excluded problem.** Star topology through the box; protocol stays symmetric.
13. **"Publisher public key embedded at install" needs a level of indirection.** A project root certifies publisher keys; a signed key-status list handles revocation.
14. **The box is "just a peer" for documents only.** For licensing, identity, PII, certificates, and transport identity it is a trust anchor; hence the recovery bundle and succession.
15. **Raspberry Pi 4 has no real-time clock.** A time-source hierarchy; the Pi 5 with its clock battery is the reference hardware.
16. **Client-side watermarking is strippable.** The box marks images and text into a re-encrypted site copy; video carries only the visible mark.
17. **Purchase "online" and a box with no connectivity.** Tokens by file, paste, or QR.
18. **Lease renewals as log operations would flood the log.** A box-side register; only losses are logged.
19. **Browser storage on tablets threatens "full replica on every device".** Persistent storage requested and reported; selective pack caching; the iPad wrapper is deferred with iPads themselves.
20. **xAPI actors are PII by default.** Account identifiers with the site as home page and the learner reference as name.
21. **OneRoster is the right model but not what schools here have.** Replaced as the first door by joining with a code (item 28); MIS import is deferred.
22. **Using HTTPS as the data transport made the web PKI a daily dependency.** Documents and pack bytes travel over LAN transports authenticated by the site key. A lapsed certificate pauses onboarding and updates, never sync.
23. **Rejecting a local CA root was really rejecting manual installation.** A name-constrained site authority is allowed for fleets under device management, never required, never installed by hand.
24. **"Git for the classroom" needs releases, not a live relay.** Deferred to the second release as a registry of signed releases; the first release has no cross-site channel at all.
25. **Cooperative deletion is weaker than key destruction.** Learner-log payloads and learner bundles are encrypted under per-learner keys; retirement destroys the key.
26. **iPads were the exception the PWA story hid.** Moot for the first release: the devices are Windows lab PCs and loaned laptops. The wrapped client is deferred.
27. **Seats, cohorts, and copies solved a problem the product does not have.** A site licence per box covers every learner at the box. Counting, allocation, reassignment, and stock transfers between boxes all disappear, and with them the single-writer machinery I had built for seat allocation. Licence events are activation, deactivation, revocation, and, for dated tokens only, expiry.
28. **Roster import was the wrong first door.** A teacher names a class and shares a code; students register a name and a PIN; the directory is built from joins. This is how a teacher hands out textbooks, and it needs no MIS.
29. **The class needed a lifecycle.** Name, URL, code, start, stop, end. Start is the publish step the brief worried Automerge lacked, and the code lives while the class is live rather than for ten minutes.
30. **Teachers have files, not formats.** The first release imports PDF, EPUB, SCORM, cmi5, and QTI, as viewers and a runtime rather than conversions. QTI drags an item engine with auto-marking into the first release, which is worth building as a feature rather than an import side effect.
31. **Loaned laptops on rotation are a device class of their own.** Check-out binds a borrower, check-in wipes the borrower's keys and replicas before the next one. That makes the previous borrower's privacy a ceremony at the box rather than a hope.
32. **Three requirements the brief never mentioned**: localisation, durability under power loss, and data-protection law that is Kenyan, Brazilian, or Peruvian rather than British. All three are now capabilities or requirements.

## Goals / Non-Goals

**Goals:**
- One fold implementation shared by every peer so state is identical everywhere.
- Every licence, identity, and transport decision verifiable offline against keys the peer already holds.
- Every cross-boundary flow governed by one share policy that is stated, not emergent.
- A teacher can go from a fresh box to a running class without reading documentation, in English or Spanish.
- Every unavoidable weakness written down next to the control that bounds it.

**Non-Goals:**
- Preventing a determined person with a leased device from extracting plaintext or an answer key. Deterrence and traceability only.
- Byzantine fault tolerance among peers.
- Any sync with a peer outside the site, live or otherwise, in the first release.
- Real-time presence or cursors.
- Mesh sync between student devices.
- Reporting anything to a chain, a ministry, or a funder.

## Decisions

### D1. TypeScript throughout; the box is a single compiled binary

**Decision**: One TypeScript monorepo: PWA client, box server, a shared package holding the operation DSL, the fold, the share policy, the transport adapters, and the crypto helpers. The box binary is produced with a single-file compiler for the runtime (Bun `--compile` or Node single-executable) with web assets embedded.

**Rationale**: The fold and the share policy must be identical on every peer. automerge-repo's reference implementation is TypeScript and is what the browser must use anyway.

**Alternatives**: Rust box with a TypeScript client (rejected for divergence; revisit if a Pi cannot keep up); Java (excluded: core-only bindings).

### D2. Star topology in deployment, symmetric protocol, pluggable transports

**Decision**: Devices connect only to the box. Every transport is an automerge-repo network adapter. Devices refuse non-box peers until a site setting enables mesh.

**Rationale**: Share policy is the only access control automerge-repo offers; enforcing it in one place is tractable.

### D3. Three log instances and a keyed operation set

**Decision**: Site log, class logs, learner logs. Each is an Automerge map from operation UUID to signed canonical bytes. Ordering by (Lamport, signer key, sequence). Learner-log payloads are ciphertext under the learner record key with envelopes in clear. Class logs now also carry lifecycle events, chat messages, and assignments with target sets.

**Rationale**: Per-learner partitioning and per-learner keys are the deletion mechanisms Automerge allows. Chat is class data by nature and lives with the class.

### D4. The operation DSL

**Decision**: Operation types declared once: name, schema version, payload schema, authorisation predicate, reducer. The fold is generated from the declarations. Unknown types skip and count. Peers report their schema version; the box will not raise a minimum version while an admitted device is behind, unless overridden.

### D5. Key hierarchy

```
   project root key (embedded at install; rotates via signed platform update)
        +--> publisher keys (certified by root) --> pack manifests, tokens,
        |                                          key-status lists
   site key (box; signs admissions, enrolments from joins, licence ops,
        |     leases, roster snapshots, transport parameters)
        +--> per-pack site keys  = HKDF(site master secret, pack address)
        +--> transport identities (WebTransport schedule secret; DTLS key)
        +--> learner record keys (random, NOT derived; wrapped to learner,
        |        teacher, and admin device keys; destroyed to delete)
        +--> device keys (generated on device; admitted into the site log)
```

**Decision**: Ed25519 where Web Crypto supports it, ECDSA P-256 accepted otherwise; key identifiers carry an algorithm prefix. Per-pack keys and transport schedules derive from secrets in the recovery bundle. Learner record keys are deliberately not derivable.

### D6. Site copy produced by the box at activation

**Decision**: Decrypt once, watermark images and text rendering configuration with site and licence identifiers, leave video and audio untouched, re-encrypt everything under the per-pack site key, keep the publisher ciphertext, serve only the site copy. Re-encryption always happens.

**Rationale**: What the box does before bytes leave cannot be undone by a modified client. Transcoding video on a Pi is impractical and a screen recording defeats it anyway; the visible overlay is the honest control for video.

### D7. Leases are loans

**Decision**: 30 days sliding, renewed on every contact; 7 days overdue grace with a notice; then recall. Capped by a dated licence's end. Publishers and administrators may only lower the defaults. Per (device, learner). The lease wraps keys for the packs added to the learner's classes, not for every pack at the site. Presented everywhere as borrowed, overdue, returned.

**Rationale**: Two-week breaks are the longest common absence short of summer; a device that attends school never notices leases. Scoping the lease to class content keeps a leaked device from unlocking the whole stock room.

### D8. A site licence per box, no counting

**Decision**: A licence token binds a pack family to one box. Every admitted learner may borrow it. No seats, copies, cohorts, device caps, or reassignment. Chains and governments buy one token per box. A token is undated unless the publisher chooses otherwise.

**Rationale**: The interview's stock-room principle: a teacher takes thirty textbooks without filling in a form. Counting was solving a problem that pricing per box already solves for the publisher, and every counting mechanism I had designed carried failure modes under eventual consistency.

**Alternatives**: Seats per learner with the box as single allocator (the previous draft; correct but unnecessary); cohort caps; transferable copies between boxes (needs the store in the loop and nobody asked for it).

### D9. Licence operations are box-signed only

**Decision**: Activation, deactivation, revocation, and expiry observation are accepted only when signed by the site key, and activation embeds the token so the licence is recoverable from any replica of the site log.

### D10. Identity: classes, codes, names, and PINs

**Decision**: Device keypairs. A class code lives while the class is live; staff codes are short-lived. A student joins by choosing an existing name and PIN or registering a new one; the box creates the learner reference and signs the enrolment. Teachers rename, merge, remove, and reset PINs, and may pre-create names from a list. Shared devices run learner sessions. Loaned devices are checked out to one learner at the box and checked in on return, which wipes the borrower's keys and replicas. The QR form of every code carries the box's addresses, site key fingerprint, and transport parameters.

**Rationale**: This is the textbook handout, digitised: no accounts, no import, no passwords, and the teacher stays in control of the list. Check-in makes cross-borrower privacy on a rotated laptop a ceremony the school already performs.

**Alternatives**: Roster import first (deferred); passkeys for staff (deferred; needs platform accounts many teachers here do not have); passwords (rejected by the brief).

### D11. Directory from joins; names as replaceable snapshots

**Decision**: The directory is built from joins and teacher-entered lists, holds only display name, PIN verifier, learner reference, and classes, and distributes display names as site-signed, device-encrypted, versioned snapshots outside the document repository.

### D12. HTTPS for the shell, served by the box; LAN transports pinned to the site key for data

**Decision**: The shell is served by the box from its own hostname under a per-box public certificate (registry, ACME DNS-01) or, on managed fleets, a name-constrained site authority. Documents and pack bytes travel over transports that authenticate the box by its site key:

```
  transport                 trust anchor            browsers          notes
  ------------------------- ----------------------- ----------------- -------------------------------
  WebTransport, hash-pinned site-signed schedule    Chromium; verify  P-256 self-signed certs, <=14
                            of certificate hashes   Firefox           days each; a year pre-generated
                                                                      from a schedule secret
  WebRTC data channel,      site-signed DTLS        all, incl. Safari box is ICE-lite with static
  signalling-free           fingerprint + static                      credentials; device builds the
                            ICE credentials                           remote SDP; app-layer device auth
  WebSocket over HTTPS      public or fleet CA      all               only while a shell certificate
                                                                      is valid
```

The device prefers them in that order. Parameters ride in the QR and are refreshed at every contact. Box-as-network mode is the default: the box is the Wi-Fi, DHCP, and DNS, and a captive landing page lists live classes. A project-run public origin for the shell, and the Local Network Access handling it needs, are deferred to the second release; in the first release a lapsed certificate means no new devices until renewal, and the design says so.

**Rationale**: Class continuity no longer depends on the web PKI. On Windows lab PCs and loaned laptops, hash-pinned WebTransport covers the fleet; WebRTC is the universal fallback because WebKit rejects hash pinning and the W3C group has an open issue on removing it.

**Spikes before this is relied on**: signalling-free WebRTC to an ICE-lite box with static credentials; Firefox's handling of `serverCertificateHashes`; the address space Chrome assigns to a document served from a service worker cache while offline.

### D13. Time

**Decision**: Lamport clocks order everything. Box time from NTP, then the hardware clock, then an attestation from a staff device at boot, then last persisted time, never backwards. The Pi 5 with its clock battery is the reference hardware. Devices keep a high-water mark for the rollback guard. Due dates are advisory.

### D14. Data protection by partition, key destruction, and drop

**Decision**: Learner data only in learner logs and learner-owned documents. Random record key per learner, wrapped to the learner's and their teachers' devices; learner-log payloads and learner bundles encrypted under it. Retirement and retention destroy the key after a hold, then delete ciphertext and drop plaintext documents with signed acknowledgements. Chat messages and collaboration edits are class data and are tombstoned on retirement. The spec speaks of the school's own country's law.

### D15. Recovery

**Decision**: Install-time recovery bundle (site key, ACME account key, directory key, transport schedule secret, DTLS key) under a passphrase, file plus printable QR, nagging until confirmed, a drill; rebuild pulls replicas from devices; succession by an administrator device when no bundle exists, with store re-issue of tokens to the new site key; learner record keys return by re-wrapping from staff devices or from the encrypted directory backup.

### D16. Pack bytes over a resumable content-addressed fetch

**Decision**: Packs are fetched by hash over whichever transport the device is using, gated by lease, resumable by range so that a patchy store download or a dropped LAN transfer continues rather than restarts. Never Automerge documents.

### D17. Launched content: cmi5 and SCORM in the first release

**Decision**: The runtime launches cmi5 and SCORM 1.2 and 2004 packages, licensed or teacher-imported, with commit-granularity logging, attempts bound to the starting device, and ADL SCORM-profile statements. cmi5 is the recommended packaging for new publisher content.

### D18. Content import as viewers, not conversions

**Decision**: PDF viewer, EPUB reader, SCORM and cmi5 runtime, QTI into native items. Everything else refused with guidance to save as PDF. Site tier by default; a teacher may declare an import open with a licence; the source hash is recorded.

**Rationale**: Teachers here have files; converting Word or PowerPoint is lossy and rarely wanted; a scanned textbook chapter must never default towards the commons.

### D19. The item engine

**Decision**: A native item model (single and multiple choice, true or false, ordering, matching, text entry, numeric entry, extended text), an offline player, auto-marking on the device with results as learner-log operations and xAPI statements, teacher override, teacher authoring, unlimited attempts by default, immediate feedback by default, and an explicit formative boundary: answer keys reach the device and are extractable.

**Rationale**: QTI import without a player is pointless, and a player without authoring frustrates the teachers who will want to write their own questions the same week.

### D20. Default open licence (provisional)

**Decision**: CC BY-SA 4.0 when a teacher declares content open, overridable per site. See open question 3.

### D21. Compaction and durability

**Decision**: Open and site content documents keep history with an optional squash; class and site logs seal epochs; learner logs are retired by key destruction; LRU by document identifier with budgets. The box writes crash-safely, checks and repairs storage on boot, minimises flash write amplification, and counts unclean shutdowns.

**Rationale**: Power goes off mid-lesson in the target schools. A corrupted SD card would take the site with it, and the recovery bundle exists for drive death, not for a daily event.

### D22. The class lifecycle, with start as the publish step

**Decision**: Create produces the class document, class log, short URL, and code. Start makes the URL live and the code valid and publishes the content; stop invalidates the code and pauses chat; end makes the class read-only. Content can be added at any time and reaches devices at their next contact. Teachers see an overview that works from their own replicas.

**Rationale**: This is the loop the interview described, and start gives the CRDT layer the publish step the brief said it lacked.

### D23. Chat as class-log operations

**Decision**: Messages are immutable class-log records ordered logically, attributed by learner reference, displayed with names from the roster snapshot, queued offline, hidden by teacher tombstones, paused by a teacher operation.

**Rationale**: The class log already syncs to every member and already has the moderation and concurrency semantics chat needs. A separate chat system would be a second sync path.

### D24. Localisation

**Decision**: English and Spanish complete at launch; strings externalised; a language is added by a translation file; the interface language is per device; content language is a tag per pack and a field per document; locale formatting follows the interface language.

### D25. Positioning against Kolibri

**Decision**: The proposal names Kolibri as the comparator and states the three differences: collaborative documents, commercial packs that go home on loan, and the stock-room licence model.

**Rationale**: Reviewers, buyers, and NGOs in these regions will ask. Answering in the founding document is cheaper than answering in every meeting.

### D26. Release split

**Decision**: This change specifies the first release. `extend-platform-second-release` specifies forking, signed lineage, and the commons registry; QTI and Common Cartridge export and Common Cartridge import; OneRoster and MIS import; passkey-backed staff identity; the wrapped client for managed iPads; the project-run public origin; and the hosted variant. Splitting keeps archive of this change from creating main specs for things that were not built.

### D27. Keyhive is the intended successor for access control, not the foundation

**Decision**: Ink & Switch's Keyhive and the Beelay sync protocol target exactly the excluded problem, but they are pre-alpha and unaudited. This platform builds the star topology, share policy, and per-learner keys itself, shaped so Keyhive can replace them later: per-document and per-learner symmetric keys wrapped to device keys, signed delegations recorded as operations, and no assumption that the box can read every document.

## Threat model and residual risk

The platform's licensing controls are deterrence and traceability. The table records what each control actually achieves against each adversary.

```
  Asset                 Adversary                    Control                          Residual risk (accepted)
  --------------------- ---------------------------- -------------------------------- --------------------------------
  Licensed plaintext    Student with a leased        Site copy encrypted; keys in     Modified client can dump plain-
                        device, modified client      lease scoped to class packs;     text. Leak traces to the site
                                                     render in memory only; water-    via the watermark. Video traces
                                                     mark on images/text; overlay     only if the overlay survives
                                                     on video                         capture.
  Licensed plaintext    Teacher (holds site copy     Same, plus licence terms and     Teachers are trusted more than
                        keys legitimately)           the lease register               the design can enforce.
  Pack ciphertext       Anyone with a USB copy       Inert without licence; content   None; the ciphertext is not
                                                     key wrapped to the site key      secret.
  Publisher content key Attacker with the box's      Never leaves the box; box data   Box compromise exposes every
                        storage                      partition encrypted              pack at that site.
  Licence scope         School serving more than     A licence is per box; the LAN    A chain could run one box for
                        one school from one box      is the natural limit             several sites. Priced, not
                                                                                      policed.
  Lease expiry          Student who never returns    Local clock check; rollback      A modified client renders
                                                     guard; grace bound               forever.
  Revocation            Offline device               Not renewable; keys discarded    Renders until grace ends.
                                                     on next contact
  Answer keys           Student with a modified      None; formative boundary stated  Quizzes are practice; the
                        client                                                        platform never claims otherwise.
  Class chat            Learner posting abuse        Teacher hide and pause; every    Hidden messages remain in the
                                                     message attributed               log until the class is retired.
  Previous borrower's   Next borrower of a loaned    Check-in destroys keys and       A laptop that skips check-in
  data                  laptop                       drops replicas at the box        carries the previous borrower's
                                                                                      data behind a PIN only.
  Open commons          Person laundering licensed   No document form; no import      Retyping and screenshots cannot
                        content                      path into open documents;        be stopped. Traceable.
                                                     watermark
  Learner records       Lost or stolen device        Payloads under the learner       A device holding the key that
                                                     record key; key destruction on   never returns keeps readable
                                                     retirement                       records; nothing else does.
  Learner records       Stolen box storage, backups, Encrypted partition; payload     Key store on the same device if
                        successor box, sealed epochs ciphertext without the key store unattended boot is required
                                                                                      (open question 6).
  Learner documents     Lost or stolen device        OS storage protection; drop on   Plaintext text CRDTs on a device
  (Automerge text)                                   next contact; pseudonymous refs  that never returns are
                                                                                      unrecoverable and undeletable.
  Log integrity         Modified client removing     Signatures; history check;       Not Byzantine-tolerant.
                        or forging records           box restores
  LAN transport         Attacker on the LAN          Site key pinning via QR and      A first join by typed code over
                        impersonating the box        signed transport parameters      the hostname trusts DNS and the
                                                                                      shell certificate once.
  Application shell     Compromise of the project's  Box verifies the shell against   The release pipeline is a
                        release pipeline             the root-signed release          supply-chain trust point.
  Site authority (MDM)  Leaked site CA key           X.509 name constraints; MDM-only A device that ignores name
                                                     distribution                     constraints trusts it for any
                                                                                      name. Modern browsers enforce.
```

### Offline-first versus licence enforcement

```
  Enforcement need        What offline-first breaks             Resolution and bound
  ----------------------- ------------------------------------- -------------------------------------------
  Licence per box         Nothing: no counting, no allocation   The box is the unit; the LAN is the limit
  Dated licence end       No trusted clock anywhere             Local clocks + rollback guard; bound = grace
  Revocation              Offline device cannot be reached      Bound = remaining lease + grace (<= 37 days
                                                                by default)
  Lease expiry            Clock rollback, data reset            Guard; reset also destroys the lease
  No relay outside site   Packs travel by USB anyway            Only the site copy is controlled; no
                                                                external sync peer exists
  Watermark               Client can strip                      Box-side site copy marks images and text;
                                                                video has only the visible overlay
  Publisher key revoke    Status list needs delivery            Travels with packs/tokens
  Audit for publishers    Log lives at the site                 Publishers see it only if the site shares it
```

## Risks / Trade-offs

- **Risk: hash-pinned WebTransport is removed from the standard or from Chromium.** Mitigation: signalling-free WebRTC is built regardless; WebSocket over a valid certificate remains.
- **Risk: signalling-free WebRTC fails the spike.** Mitigation: on Chromium fleets WebTransport suffices; other browsers fall back to the certificate path; the design degrades to the previous draft, not to nothing.
- **Risk: a lapsed certificate blocks onboarding for weeks at a school with no hotspot.** Mitigation: the site authority for managed fleets; the public origin in the second release; warnings at 30, 14, and 7 days.
- **Risk: certificate lifetimes shrink faster than connectivity improves.** Mitigation: affects onboarding and updates only.
- **Risk: power loss corrupts the box.** Mitigation: crash-safe writes, boot-time repair, flash-aware storage, the recovery bundle, and replicas on every device.
- **Risk: the QTI subset disappoints a publisher.** Mitigation: unsupported interactions are reported by name; the subset is an open question for the first publisher.
- **Risk: self-registration produces messy directories.** Mitigation: merge, rename, remove, and pre-created lists; the teacher owns the list as they own a register.
- **Risk: chat becomes a safeguarding problem.** Mitigation: attribution, hide, pause, and retention; whether chat is on by default is an open question.
- **Risk: log growth outpaces a Pi's memory.** Mitigation: per-learner partitioning, bytes-encoded records, epoch sealing, LRU eviction, size budgets.
- **Risk: a modified client is the whole threat model for licensing.** Mitigation: none beyond what is written above; publisher agreements must reflect it.
- **Risk: a lost recovery bundle strands every licence and the transport identity.** Mitigation: nagging until confirmed, drills, succession plus store re-issue and QR re-admission.
- **Risk: learner record keys are lost when the box and all staff devices are lost together.** Mitigation: the optional encrypted directory backup; otherwise the records are unrecoverable, which equals deletion and is acceptable for formative data.
- **Risk: publishers reject per-box licences without device caps.** Mitigation: price by school band at the store; a device cap could be added to the token later without changing the platform.
- **Trade-off: star topology means no sync when the box is off.** Accepted.
- **Trade-off: site copies double pack storage on the box.** Accepted for key separation.
- **Trade-off: the box holds every learner record key.** Accepted; the box already holds the directory, and Keyhive would relax this later.
- **Trade-off: three transports to build and test.** Accepted; two are needed for browser coverage regardless.
- **Trade-off: no cross-site sharing in the first release.** Accepted; export by file exists, and the commons is specified for the second release.

## Migration Plan

Not applicable: this is a greenfield specification with no existing deployment. Delivery sequencing will be captured in `tasks.md` when the specification is accepted; it is deliberately absent from this change.

## Open Questions

Genuinely open decisions, with a recommendation where the evidence supports one. Items 1, 2, and 3 should be settled before implementation planning; the rest can be resolved during it.

1. **Launch publishers and pack tooling.** Who produces the first packs, in what source formats, and whether they will accept a per-box site licence without device caps. This decides the pack authoring toolchain and the QTI interaction subset.
2. **Transport spikes.** Signalling-free WebRTC to an ICE-lite box; Firefox hash pinning; the service-worker address-space check. Their outcomes decide how much the certificate path still matters.
3. **Default open licence.** Recommend CC BY-SA 4.0 when a teacher declares content open, with per-site override.
4. **Chat defaults.** Whether chat is on by default for every class, and whether a minimum age or a teacher opt-in is needed under local safeguarding expectations.
5. **Retention defaults.** One year after the academic year is a placeholder; the data-protection template a school adapts to its country should drive it.
6. **Box disk encryption key handling.** Unattended boot on a Pi without a TPM means the key is on the device. Recommend accepting the residual and documenting it, with passphrase boot as an option.
7. **Box runtime packaging.** Bun compile versus Node single-executable; decide on Pi memory footprint, Automerge WASM start-up, and which WebRTC library builds cleanly.
8. **Code signing route.** Azure Trusted Signing versus an OV/EV certificate for Windows.
9. **Publisher key-status cadence.** How often status lists are cut and whether packs embed the latest list at build time.
10. **Signing algorithm floor.** Whether any target lab PCs run browsers without Ed25519 in Web Crypto.
11. **Student phones.** Whether Android phones are a supported home device. The browser client would work; the question is whether to test and support it.
12. **Power profile of target schools.** How often power fails and whether a battery for the box should be part of the reference kit.
13. **Pack size budget and per-device cap defaults.** Depends on launch packs' media and the loaned laptops' storage.
14. **Publisher visibility of licence audit trails.** Whether publishers get any view of activation history, and through what channel, given data stays on the box.
15. **Directory backup to administrator devices.** Whether the encrypted keyring and directory backup is on by default.
16. **Dated licences.** Whether any launch publisher needs an end date at all; if none does, the validity window could be dropped from the first token format.
