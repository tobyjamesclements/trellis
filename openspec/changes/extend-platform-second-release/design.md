## Context

See `proposal.md` for motivation and `define-offline-classroom-platform` for the first release this builds on. Every decision here was drafted during the first release's design and moved out when the discovery interview scoped that release to a box per school with data local to the box. The constraints of the first release apply unchanged; two facts matter more here: WebKit will not implement hash-pinned WebTransport, and Chrome's Local Network Access permission gates connections from public origins to private addresses.

## Goals / Non-Goals

**Goals:**
- Let open material move between schools with lineage intact and without a live channel to secure.
- Serve schools that will not own hardware, honestly.
- Serve managed fleets and iPads without changing the first release's model.

**Non-Goals:**
- Live sync between sites.
- Central reporting for chains, ministries, or funders. Hosted schools' data stays inside their own hosted site.
- Multi-tenant hosting. One container per school keeps the binary identical.

## Decisions

### D1. The commons is a registry of releases

**Decision**: Cross-site sharing is publish and pull. A release is a native bundle (Automerge document at chosen heads, provenance with a signed publication event, open attachments) stored in a content-addressed registry. The box and the registry both check tier, licensed references, lineage, and licence declaration. Pulling imports a fork whose provenance names the release; publishing a release of that fork lets the upstream author pull and merge it. Releases are plain files, so a USB drive is a mirror.

**Rationale**: Teachers want releases and merges, not a shared cursor across schools. A registry needs no access control beyond "open only", works with intermittent connectivity, and gives the laundering check a single chokepoint.

**Alternatives**: A live automerge-repo relay (more to secure, less useful); a git repository of Automerge files (re-implements the registry with worse tooling for teachers).

### D2. Signed provenance and forks

**Decision**: Every origin, fork, merge, and publication event is signed by the acting device key and names the site. Forks copy history and append an event. Merge is explicit, between documents sharing history, same tier only. Lineage is verified against history and signatures; unverified documents are never published. Attribution handles are chosen, never derived from roster data.

### D3. Public origin and local-network permission

**Decision**: The project may serve the shell from a public origin. Devices installed from it partition storage by site and request Chrome's local-network permission deliberately at join, with an explanation and a refusal path. Shells from the box's own hostname are unaffected.

**Rationale**: It rescues schools whose box cannot get a certificate but whose devices have internet at school. It is a supply-chain trust point for every site installed from it, which is why it is optional and second release.

### D4. Passkeys for staff only

**Decision**: Staff devices may register a passkey; a replacement device presenting a valid assertion is admitted with the same role. Students never use passkeys.

### D5. Wrapped client for managed iPads

**Decision**: The same web client in a thin native shell, distributed through Apple School Manager, pinning the site key, using the LAN transports or a TLS connection whose trust is the site key. No separate feature set.

### D6. Hosted site as the same binary per school

**Decision**: A hosted site is one container per school running the unmodified box binary at a public hostname with an ordinary certificate. Devices use WebSocket over HTTPS; no LAN transports, no landing page. The company operates it as a data processor: encrypted storage, access controls, access logging, hosting in a region chosen per country. A school moves between hosted and local by restoring its recovery bundle onto the other and re-admitting devices by QR. Lapsed subscriptions export and then delete.

**Rationale**: "One or the other" was the answer in discovery. Multi-tenancy would fork the codebase; a container per school keeps every first-release property except LAN independence. The weaker promise is stated rather than hidden.

### D7. Roster import reconciles with joins

**Decision**: OneRoster import creates or updates directory entries and proposes matches against self-registered learners by name and class for the teacher to confirm; learner references are never replaced, so history stays attached.

## Risks / Trade-offs

- **Risk: the commons becomes a takedown and moderation burden.** Mitigation: releases are signed by site and author, checks run at box and registry, and governance is an open question to settle before launch.
- **Risk: the public origin is compromised.** Mitigation: signed releases, reproducible builds, and the per-box shell path that verifies against the root key.
- **Risk: hosted schools blame the platform for their internet.** Mitigation: the limitation is in the proposal, the contract, and the status page.
- **Risk: data residency law changes.** Mitigation: region per country is a deployment parameter, not a code path.
- **Trade-off: passkeys depend on platform accounts teachers may not have.** Accepted; device keys with the recovery path remain.

## Migration Plan

Archive `define-offline-classroom-platform` first. The deltas here add requirements to capabilities it creates; none modify or remove first-release requirements. A school on the first release needs no data migration: forks, releases, roster import, passkeys, and the wrapped client are additive, and hosting is a deployment of the same binary.

## Open Questions

1. **Hosting region per country.** Which regions satisfy Kenyan, Brazilian, Peruvian, and other residency provisions, and whether a single region per continent is acceptable.
2. **Commons governance.** Who can publish, how takedowns are handled, and whether a project-run registry launches or file mirrors suffice at first.
3. **Management-system connectors.** Which exports beyond OneRoster CSV matter in the launch countries.
4. **Passkey policy.** Whether schools' IT policies permit synced passkeys for staff.
5. **Public origin at launch of this release.** Whether demand from certificate-less boxes justifies running it.
6. **Hosted pricing versus box pricing.** Outside this specification, but it decides whether relocation between the two is common enough to deserve a guided flow.
