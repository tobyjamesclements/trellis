# Identity and Enrolment Specification

Capability ID prefix: **IDE**

## Purpose

Who a principal is, how they prove it, what they are enrolled in, and what
their roles allow. Identity uniqueness is delegated to external identity
providers and to DNS; Trellis mints principals per region without global
coordination and merges duplicates after the fact. Enrolment is a set of
facts; caps are advisory and reconciled by a workflow that apologises
rather than a gate that refuses. Authorisation is computed from
region-local derived state and is therefore eventually consistent.

## Consistency boundary

- **Identity claims** are immutable facts linking a principal to
  `(issuer, sub)` or a verified email hash. Two regions may mint two
  principals for one person; a `merge.v1` fact later folds one into the
  other. Nothing is lost; views re-derive.
- **Profiles** are per-field LWW registers over `profile.v1` facts,
  ordered by `(sync_hlc, fact_id)`.
- **Sessions** are stateless signed tokens verifiable in every region;
  revocation is a fact whose effect propagates with replication lag.
- **Enrolment and roles** are facts; memberships and effective roles are
  region-owned derived indexes. Caps, seat limits, and cohort bounds are
  reconciled, never enforced.

## Domain model

```
Principal        usr_<ULID>    minted by the first region that sees an unknown identity
IdentityClaim    identity.v1 { issuer, sub, email_hash?, verified_at }        subject = principal
Profile          profile.v1  { field, value }                                 LWW per field
Session          JWT { sub: usr, ten, dev, roles_hint, iat, exp ≤ 12 h, kid }
RefreshToken     JWT { sub, dev, iat, exp ≤ 30 d, jti }                        bound to device
Revocation       session.revoke.v1 { before_hlc, devices?: [dev] }
Enrolment        enrol.v1   { course, cohort, role, method, effective_from, source_ref }
                 unenrol.v1 { course, cohort, reason }                         superseding
Role             role.v1    { context: T|CAT|C|COH|L, context_id, role, op: grant|revoke }
Cohort           cohort.v1  { course, cohort, op: create|cap|split|merge|close, cap?, policy: soft|hard }
Reconciliation   sys.reconcile.v1 { cohort, subject, decision: waitlist|promote|confirm, position?, reason }
Merge            merge.v1   { survivor: usr, alias: usr, evidence: [claim fact_ids] }
Built-in roles   learner, instructor, tutor, designer, observer, admin, operator, guest
```

New fact types introduced here beyond the registry: none (all listed in
`fact-types.md`).

---

## Requirements

### Requirement: The system SHALL mint principals per region without a global uniqueness guarantee and link them to identities by immutable claim facts [IDE-01]

The system SHALL mint principals per region without a global uniqueness guarantee and link them to identities by immutable claim facts.
A federated identity `(issuer, sub)` maps to the deterministic principal id
`usr_` + base32(SHA-256(issuer ‖ sub))[0:26], so any region that first sees
the claim mints the *same* id and no duplicate can arise from concurrency.
Email-only (magic-link) sign-ups have no external identifier and mint
`usr_<ULID>`; two regions may therefore mint two principals for one inbox
within the replication window, which is expected and resolved by IDE-11.
Every minting appends `identity.v1`; the region-owned identity index maps
claims to principals for local lookups.

#### Scenario: Federated first login in two regions at once
- **WHEN** a learner's first two OIDC logins land in different regions within the replication lag
- **THEN** both regions mint the same principal id and append their own `identity.v1` facts
- **AND** after replication the identity index holds one principal with two identical-meaning claim facts and nothing needs merging

#### Scenario: Magic-link sign-up races
- **WHEN** two magic-link sign-ups for the same email complete in different regions within the replication lag
- **THEN** two principals exist, each with a verified email claim
- **AND** after replication the identity indexer detects the duplicate and initiates IDE-11

#### Scenario: Ordinary login
- **WHEN** the claim is already in the region's identity index
- **THEN** the session is issued for the existing principal without writing any fact other than a `device.v1` if the device is new

### Requirement: The system SHALL authenticate by OIDC federation, magic link, LTI launch, or SAML via a regional bridge, and never store passwords [IDE-02]

The system SHALL authenticate by OIDC federation, magic link, LTI launch, or SAML via a regional bridge, and never store passwords.
Native OIDC relying-party flows (authorization code + PKCE) run in every
region. Magic links are single-use signed tokens sent by email, valid 15
minutes, verified in any region. LTI launches (LTI-05) establish sessions
for the launching user. SAML identity providers are bridged through an
Amazon Cognito user pool in the tenant's home region acting as an OIDC
provider to Trellis; SAML login is unavailable while that region is down,
which is stated to the tenant at configuration time. No password hash is
ever stored.

#### Scenario: Magic link used in another region
- **WHEN** a magic link issued by region A is opened through region B
- **THEN** B verifies the token signature with the replicated key registry, records single use in its local TTL table, and issues a session
- **AND** a replay in A within 15 minutes is possible and accepted (Known Tension 5)

#### Scenario: SAML tenant during home-region outage
- **WHEN** the home region is unhealthy
- **THEN** new SAML logins fail with a status-page link; existing sessions and refresh tokens continue to work in the other regions

### Requirement: The system SHALL issue stateless session and refresh tokens signed with regional keys that every region can verify [IDE-03]

The system SHALL issue stateless session and refresh tokens signed with regional keys that every region can verify.
Tokens are ES256 JWTs. Signing keys are generated per region under a KMS
multi-Region key and registered as immutable `T#t#KEYS` facts; the JWKS
endpoint in every region lists every active key. Rotation adds a key,
waits ≥ (replication lag + JWKS cache TTL + max token lifetime), then
retires the old one. Session tokens last ≤ 12 h; refresh tokens ≤ 30 d and
are bound to `device_id`.

#### Scenario: Verify in a peer region
- **WHEN** a session signed in region A is presented in region B
- **THEN** B validates with its cached JWKS and serves the request

#### Scenario: Rotation overlap
- **WHEN** a new signing key is introduced
- **THEN** tokens signed with the old key remain valid until its retirement HLC, which is at least 30 days after the new key's registration

### Requirement: The system SHALL derive profiles from per-field LWW over profile facts [IDE-04]

The system SHALL derive profiles from per-field LWW over profile facts.
`profile.v1 { field, value }` facts fold into a region-owned profile item
by taking, per field, the value with the greatest `(sync_hlc, fact_id)`.
Fields: display name, email (not unique), locale, timezone, avatar blob
hash, accessibility preferences, pronouns. History is the fact stream.

#### Scenario: Concurrent edits on two devices
- **WHEN** a learner changes their display name on a phone and their locale on a laptop while both are offline
- **THEN** after sync the profile shows both changes; if both changed the same field, the later `sync_hlc` wins and the history shows both

### Requirement: The system SHALL record enrolment as facts and derive memberships region-locally [IDE-05]

The system SHALL record enrolment as facts and derive memberships region-locally.
`enrol.v1` and `unenrol.v1` fold into `E#<subject>` (a principal's
memberships) and `M#<cohort>` (members, count). Methods: manual, self
(with optional enrolment key checked region-locally), SIS (DIO-02), LTI
(LTI-01, LTI-05), cohort sync (IDE-16). The effective enrolment is the
latest by `(sync_hlc, fact_id)` between `enrol` and `unenrol` for a
`(subject, course, cohort)`.

#### Scenario: Enrol then unenrol offline
- **WHEN** an instructor's offline device records an unenrol and, later, an online admin re-enrols the same learner
- **THEN** after sync the derived enrolment is whichever fact has the later `sync_hlc`, and the enrolment history lists both

#### Scenario: Self-enrolment key
- **WHEN** a learner self-enrols with the correct key in region B before the course's key-change fact from region A arrives
- **THEN** the enrolment is accepted; when the key change folds the enrolment is flagged `key_stale` for the instructor, never removed automatically

### Requirement: The system SHALL NOT enforce cohort caps and SHALL reconcile over-cap membership through an instructor-in-the-loop apology workflow [IDE-06]

The system SHALL NOT enforce cohort caps and SHALL reconcile over-cap membership through an instructor-in-the-loop apology workflow.
`cohort.v1` sets `cap` and `policy ∈ {soft, hard}` (default `soft`). The
`cap-reconcile` Step Functions Standard workflow runs in the home region
whenever a region's `M#<cohort>` count exceeds the cap and hourly while it
does. It recomputes over the union each run:

1. Order effective enrolments by `(sync_hlc, fact_id)`.
2. Protected set: learners with any activity fact in the course.
3. Candidates: the newest unprotected enrolments beyond the cap.
4. `soft`: notify the instructor with counts; stop.
5. `hard`: notify the instructor "N over cap: raise cap or confirm
   waitlist"; wait ≤ 24 h for a task-token decision.
6. Raise: append `cohort.v1 {cap}`; done. Confirm or timeout: append
   `sys.reconcile.v1 {waitlist, position}` per candidate and an apology
   notification offering alternatives (another cohort, notify-when-free).
7. When membership drops below cap, promote by waitlist position with
   `sys.reconcile.v1 {promote}` and notify.

Waitlisted learners keep read access to content and their facts are
retained.

#### Scenario: Concurrent self-enrolment in two regions
- **WHEN** a 30-seat hard-capped cohort receives 32 self-enrolments split across two regions within the replication window
- **THEN** every enrolment is accepted, every region's count converges to 32, and the workflow asks the instructor about 2 candidates
- **AND** no candidate who has already submitted work is ever selected

#### Scenario: Instructor raises the cap
- **WHEN** the instructor chooses "raise to 35" within 24 hours
- **THEN** a `cohort.v1 {cap: 35}` fact is appended, no learner is waitlisted, and no apology is sent

#### Scenario: Instructor does not respond
- **WHEN** 24 hours pass without a decision
- **THEN** the 2 newest unprotected learners receive `sys.reconcile.v1 {waitlist}` facts and an apology with their position and alternatives

### Requirement: The system SHALL split cohorts at the 2,000-learner bound into sub-cohorts and reconcile concurrent splits [IDE-07]

The system SHALL split cohorts at the 2,000-learner bound into sub-cohorts and reconcile concurrent splits.
Enrolment places a learner into the smallest open sub-cohort in the
region's view; when none has room it appends `cohort.v1 {split}` creating
`<cohort>#<n>`. Two regions may create the same or different sub-cohorts
concurrently; both exist. A monthly reconciliation may `merge` sub-cohorts
under the bound by appending re-enrolment facts.

#### Scenario: MOOC enrolment burst
- **WHEN** 5,000 learners enrol in a day across two regions
- **THEN** at least three sub-cohorts exist, every learner is in exactly one effective sub-cohort per region's view, and no partition exceeds the bound by more than the replication window's worth of enrolments

### Requirement: The system SHALL express roles as grant and revoke facts and derive effective roles per context region-locally [IDE-08]

The system SHALL express roles as grant and revoke facts and derive effective roles per context region-locally.
Role definitions (capability sets) are tenant `policy.v1` content. Effective
roles for a principal in a context are the latest grant/revoke per
`(context, role)` by `(sync_hlc, fact_id)`, inherited down tenant →
category → course → cohort. Built-in roles cannot be redefined below their
documented minimum capabilities.

#### Scenario: Tutor promoted to instructor
- **WHEN** an admin appends `role.v1 {course c, instructor, grant}`
- **THEN** within replication lag every region derives the instructor role for that principal in `c` and its cohorts

### Requirement: The system SHALL authorise every request against region-local derived roles and memberships, accepting replication-lag staleness [IDE-09]

The system SHALL authorise every request against region-local derived roles and memberships, accepting replication-lag staleness.
Sync pulls and pushes (FLS-10, FLS-11), view reads (MVA), authoring (CAC),
marking (ACT) and admin calls check the serving region's `RL#` and `E#`
items. A revoked role or ended enrolment may continue to be honoured in
another region for the replication lag; the sent ledger and audit facts
make any such action attributable and reversible by void.

#### Scenario: Revocation in flight
- **WHEN** a tutor's role is revoked in region A and they push a `mark.v1` in region B two seconds later
- **THEN** B accepts it; once the revocation folds, the marking-queue view flags the mark `writer_unauthorised_at_fold` and an instructor may void it

#### Scenario: Observer read
- **WHEN** an observer linked to learner L requests L's progress view
- **THEN** the view is served; a request for another learner is refused with `403`

### Requirement: The system SHALL support guest access to open content without minting principals or writing facts [IDE-10]

The system SHALL support guest access to open content without minting principals or writing facts.
Guests receive a short-lived unsigned-subject session (`usr_guest`) that
permits reads of content marked open. No sync is accepted; no facts are
written.

#### Scenario: Guest attempts a quiz
- **WHEN** a guest answers items in an open course
- **THEN** marking happens on device only and nothing is pushed; the client offers sign-in to keep the work

### Requirement: The system SHALL merge duplicate principals with a superseding merge fact and re-derive rather than delete [IDE-11]

The system SHALL merge duplicate principals with a superseding merge fact and re-derive rather than delete.
When two principals share a verified claim, the identity indexer (or an
admin) appends `merge.v1 { survivor, alias }` where the survivor is the
principal with the lexically smallest ULID (earliest created). Login
resolves aliases to the survivor. The stream router treats facts whose
subject is an alias as facts about the survivor for partition routing, and
MVA recomputes affected partitions. Voiding the merge fact reverses it.

#### Scenario: Auto-merge after concurrent minting
- **WHEN** replication surfaces two principals with the same `(issuer, sub)`
- **THEN** a `merge.v1` is appended, the learner sees "we joined two records of your account" at next login, and every cohort view they appear in re-derives with one row

#### Scenario: Wrong merge reversed
- **WHEN** an admin voids a `merge.v1`
- **THEN** both principals are independent again and views re-derive with two rows

### Requirement: The system SHALL let principals see and revoke their devices and sessions [IDE-12]

The system SHALL let principals see and revoke their devices and sessions.
A device list is derived from `device.v1` facts and last-sync rosters.
"Sign out everywhere" appends `session.revoke.v1 { before_hlc }`; "sign out
device" adds `devices: [dev]`. Revocation is checked against the region's
revocation cache on each request.

#### Scenario: Lost phone
- **WHEN** a learner revokes the phone's device
- **THEN** its refresh token stops working in every region within replication lag and its future pushes are rejected with `unauthorised_device`, while facts it already synced remain

### Requirement: The system SHALL provide a tenant-scoped user directory as a region-owned index without any global search service [IDE-13]

The system SHALL provide a tenant-scoped user directory as a region-owned index without any global search service.
The directory folds identity and profile facts into `DIR#` items keyed by
normalised name prefix and email-hash prefix (2 characters), bounded per
tenant. Lookups are prefix queries; there is no cross-tenant search.

#### Scenario: Admin looks up a learner
- **WHEN** an admin types "sha"
- **THEN** the directory returns at most 200 matches from the `DIR#…#sha` prefix with the index's freshness block

### Requirement: The system SHALL require consent acknowledgement facts at first login and after policy changes [IDE-14]

The system SHALL require consent acknowledgement facts at first login and after policy changes.
`consent.v1` (ADM) is appended when the learner accepts the tenant's terms
version; a newer terms version prompts again. Absence of consent limits the
client to the consent screen; it never blocks sync of facts already made.

#### Scenario: Terms updated
- **WHEN** the tenant publishes terms v3
- **THEN** each learner is prompted at next login and a `consent.v1 {v3}` fact records acceptance

### Requirement: The system SHALL support observer links from one principal to a learner as role facts scoped to that learner [IDE-15]

The system SHALL support observer links from one principal to a learner as role facts scoped to that learner.
`role.v1 { context: L, context_id: <learner>, role: observer, grant }`
created by an admin or by learner invitation. Observers read derived views
only (MVA-10) and receive the learner's notification digest if the learner
opts in (COM-09).

#### Scenario: Parent invited
- **WHEN** a learner invites a parent by email
- **THEN** the parent authenticates by magic link, a principal is minted if needed, and the observer role fact is appended over the learner

### Requirement: The system SHALL sync tenant-level cohorts into course enrolments idempotently [IDE-16]

The system SHALL sync tenant-level cohorts into course enrolments idempotently.
Tenant cohorts (`cohort.v1` with `context = T`) hold members by `enrol.v1`
facts with scope `_enrol` and `course = null`. A course may bind a tenant
cohort; the cohort-sync job (region system device, hourly, home region)
appends course `enrol.v1` facts for members lacking one and `unenrol.v1`
for members who left, each idempotent by content.

#### Scenario: Member added to tenant cohort
- **WHEN** an SIS import adds a learner to "Year 9"
- **THEN** within the next sync run the learner is enrolled in every course bound to "Year 9"

### Requirement: The system SHALL treat enrolment windows and enrolment keys as advisory and flag rather than refuse out-of-window enrolments [IDE-17]

The system SHALL treat enrolment windows and enrolment keys as advisory and flag rather than refuse out-of-window enrolments.
The client hides self-enrolment outside the window; a request that arrives
outside it (stale client, clock skew) is accepted and flagged
`outside_window` in the instructor's enrolment view, where it may be voided.

#### Scenario: Stale client enrols after the window
- **WHEN** a device with a cached course page self-enrols two hours after the window closed
- **THEN** the enrolment exists with `outside_window = true` and the instructor is notified in their next digest

### Requirement: The system SHALL keep login and session refresh available in every region of the zone except for SAML-bridged tenants [IDE-18]

The system SHALL keep login and session refresh available in every region of the zone except for SAML-bridged tenants.
OIDC, magic-link and LTI logins and all refresh flows depend only on
region-local state and the replicated key registry.

#### Scenario: One region down
- **WHEN** region A is unavailable
- **THEN** OIDC and magic-link logins succeed in region B for every tenant, and refresh succeeds for every session including those issued in A

---

## DynamoDB access patterns

### `facts` (global)

| # | Pattern | Keys | Notes |
|---|---|---|---|
| 1 | Identity, profile, device, merge, revoke facts | `PK = T#t#S#L#usr`, `SK = F#_profile#<dev>#<seq10>` | Region system device writes `identity.v1` for federated logins |
| 2 | Enrolment, role, reconciliation facts | `PK = T#t#S#L#usr`, `SK = F#_enrol#<dev>#<seq10>` | |
| 3 | Cohort facts | `PK = T#t#S#C#<course>`, `SK = F#_struct#<dev>#<seq10>` | Tenant cohorts: `PK = T#t#S#T#t` |
| 4 | Signing key registry | `PK = T#t#KEYS`, `SK = K#<kid>` | Immutable per kid |

### `derived` (regional)

| Item | PK | SK | Size | Access |
|---|---|---|---|---|
| Identity index | `T#t#IDX#<issuer>` | `S#<sha256(sub)>` | small | GetItem at login |
| Email index | `T#t#IDXE` | `E#<sha256(email)>#<usr>` | small | Query prefix; may return several principals |
| Profile | `T#t#PR#<usr>` | `HDR` | ~2 KB | GetItem; CAS on fold |
| Memberships | `T#t#E#<usr>` | `C#<course>#<cohort>` | small | Query prefix on every authorised request (cached 60 s) |
| Cohort members | `T#t#M#<cohort>` | `L#<usr>` and `COUNT` | 2,000 × small | Query for rosters; COUNT item CAS |
| Effective roles | `T#t#RL#<usr>` | `X#<context>#<role>` | small | Query prefix, cached 60 s |
| Revocation cache | `T#t#RV#<usr>` | `HDR` | small | GetItem per request, cached 60 s |
| Magic-link use | `T#t#ML` | `<jti>` | small | Conditional put, TTL 15 min |
| Directory | `T#t#DIR` | `N#<prefix2>#<name>#<usr>` / `E#<prefix2>#<usr>` | small | Query prefix |
| Cap state | `T#t#CAP#<cohort>` | `HDR` | small | Workflow state and last run vector |

**Item collection sizing.** `M#<cohort>` holds ≤ 2,000 member items plus a
count (≈ 200 KB). `E#<usr>` ≤ ~50 items. `DIR` per tenant: 1M learners ×
~150 B = 150 MB across ~1,300 two-character prefixes; each prefix query is
bounded at 200 results.

**Hot-partition risk.** `M#<cohort>#COUNT` is written once per enrolment
fold; an enrolment burst of 5,000/day is nothing. The identity index is
read on every login (300k/month) and spread across issuers; the tenant
config and role items read on every request are cached in memory for 60 s
per execution environment, keeping per-item reads well under 3,000 RRU/s
even at 1M learners.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `auth-oidc` | HTTP API `/auth/oidc/{start,callback}` | Java 21 SnapStart, 1024 MB | 40 ms | 350 / 800 ms | Discovery cached; PKCE; mints principal if unknown |
| `auth-magic` | HTTP API `/auth/magic/{request,verify}` | Java 21 SnapStart, 512 MB | 30 ms | 300 / 700 ms | Sends via SES directly (any region; see COM-07 exception) |
| `auth-token` | HTTP API `/auth/{refresh,jwks,revoke}` | Java 21 SnapStart, 512 MB | 10 ms | 300 / 700 ms | KMS Sign cached key handle |
| `authz` (library) | linked into every API function | — | ≤ 2 ms cached | — | Role/membership cache 60 s |
| `identity-indexer` | EventBridge `fact.folded` filter `identity.v1|merge.v1|profile.v1|device.v1|session.revoke.v1` | Java 21, 512 MB | 15 ms | 400 / 900 ms | Writes IDX, PR, RV, DIR; detects duplicates |
| `enrol-indexer` | EventBridge `fact.folded` filter `enrol.v1|unenrol.v1|role.v1|cohort.v1|sys.reconcile.v1` | Java 21, 512 MB | 15 ms | 400 / 900 ms | Writes E, M, RL, CAP |
| `enrol-api` | HTTP API `/enrol/*`, `/roles/*`, `/cohorts/*` | Java 21 SnapStart, 512 MB | 20 ms | 300 / 700 ms | Appends facts via FLS ingest library |
| `cap-reconcile` | Step Functions Standard (home region) on `cap.exceeded` and hourly | Java 21, 512 MB | — | — | Task-token wait ≤ 24 h |
| `cohort-sync` | EventBridge Scheduler hourly (home region) | Java 21, 512 MB | — | — | Idempotent enrolment facts |
| `directory-api` | HTTP API `/directory` | Java 21 SnapStart, 512 MB | 15 ms | 300 / 700 ms | Prefix query |

## Propagation path

1. Login → `auth-*` → (first time) `identity.v1`, `device.v1` facts via FLS ingest library (region system device for federated claims).
2. `facts` stream → `stream-router` → `roster-updater` → EventBridge `fact.folded` → `identity-indexer` / `enrol-indexer` → `derived` indexes.
3. `enrol-indexer` detects `count > cap` → EventBridge `cap.exceeded` → Step Functions `cap-reconcile` (home region only) → `sys.reconcile.v1` facts → COM-07 notifications.
4. `identity-indexer` detects duplicate claims → appends `merge.v1` (region system device) → MVA recompute of affected partitions.
5. Revocation facts → `RV#` cache in every region within replication lag.

## Cost model

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Login and refresh API | 300 k logins + 1.2 M refreshes ≈ 1.5 M req × $1/M + Lambda ≈ **$3** | $300 | |
| Magic-link emails | 90 k × $0.10/k ≈ **$9** | $900 | 30% of logins |
| Identity/enrolment facts | ~60 k facts × 2 rWRU ≈ **$0.1** | $10 | |
| Indexer writes | ~200 k WRU ≈ **$0.1** | $15 | |
| Authz reads (cached) | 6 M requests → ~1 M RRU ≈ **$0.1** | $12 | 60 s cache |
| KMS signing keys and Sign calls | 2 regions × $1 + 1.5 M / 10 k × $0.03 ≈ **$7** | $450 | Sign per token issue |
| Cognito (SAML tenants only) | 10 k MAU free tier ≈ **$0** | ≈ $5,500 at 1 M MAU (Lite tier) — recommend OIDC federation instead | |
| Cap reconcile, cohort sync | ~100 executions × ~20 transitions ≈ **$0.1** | $5 | |
| **Total** | **≈ $19** (Cognito excluded) | ≈ $1,700 + Cognito | |

## Standards conformance

| Standard | Role | Target | In scope | Out of scope / why | EC conflict and resolution |
|---|---|---|---|---|---|
| OpenID Connect Core 1.0 | Relying party | Full RP (code + PKCE) | Institutional IdPs, Cognito bridge | OP role (Trellis as IdP) except for LTI platform launches (LTI-01) | None; state/nonce single-use is region-local (Tension 5) |
| SAML 2.0 | Service provider via Cognito | Web Browser SSO through Cognito federation | Institutional SAML IdPs | Native SAML SP on Lambda: signature/XML handling risk not worth it initially | Cognito is single-region → SAML login unavailable during home-region outage (IDE-02) |
| 1EdTech Security Framework 1.1 | Client and server for LTI services | Client-credentials with JWT client assertion, JWKS rotation | Used by LTI and OB3 API | — | JWKS lists all active keys; rotation overlap ≥ replication lag + cache TTL (IDE-03) |
| OneRoster 1.2 users/enrollments | Consumer | Rostering pull, CSV | Inbound as `enrol.v1`/`identity.v1` (DIO-02) | — | Duplicate principals possible when SIS and OIDC race; IDE-11 merges |
| WCAG 2.2 AA | Login UI | AA | — | — | — |

## Known Tensions

1. **Two accounts for one person.** Concurrent magic-link sign-ups, or an
   SIS import (which carries no OIDC `sub`) racing an OIDC login, create two
   principals. Facts made under both are valid; the merge fact unifies
   them. Symptom: a learner sees two records briefly, and an instructor's
   view shows two rows until the recompute lands (minutes). Options:
   (a) route first-time sign-ups to the home region only (adds latency and
   a single point of failure for sign-up); (b) accept and merge;
   (c) deterministic principal ids from `(issuer, sub)`, which removes the
   race entirely for federated identities and is adopted in IDE-01; SIS
   imports use the SIS `sourcedId` as `(issuer = sis:<tenant>, sub)` so an
   SIS-first learner also gets a deterministic id, and the OIDC claim is
   linked to it by the tenant's SIS↔IdP mapping (DIO-02) rather than by a
   merge. Recommendation: (c) wherever an external identifier exists, (b)
   for email-only sign-ups.
2. **Email is not unique.** Two principals may carry the same verified
   email. Login by magic link then resolves to two candidates. Policy:
   auto-merge when both claims are verified (same inbox, same person) and
   show an account chooser only when a merge was previously reversed.
3. **Cap reconciliation bumps a learner who did nothing wrong.** Under
   `hard` policy and instructor silence, the newest unprotected enrolments
   are waitlisted 24 hours after they joined. Symptom: "I enrolled, now I'm
   waitlisted." Options: (a) `soft` default (recommended: formative courses
   rarely need hard caps); (b) reserve seats by region so each region can
   admit only its share — this is a partition of the cap, not a global
   invariant, and is offered as an optional policy `cap_shares`; (c)
   first-come by `sync_hlc`, which favours online learners over offline
   ones and is rejected as default. Recommendation: (a), with (b) available
   for tenants that need hard caps at scale.
4. **Authorisation is eventually consistent.** A revoked role works for
   seconds elsewhere. In a formative system the consequence is a marking or
   enrolment fact that an instructor can void; nothing is exfiltrated that
   the principal could not already read a moment earlier. Recommendation:
   accept; keep the 60 s cache and the `writer_unauthorised_at_fold` flag.
5. **Nonce and magic-link replay across regions.** Single-use is enforced
   per region. A token replayed in a second region within its 15-minute
   life creates a second session for the same person. Options: (a) route
   auth callbacks to the issuing region by embedding it in `state` and
   redirecting (recommended; the redirect costs one round trip and fails
   open to the local region if the issuer is unhealthy); (b) accept.
   Recommendation: (a).
6. **SAML is single-region.** The Cognito bridge concentrates SAML tenants'
   login on the home region. Options: (a) accept with status page;
   (b) Cognito pool per region with the IdP configured twice and the
   identity index treating both as the same issuer (doubles IdP-side
   configuration; recommended for tenants that require it); (c) native
   SAML SP later. Recommendation: (a) by default, (b) on request.
