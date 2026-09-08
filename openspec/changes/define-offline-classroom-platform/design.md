## Context

See `proposal.md` for motivation and the capability list. This document records how the platform fits together, where the originating brief was challenged, the decisions taken with their alternatives, an honest threat model, and the questions that remain open.

Constraints that shape everything below:

- **Automerge and automerge-repo are the sync foundation.** No new sync protocol. automerge-repo has no per-change access control: a document identifier plus a connection is a bearer capability, and the only policy hook is whether to share a document with a peer at all.
- **Automerge history is append-only.** Deleting inside a document leaves tombstones; forgetting is only possible by dropping or squashing whole documents.
- **Every client is untrusted.** A PWA on a student's device can be modified, its storage read, its clock changed. Nothing in this design assumes a tamper-proof client.
- **The box is a Raspberry Pi or cheap laptop**: limited memory, possibly no battery-backed clock, storage that can die, and a network the school may not control.
- **Secure context is required** for service workers and Web Crypto, and no public CA issues certificates for private addresses. IndexedDB itself does not need HTTPS; the brief's phrasing overstated that.
- **Out of scope** (from the proposal): summative assessment, capability-based authorisation and revocation under eventual consistency, federated identity, authoritative wall-clock time, payment internals.

### System shape

```
                       internet (intermittent)
   +-------------+   +-----------------+   +------------------+
   |  registry   |   |  licence store  |   |  commons relay   |
   |  DNS zone + |   |  (external,     |   |  (optional,      |
   |  ACME DNS-01|   |   signs tokens) |   |   open tier only)|
   +------+------+   +--------+--------+   +---------+--------+
          |                   |                      |
   .......|...................|......................|..............
          |        school LAN or box-provided Wi-Fi   |
          v                   v                      v
   +----------------------------------------------------------+
   |  BOX  (always-on peer, stable address, durable storage)  |
   |  site key | pack store | lease register | directory (PII)|
   |  share policy | fold cache | LRU doc cache | TLS cert    |
   +---------+---------------------+---------------------+----+
             |  wss:// + blob fetch |                     |
      +------+------+       +-------+------+      +-------+------+
      | teacher dev |       | student dev  |      | shared device |
      | admin/teach |       | one learner  |      | learner PINs  |
      | roster snap |       | leases, docs |      | N leases      |
      +-------------+       +--------------+      +---------------+
                  (star topology: devices talk only to the box)
```

### Document families and tiers

```
                    | open tier          | site tier            | licensed tier
  ------------------+--------------------+----------------------+------------------
  content documents | Automerge, fork-   | Automerge, bound to  | (none: licensed
  (structural merge)| able, commons OK   | site, never exported | material is never
                    |                    | teacher derivatives, | a document)
                    |                    | learner work         |
  ------------------+--------------------+----------------------+------------------
  bundles           | plaintext media,   | plaintext media for  | signed+encrypted
  (content address, | OER SCORM zips     | site docs            | packs; site copy
   never merged)    |                    |                      | with watermark
  ------------------+--------------------+----------------------+------------------
  logs              | (none)             | site log, class logs,| (licence events
  (signed op set,   |                    | learner logs         |  live in the site
   fold on read)    |                    |                      |  log, box-signed)
```

## Where the brief was challenged

Each item states what the brief assumed, why it does not hold, and what the specs do instead.

1. **Lease expiry and validity windows are wall-clock enforcement on an untrusted clock.** The brief excludes anything needing authoritative time, yet expiry is exactly that. Resolution: the specs distinguish *fairness* uses of time (deadlines, excluded) from *deterrence* uses (leases, included), judge every time check against the verifier's own clock, add a clock-rollback guard, and state the enforcement bound explicitly: an offline device renders until lease grace ends, whatever has happened at the box.

2. **"Internet only at install and 90-day renewal" is eroding.** CA/Browser Forum ballot SC-081 caps certificate lifetimes at 200 days from March 2026, 100 days from March 2027, and 47 days from March 2029. The real requirement becomes "a few minutes of internet every two to four weeks". The secure-context spec assumes 47 days, renews at one third remaining, warns at 30/14/7 days, and documents hotspot renewal.

3. **Public DNS to a private address does not survive an upstream outage and is blocked by rebinding protection.** Once the resolver's cache expires, `pi-7f3a9c.example.org` stops resolving, so LAN sync stops even though the box is on. Many routers (dnsmasq `stop-dns-rebind`, OpenWrt, pfSense, Fritz!Box) refuse public names that resolve to private addresses. The specs add a box-as-network mode (the box is the classroom Wi-Fi, DHCP, and DNS, and answers its own name offline) as the reliable configuration, keep join-existing-LAN as the alternative with installer checks, and state honestly that in LAN mode sync during an outage depends on the school's resolver.

4. **Let's Encrypt rate limits.** Fifty certificates per registered domain per week means the hostname zone cannot scale as a plain subdomain. The zone must be on the Public Suffix List, have a rate-limit arrangement, or spread across authorities. This is an operational prerequisite, now a requirement.

5. **Fully disconnected schools cannot be served by any public-CA design.** The certificate is the one hard periodic-internet dependency. The design records the fallbacks (hotspot renewal; if never possible, a native client or a local CA root, which the brief rejects) rather than pretending the PWA path covers them.

6. **"Attachments are the licensed family" is too neat.** Open-tier media and openly licensed SCORM zips are also opaque bundles. The families are now by *representation* (document, bundle, log) with *tier* orthogonal, and a **site tier** was added for teacher derivatives and learner work, which are neither commons nor commercial.

7. **A single class-wide state log conflicts with per-student deletion.** Submissions and marks in a class-wide document cannot be dropped per learner. The log family is split into site, class, and learner logs; learner logs and learner-owned documents are the droppable unit.

8. **"Append-only list" is the wrong Automerge structure.** List position carries no meaning, concurrent appends interleave by actor order, and xAPI already deduplicates by UUID. The log is a map keyed by operation identifier (a grow-only set) with explicit logical ordering fields, and operation bodies are stored as signed canonical bytes to keep Automerge overhead per record small.

9. **Device identity is not student identity.** UK primaries run shared class sets of tablets used by several classes a day. The identity spec adds shared devices with learner sessions (display name plus PIN, weak by design and acceptable for formative work), seats are counted per learner, and leases are per device and learner.

10. **"Licensed material must not be mergeable into open documents" cannot be enforced against copying.** It is enforced structurally (no document form for licensed content, no import path, typed references, quarantine of open documents that reference packs) and the residual (retyping, screenshots) is handled by watermark traceability and licence terms. The spec says so rather than claiming prevention.

11. **"Sync must refuse to relay packs outside the site" while packs are sideloadable by USB.** The ciphertext is not secret; the rule is that the platform is not a distribution channel and that the *site copy* (which carries the site watermark and site key) goes only to leased peers. Specified as relay-to-leased-peers-only.

12. **"Peers are symmetric" plus access control is the excluded problem.** automerge-repo's share policy is the only control, and a student-to-student mesh with per-document entitlement is capability-based authorisation under eventual consistency, which the brief excludes. The initial platform is a star through the box; the protocol stays symmetric so mesh can come later.

13. **"Publisher public key embedded at install" needs a level of indirection.** Onboarding a publisher would otherwise need a platform release. The embedded key is a project root that certifies publisher keys, with a signed key-status list for revocation.

14. **The box is "just a peer" for documents only.** For licensing, identity, PII, certificates, and DNS it is a privileged trust anchor whose key loss would strand every licence. The recovery spec adds an install-time recovery bundle, box succession, and store re-issue.

15. **Raspberry Pi 4 has no real-time clock.** A box that boots offline has no idea what time it is, which breaks lease issuance and ACME. A time-source hierarchy is specified.

16. **Client-side watermarking is strippable.** The box produces a watermarked, re-encrypted site copy at activation, so leaked bytes already carry the site mark regardless of client tampering; the visible per-page mark remains as a second, weaker layer.

17. **Purchase "online" and a box with no connectivity.** Tokens are small; the specs allow delivery by file, paste, or QR from a phone that made the purchase, so the licence path is fully offline for the box. Only the certificate is not.

18. **Lease renewals as log operations would flood the log** (30 devices, daily). Seat allocation is logged; renewals live in a box-side register; only loss after grace is logged.

19. **Browser storage on iOS threatens "full replica on every device".** Persistent storage is requested and reported, packs are cached selectively under a cap, and the teacher can see at-risk devices.

20. **xAPI actors are PII by default.** Actors use the account form with the site as home page and the learner reference as name, and roster names never enter the CRDT layer.

21. **OneRoster is the right model but not what UK MIS export.** SIMS, Arbor, and Bromcom typically integrate through intermediaries; the roster spec adds a generic column mapping and leaves connectors open.

## Goals / Non-Goals

**Goals:**
- One fold implementation shared by every peer so state is identical everywhere.
- Every licence and identity decision verifiable offline against keys the peer already holds.
- Every cross-boundary flow (open to commons, licensed to devices, learner data to teachers) governed by one share policy that is stated, not emergent.
- Every unavoidable weakness written down next to the control that bounds it.

**Non-Goals:**
- Preventing a determined person with a leased device from extracting plaintext. Deterrence and traceability only.
- Byzantine fault tolerance among peers. Tamper-evidence with the box as the recovering replica.
- Real-time presence or cursors in the initial platform.
- Mesh sync between student devices.
- A general-purpose LMS feature set beyond what the capabilities name.

## Decisions

### D1. TypeScript throughout; the box is a single compiled binary

**Decision**: One TypeScript monorepo: PWA client, box server, and a shared package holding the operation DSL, the fold, the share policy, and the crypto helpers. The box binary is produced with a single-file compiler for the runtime (Bun `--compile` or Node single-executable) with web assets embedded.

**Rationale**: The fold and the share policy must be byte-for-byte identical on every peer; one implementation removes a whole class of divergence bugs. automerge-repo's reference implementation is TypeScript and is the one the browser must use anyway. Rust's automerge-repo is younger and would mean two fold implementations.

**Alternatives**: Rust box with the TypeScript client (rejected for the divergence reason, revisit if a Pi cannot keep up); Java (excluded: core-only bindings, no repo layer).

### D2. Star topology in deployment, symmetric protocol

**Decision**: Devices connect only to the box. The box relays. Devices refuse non-box peers until a site setting enables mesh.

**Rationale**: The only access control automerge-repo offers is share policy; enforcing it in one place is tractable, in thirty places under eventual consistency it is the excluded problem. Recovery still works because the new box pulls from devices.

**Alternatives**: Full mesh with per-device share policy (deferred); box-plus-mesh only for open documents (plausible later, since open documents have no entitlement rules beyond site membership).

### D3. Three log instances and a keyed operation set

**Decision**: Site log, class logs, learner logs. Each is an Automerge map from operation UUID to a bytes value containing the canonically encoded, signed record. Ordering is by (Lamport, signer key, sequence). Each signer chains its own records by previous-hash.

**Rationale**: Per-learner partitioning is the only deletion mechanism Automerge allows. A keyed set makes duplicates idempotent and removes list-interleaving surprises. Storing records as bytes keeps Automerge's per-field overhead off a log that may reach hundreds of thousands of records, and signatures cover exactly the stored bytes.

**Alternatives**: One class-wide list (the brief; rejected for deletion and size); one Automerge map per field of each record (rejected for memory); a non-Automerge log synced separately (rejected: it would be a new sync protocol).

### D4. The operation DSL

**Decision**: Operation types are declared once in the shared package: name, schema version introduced, payload schema, authorisation predicate (role at logical time), and reducer. The fold is generated from these declarations. Peers report their supported schema version in the sync handshake and in a periodic site-log heartbeat; the box refuses to raise a log's minimum version while any admitted device reports an older one, unless overridden.

**Rationale**: Concurrency semantics have to be explicit per type; a table of declarations is auditable in a way that scattered reducers are not. Unknown types skip and count, so an old device shows "n updates need a newer version" rather than crashing or silently diverging.

**Alternatives**: Free-form JSON operations with ad-hoc handling (rejected); Automerge-native structures with last-writer-wins for marks and enrolment (rejected; the brief is right that these need explicit semantics).

### D5. Key hierarchy

```
   project root key (embedded at install; rotates via signed platform update)
        |
        +--> publisher keys (certified by root; carried in packs and tokens)
        |        |
        |        +--> pack manifests (signed)
        |        +--> licence tokens (signed; wrap pack content key to site key)
        |        +--> key-status lists (revocation)
        |
   site key (box; site identity; signs admissions, licence ops, leases,
        |     roster snapshots; recovery bundle holds it)
        |
        +--> per-pack site keys  = HKDF(site master secret, pack address)
        |        (encrypt site copies; wrapped to device keys in leases)
        |
        +--> device keys (generated on device; admitted into the site log)
```

**Decision**: Ed25519 for all signing keys where the platform's Web Crypto supports it, with ECDSA P-256 accepted for devices that lack it; key identifiers carry an algorithm prefix so the fold verifies either. Per-pack site keys are derived, not stored, so a recovery bundle restores them.

**Rationale**: Ed25519 shipped in the major engines by 2025 and is what the rest of the stack expects; P-256 is the universal fallback. Deriving per-pack keys keeps the recovery bundle small and complete.

**Alternatives**: A single algorithm (simpler fold, risks excluding older school devices); random per-pack keys stored on the box (lost with the box unless backed up separately).

### D6. Site copy produced by the box at activation

**Decision**: The box decrypts the publisher payload once, embeds a site watermark in media (robust marking where the media type supports it) and a visible-mark configuration for rendered text, re-encrypts under the per-pack site key, keeps the publisher ciphertext for reprocessing, and serves only the site copy. The publisher content key never leaves the box.

**Rationale**: Anything the client does can be undone by a modified client; anything the box does before bytes reach a device cannot. It also means the publisher master key is never on a student device.

**Alternatives**: Client-side watermarking only (weak); per-device site copies (strongest traceability, but re-encoding a pack per device is beyond a Pi and a per-device copy per learner on shared devices is unworkable). Per-device identity is carried in the visible mark instead.

### D7. Lease defaults

**Decision**: 30 days sliding, renewed on every contact; 7 days grace with a persistent notice; capped by licence not-after; publishers and administrators may only lower the defaults; per (device, learner).

**Rationale**: UK half-terms are two weeks and the longest common absence short of summer is about three weeks; 30 days covers every break except summer, when expiry is acceptable. Seven days of grace absorbs a missed first week back. Sliding renewal means a device that attends school never notices leases exist.

**Alternatives**: 14 days (expires during a half-term plus a week of illness); 90 days (revocation bound becomes a full term, publishers will object); fixed rather than sliding (needs teacher action).

### D8. Seats per learner, leases per device

**Decision**: Seat allocation is keyed by learner reference; leases by device key. A learner with two devices uses one seat; a shared device carries one lease per learner session.

**Rationale**: This matches how publishers actually price and how schools actually deploy devices. It also means a lost device costs nothing against the seat count.

**Alternatives**: Seats per device (the brief's implicit model; double-charges home plus school devices and cannot express shared sets).

### D9. Licence operations are box-signed only

**Decision**: The fold accepts activation, seat allocation and release, expiry observation, deactivation, and revocation only when signed by the site key. The box serialises them locally.

**Rationale**: A single writer for seat allocation removes concurrent over-allocation by construction, which is the one licence property that must hold under eventual consistency without capability machinery. Multi-box sites are therefore a per-box or split-token matter (open question).

### D10. Identity without an identity provider

**Decision**: Device keypairs, admission by short-lived codes bound to role and class, roles held in the site log, revocation as an operation, replacement devices admitted against the same learner reference, and an attribution handle separate from any roster identity. Shared devices use learner sessions with a teacher-set PIN.

**Rationale**: No passwords to reset, no accounts to provision, nothing to phish. The fold already verifies signatures, so role authority comes for free. The attribution handle is what leaves the site with open content; it is chosen, not derived, so no roster data can leak through provenance.

**Alternatives**: Passwords (rejected by the brief; also unworkable for six-year-olds); federated login (excluded).

### D11. Roster as replaceable signed snapshots outside the CRDT

**Decision**: Learner references are random and stable by source identifier. Names, year groups, and source identifiers travel only as site-signed, device-encrypted, versioned snapshots stored outside the document repository, scoped by role, deleted on revocation.

**Rationale**: PII in an append-only CRDT is PII forever. Roster data has a single source (the MIS via the box) so it needs no merge; wholesale replacement is simpler and deletable. Teachers still see names offline.

**Alternatives**: A roster Automerge document (rejected: append-only); names only on the box (rejected: teachers need them offline).

### D12. Secure context: registry plus DNS-01, two network modes

**Decision**: Random per-box hostnames in a project zone; the box registers its LAN address using its site key; the registry answers DNS-01 challenges through CNAME delegation of the challenge label (the acme-dns pattern) so the box owns its ACME account and private key. Two network modes as specified. The zone goes on the Public Suffix List before scale-out.

**Rationale**: It is the only design that yields a publicly trusted certificate for a private address without touching client devices. Box-as-network mode is what comparable offline classroom projects converge on because it makes DNS, DHCP, and outages the box's problem rather than the school's.

**Alternatives**: Local CA root (rejected by the brief; recorded as the only fully offline option); Let's Encrypt IP certificates (2025, public addresses only, six-day lifetime; not applicable); a cloud relay as the origin (rejected: not offline-first); native apps (avoids secure context entirely; kept as the fallback for permanently disconnected sites).

### D13. Time

**Decision**: Lamport clocks order everything. The box takes time from NTP, then a hardware clock, then an attestation from an administrator or teacher device at boot, then its last persisted time, never going backwards. Devices keep a high-water mark and suspend licensed rendering if their clock falls more than an hour behind it.

**Rationale**: Ordering must not depend on clocks that are routinely wrong. The rollback guard raises the cost of the obvious attack without pretending to stop it: clearing site data removes the mark and the lease together.

### D14. Data protection by partition, drop, and squash

**Decision**: Learner data only in learner logs and learner-owned documents; retirement is an operation that stops replication, deletes after a hold, and instructs peers to drop with signed acknowledgements; retention defaults to one year after the academic year; in-document deletion is described honestly as tombstoning.

**Rationale**: These are the only true deletion primitives Automerge allows, so the data model is arranged around them rather than fighting them.

### D15. Recovery

**Decision**: Install-time recovery bundle (site key, ACME account key, directory key) under a passphrase, file plus printable QR, with nagging until confirmed and a drill; rebuild pulls replicas from devices; succession by an administrator device when no bundle exists, with store re-issue of licences to the new site key.

**Rationale**: Open documents and logs are recoverable from the class by construction. Keys are not, and the licence anchor is a key, so the bundle is the difference between a bad afternoon and re-buying every pack.

### D16. Pack bytes over a content-addressed fetch, not a document

**Decision**: Packs are fetched by hash over the same authenticated TLS origin, gated by lease. They are never Automerge documents.

**Rationale**: automerge-repo syncs documents; a multi-gigabyte encrypted zip is not one. A hash fetch is not a sync protocol, so this respects the brief's constraint.

### D17. SCORM runtime

**Decision**: The client exposes the SCORM 1.2 and 2004 API objects; the in-memory data model commits to the learner log on commit or terminate and on a bounded interval; the service worker serves the package's files from the decrypted in-memory site copy under a per-launch virtual path. Attempts are bound to the starting device. Completion, success, and score also emit ADL SCORM-profile xAPI statements.

**Rationale**: SetValue is called constantly; logging each call would swamp the log. Attempt-per-device avoids concurrent-attempt merges that SCORM has no semantics for.

### D18. Interchange

**Decision**: Import always produces open or site documents (never licensed), requires a tier and licence declaration, and records the source hash; export is gated by tier with placeholders for licensed references and a lossiness report.

**Rationale**: The import path is a laundering path if unguarded; the declaration and provenance make it accountable without pretending to verify rights.

### D19. Default open licence (provisional)

**Decision**: Provisional platform default of CC BY-SA 4.0 for open-tier content, overridable per site, with the fork rule that share-alike cannot be dropped. See open question 3.

**Rationale**: Share-alike keeps forks in the commons, which is the point of the open tier. The cost is that share-alike content cannot be combined into a derivative with licensed content; the reference-not-embed rule for site-tier documents avoids that in practice.

### D20. Compaction

**Decision**: Open documents keep full history with an optional squash fork recorded in provenance; class and site logs seal epochs with a site-signed snapshot; learner logs and documents squash at retention boundaries; LRU by document identifier with configurable budgets on box and device.

**Rationale**: Each family has a different reason to keep or shed history: lineage, audit, and deletion respectively.

## Threat model and residual risk

The platform's licensing controls are deterrence and traceability. The table records what each control actually achieves against each adversary.

```
  Asset                 Adversary                    Control                          Residual risk (accepted)
  --------------------- ---------------------------- -------------------------------- --------------------------------
  Licensed plaintext    Student with a leased        Site copy encrypted; keys in     Modified client can dump plain-
                        device, modified client      lease; render in memory only;    text. Leak traces to the site
                                                     no durable plaintext; watermark  via the watermark, not to the
                                                                                      student.
  Licensed plaintext    Teacher (holds site copy     Same, plus licence terms and     Same. Teachers are trusted more
                        keys legitimately)           audit trail of who was leased    than the design can enforce.
  Pack ciphertext       Anyone with a USB copy       Inert without licence; content   None beyond storage cost; the
                                                     key wrapped to site key          ciphertext is not secret.
  Publisher content key Attacker with the box's      Never leaves the box; box data   Box compromise exposes every
                        storage                      partition encrypted              pack at that site.
  Seat limits           Site trying to over-use      Box is the only allocator;       A modified box binary could
                        seats                        allocation logged and signed     ignore limits. Audit log helps
                                                                                      publishers only if they see it.
  Lease expiry          Student who never returns    Local clock check; rollback      Clock manipulation with data
                                                     guard; grace bound               reset extends nothing; a
                                                                                      modified client renders forever.
  Revocation            Offline device               Not renewable; keys discarded    Renders until grace ends; no
                                                     on next contact                  faster path exists offline.
  Open commons          Person laundering licensed   No document form; no import      Retyping and screenshots cannot
                        content                      path; quarantine; watermark      be stopped. Traceable, reportable.
  Lineage/attribution   Person stripping authors     Tamper-evident against history;  Fresh retyped copy has no lineage
                        from a fork                  commons refuses unverified       and cannot be detected.
  Learner data          Lost or stolen device        OS storage protection; drop on   Data on a device that never
                                                     next contact; pseudonymous refs  returns is unrecoverable and
                                                                                      undeletable.
  Learner data          Stolen box storage           Encrypted data partition         Key material on the same device
                                                                                      if unattended boot is required
                                                                                      (open question 8).
  Log integrity         Modified client removing     Signatures; history check;       Not Byzantine-tolerant: relies on
                        or forging records           box restores; forged keys fail   the box replica and on device
                                                     authorisation                    keys not being extracted.
  Certificate/hostname  Attacker on the LAN          TLS to the hostname only; key    A spoofed AP in box-as-network
                                                     pinned site identity for sync    mode could serve a phishing page
                                                                                      at another name; not the box's
                                                                                      hostname.
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
                                                                is not secret
  Watermark               Client can strip                      Box-side site copy marks bytes before they
                                                                leave; visible mark is the weaker second layer
  Publisher key revoke    Status list needs delivery            Travels with packs/tokens; until then old
                                                                keys verify
  Audit for publishers    Log lives at the site                 Publishers see it only if the site shares it
                                                                (not designed here)
```

## Risks / Trade-offs

- **Risk: certificate lifetime shrinks faster than schools' connectivity improves.** Mitigation: 47-day assumption now, hotspot renewal flow, expiry degraded mode that keeps local work alive, native client kept as the fallback plan.
- **Risk: join-existing-LAN mode fails silently on school networks with rebinding protection or short-lived resolver caches.** Mitigation: installer checks with the exact exception to request; box-as-network mode recommended by default on the Pi image.
- **Risk: the hostname zone hits CA rate limits at scale.** Mitigation: Public Suffix List listing (months of lead time), rate-limit arrangement, multi-CA fallback; treat as a launch prerequisite.
- **Risk: iOS storage eviction or quota loses unsynced student work.** Mitigation: persistent-storage request and reporting, install-to-home-screen guidance, selective pack caching, teacher visibility of at-risk devices.
- **Risk: log growth outpaces a Pi's memory.** Mitigation: per-learner partitioning, bytes-encoded records, epoch sealing, LRU eviction, size budgets.
- **Risk: a modified client is the whole threat model for licensing.** Mitigation: none beyond what is written above; the design refuses to claim otherwise, and publisher agreements must reflect it.
- **Risk: a lost recovery bundle strands every licence.** Mitigation: nagging until confirmed, drills, succession plus store re-issue as the fallback.
- **Risk: teachers import content they do not have rights to share as open.** Mitigation: tier declaration, provenance with source hash, quarantine and reporting on the commons; not preventable.
- **Risk: shared-device PINs are weak.** Mitigation: formative-only scope, rate limiting, teacher visibility; summative use excluded.
- **Risk: multiple boxes in one school break the single-allocator model.** Mitigation: per-box tokens or split tokens (open question 4).
- **Trade-off: star topology means no sync when the box is off.** Accepted for access-control tractability; local work continues.
- **Trade-off: site copies double pack storage on the box.** Accepted for box-side watermarking and key separation.
- **Trade-off: derived per-pack keys tie site copies to the site key.** Accepted; succession regenerates them.

## Migration Plan

Not applicable: this is a greenfield specification with no existing deployment. Delivery sequencing will be captured in `tasks.md` when the specification is accepted; it is deliberately absent from this change.

## Open Questions

Genuinely open decisions, with a recommendation where the evidence supports one. Items 1, 2, and 4 change externally observable behaviour and should be settled before implementation planning; the rest can be resolved during it.

1. **Default network mode.** Recommend box-as-network as the Pi image default and join-existing-LAN as an explicit choice with installer checks. Confirm this matches the intended deployments (a Pi per classroom versus one box per school on the school LAN).
2. **Seat model with publishers.** Recommend seats per learner with a cap of two admitted devices per learner. Confirm publishers will accept per-learner counting and whether reassignment of released seats should be limited.
3. **Default open licence.** Recommend CC BY-SA 4.0 as the platform default with per-site override. CC BY 4.0 maximises reuse but lets forks leave the commons.
4. **Multi-box sites.** Options: one token per box (simplest, matches the single-allocator design), or a site token split into per-box allocations by the store. Recommend one token per box for the initial platform.
5. **Box runtime packaging.** Bun compile versus Node single-executable for the single binary; decide on Pi memory footprint and Automerge WASM start-up time.
6. **Retention policy defaults.** One year after the academic year is a placeholder; schools' retention schedules vary and the DPIA template should drive the default.
7. **UK MIS connectors.** Which of Wonde, Xporter, or direct SIMS/Arbor/Bromcom exports to support beyond OneRoster CSV and the generic mapping.
8. **Box disk encryption key handling.** Unattended boot on a Pi without a TPM means the key is on the device; the alternatives are a teacher passphrase at boot (inconvenient) or accepting the residual. Recommend accepting the residual for the Pi and documenting it, with passphrase boot as an option.
9. **Code signing route.** Azure Trusted Signing versus an OV/EV certificate for Windows; Apple Developer notarisation for macOS. Operational, but affects the release process and lead time.
10. **Commons relay.** Whether the project runs one at launch or open sharing is USB and file only until demand justifies it.
11. **Publisher key-status cadence.** How often status lists are cut and whether packs must embed the latest list at build time.
12. **Signing algorithm floor.** Whether any target school devices still lack Ed25519 in Web Crypto, which decides if the P-256 fallback is needed at launch.
13. **Direct device-to-device sync.** Whether it is ever wanted; if so, open documents only, since they have no entitlement rules beyond site membership.
14. **Pack size budget and per-device cap defaults.** Depends on the media profile of launch publishers and the cheapest target devices.
15. **Publisher visibility of licence audit trails.** Whether publishers get any view of seat allocation history, and through what channel, given the site holds the log.
