# Credentialing and Competencies Specification

Capability ID prefix: **CRD**

## Purpose

This capability owns competency frameworks (CASE 1.0), the alignment of items
and activities to framework items, competency mastery and learning plans,
achievement definitions, and the issuance, revocation and presentation of
Open Badges 3.0 credentials and CLR 2.0 learner records. Frameworks,
alignments, achievements, evidence, awards, issuances and revocations are
facts; mastery, status lists, backpacks, DID documents and every index are
derived. A credential is the one artefact that leaves Trellis signed and
cannot be recomputed away, which is why its issuance is a gated side effect
and everything before and after it is a derivation.

## Consistency boundary

- **Facts (global, immutable):** `framework.v1`, `align.v1`,
  `achievement.v1`, `issuer.v1`, `ob.client.v1`, `plan.v1`, `evidence.v1`,
  `award.v1`, `issue.v1`, `revoke.v1`, `consent.v1`. Union is the merge;
  removal of meaning is a void or a superseding fact (FLS-02, FLS-07).
- **Derived (regional, disposable):** framework, alignment, achievement and
  client indexes; mastery NMRows (MVA-07); backpacks; pending-award and
  credential-id maps; status-list state; OAuth nonces. All are
  vector-stamped and regenerable from facts and blobs (ADR-004).
- **Blobs (S3, content-addressed, bidirectional CRR, ADR-017):** CASE
  packages, achievement images, evidence, signed credentials (encrypted
  under the subject's data key, FLS-16), status lists, baked images and
  certificates, all inside the tenant's residency zone (ADR-013).
- **Side effects (home region only, sent ledger, ADR-012):** credential and
  CLR issuance and the notifications that follow. Signing a status list or
  DID document is a derivation any region performs; signing a credential is
  a side effect because the artefact is handed to a holder.
- **Where the model is weakest:** a rule-based award predicate is
  non-monotone, so awards wait out a 24 h stability window (MVA-08);
  issuance is undone only by revocation; two regions can issue during a
  home-region flip; a revocation reaches a peer region only after
  replication. Each is stated where it applies and in Known Tensions.

## Domain model

### New fact types (registry additions; the integrator merges them)

| Type | Owner | Subject kind | Scope | Writer | PII | Purpose |
|---|---|---|---|---|---|---|
| `framework.v1` | CRD | T | `_admin` | admin / CASE import (region system device) | T | CASE framework imported: sourcedId, source, package blob hash, counts |
| `achievement.v1` | CRD | C or T | `_struct` (course) / `_admin` (tenant) | editor / admin | T | Achievement definition version: rule, validity, image, alignments, issuer |
| `issuer.v1` | CRD | T | `_admin` | admin | T | Issuer profile: DID, name, url, image, key group |
| `plan.v1` | CRD | L | `_profile` | instructor / admin / self | P | Learning plan: framework, CFItems, target dates, template ref |
| `ob.client.v1` | CRD | T | `_admin` | dynamic registration (region system device) / admin | T | OB 3.0 / CLR 2.0 API client registration (RFC 7591) |

Reused: `align.v1`, `evidence.v1`, `award.v1`, `issue.v1`, `revoke.v1`
(CRD); `policy.v1` (CAC; `competency` and `credentials` sections);
`consent.v1` (ADM; `kind = ob3_client | share_link`). Proposed amendment:
`revoke.v1` writer also "region system device (home)" for policy-driven
revocation (CRD-14, CRD-15).

```
Framework    framework.v1 → CFPackage blob → per-region index generation
               { CFItem{sourcedId, uri, fullStatement, humanCodingScheme, CFItemType,
                 parent, children[]}, CFAssociation[], search tokens }
Alignment    align.v1 { target:{kind: item|activity|module, id},
               cf_item:{framework, sourcedId, uri}, relation: assesses|teaches, weight? }
Achievement  achievement.v1 { achievement_id, achievement_version = hash(body), name,
               description, criteria, image_ref, achievementType, alignment[], validity?,
               rule: manual | mastery{cf_items, require: all|any} | completion{scope}
                   | grade{scope, min} | plan_completed,
               issuer_id, on_predicate_loss: flag|revoke|keep, certificate_template_ref? }
Mastery      NMRow{kind: mastery}: per subject { cf_item → {state: not_started|in_progress|
               mastered, score, evidence_n, fact_ids_used} }, cohort summary per cf_item,
               credential_conflicts[], vector_digest, policy_version, struct_snapshot
Plan         plan.v1 { plan_id, framework, cf_items:[{sourcedId, target_hlc?}], template_ref? }
Evidence     evidence.v1 { cf_item?, achievement_id?, kind: file|url|text|attempt, body_ref?,
               url?, text?, name, description, narrative, genre?, share: private|credential,
               rating?: {level: mastered|partial|not_yet, comment} (instructor only) }
Award        award.v1 { kind: rule|manual|reissue|clr|affirm, achievement_id,
               achievement_version, issuer_id, intent_id?, predicate_inputs?, narrative?,
               evidence_refs[], supersedes?, requested_by?, reason? }
Credential   OpenBadgeCredential | ClrCredential as compact JWS (VC-JWT, ES256)
               id = "urn:uuid:" + uuid5(NS_TRELLIS, issuer_did ‖ achievement_id ‖ subject_id ‖ award_fact_id)
Issue        issue.v1 { credential_id, kind, award_ref, vc_hash, blob_ref, kid, alg, validFrom,
               validUntil?, status:{onedtech_list, bitstring_list, index}, issuing_region }
Revocation   revoke.v1 { credential_id, issue_ref, reason, narrative, learner_message? }
OAuth        code = signed, encrypted JWT (5 min); access 1 h; refresh 30 d bound to consent fact
```

---

## Requirements

### Requirement: The system SHALL hold issuer profiles as tenant facts, identify each issuer by a `did:web` DID under the tenant hostname, and derive its DID document and JWKS in every region from the key registry, listing every active and verify-only key with rotation overlap [CRD-01]

`issuer.v1` (latest effective by `(sync_hlc, fact_id)`) names the issuer,
its `url`, image and key group; the tenant default is
`did:web:<tenant-host>` (`/.well-known/did.json`), further issuers
`did:web:<tenant-host>:issuers:<issuer_id>`. Signing keys are KMS asymmetric
multi-Region keys (ECC_NIST_P256; ADM, ADR-022) registered as immutable
`T#t#KEYS` items (FLS pattern 8) in states `active`, `verify_only` or
`compromised`; the DID document lists every non-`compromised` key, because
old credentials must still verify, and signing uses the newest `active` key
older than the overlap (replication lag + document cache TTL, 1 h).

#### Scenario: Key rotation with overlap
- **WHEN** an admin rotates an issuer's key at 09:00
- **THEN** credentials issued before 10:00 carry the old `kid` and later ones the new `kid`, both keys stay in the DID document indefinitely, and every credential ever issued verifies

#### Scenario: DID document fetched from a peer region
- **WHEN** a verifier resolves the DID in region B seconds after a key was registered in region A
- **THEN** B serves its replica's document; the new key may be absent until replication, which is why no credential is signed with a key younger than the overlap

### Requirement: The system SHALL import CASE 1.0 frameworks (CFDocument, CFItem, CFAssociation) from CASE REST providers or JSON files as content-addressed blobs with a region-owned derived index per framework, and record item and activity alignments as `align.v1` course structure facts [CRD-02]

`case-import` (Step Functions Standard) fetches
`GET {provider}/ims/case/v1p0/CFPackages/{sourcedId}` or takes an uploaded
CFPackage, validates it against the CASE 1.0 JSON schema, stores it at
`content/<sha256>` (CAC-03) and appends `framework.v1`; each region builds
its own index generation from the blob (CFItems with `isChildOf` parents and
children, associations, search tokens per ADR-016) at ≤ 500 writes/s. A
re-import is a new fact and generation; CFItems absent from it stay
resolvable and alignments to them are flagged `dangling`, never removed.
Editors write `align.v1` into the course `_struct` scope and remove by void.
Trellis targets **CASE 1.0 Consumer** conformance; the **Provider** role is
out of initial scope because Trellis does not author frameworks, and
tenant-local competencies are stored as CASE-shaped CFPackages so a Provider
projection is a later change with no migration.

#### Scenario: Import from a CASE provider
- **WHEN** an admin imports a 5,000-item framework by sourcedId
- **THEN** the package blob and one `framework.v1` fact exist, and within a minute each region's index answers the editor's picker query `GET /frameworks/{id}/items?q=fractions` from its own generation

#### Scenario: Re-import drops an aligned item
- **WHEN** a newer package omits CFItem `X` to which 12 quiz items are aligned
- **THEN** the alignments stay effective, appear as `dangling` in the competency report, and keep counting in mastery until an editor voids them

### Requirement: The system SHALL define achievements as versioned course or tenant structure facts whose latest effective version governs new awards and whose issuance-time version is embedded immutably in every credential [CRD-03]

`achievement.v1` lives in the course `_struct` scope (editor) or the tenant
`_admin` scope (admin); `achievement_version` is the hash of the body and is
recorded on every award and issuance. `https://<tenant-host>/achievements/
<achievement_id>` serves the latest version as an OB 3.0 Achievement and any
prior one with `?v=`. Editing never touches an issued credential; re-award
of holders under a new version is governed by
`policy.v1.credentials.reissue_on_version_change` (default `false`).

#### Scenario: Definition edited after issuance
- **WHEN** the criteria change after 300 credentials were issued under `v1`
- **THEN** those credentials still embed the `v1` Achievement, new awards embed `v2`, and `?v=v1` still resolves

#### Scenario: Achievement voided
- **WHEN** an editor voids an achievement definition
- **THEN** no new intents are created for it and issued credentials remain valid and verifiable

### Requirement: The system SHALL derive competency mastery as a non-monotone derivation, a threshold over the derived outcomes of aligned items, recomputed by MVA-07 as an NMRow of kind `mastery` stamped with its vector, with learning plans as policy facts and evidence as `evidence.v1` facts [CRD-04]

The mastery function is a derivation-engine module (DRV-02, DRV-03) linked
into `nm-recompute`: per learner and CFItem aligned in the partition's
published structure (CAC-12) it takes the final outcomes of aligned items
(override-aware, DRV-09), applies `policy.v1.competency { method, threshold,
min_items, rollup, instructor_rating }`, folds rated `evidence.v1` and rolls
parents up along `isChildOf`. A void, key correction, new alignment or
threshold change can lower it, so it is never folded or merged but replaced
wholesale as `NM#mastery` (cohort summary) plus `NM#mastery#L#<subject>`
(per-learner payload, rewritten only where row cursors moved), per
partition and, for course-scoped rules, under the CourseView (MVA-06). Plan
templates are `policy.v1.competency.plans[]`; a learner's `plan.v1` progress
is derived on read from their mastery items across the partitions in
`X#<subject>` (MVA-15); evidence and ratings are accepted unconditionally,
and evidence outside a plan is flagged `unplanned`.

#### Scenario: Void lowers mastery
- **WHEN** an instructor voids the response that took a learner over the 80% threshold on CFItem `M.3`
- **THEN** the next `nm-recompute` replaces the learner's payload with `M.3 = in_progress` and the new `vector_digest`, and any credential already issued on it is handled by CRD-15

#### Scenario: Regions disagree during replication lag
- **WHEN** region A has folded a late submission and region B has not
- **THEN** A's NMRow says `mastered` and B's `in_progress`, each served with its own vector, and neither is merged into the other

### Requirement: The system SHALL serve the instructor cohort competency report, the learner plan-progress view and suggested practice from mastery NMRows, with the vector they were computed at [CRD-05]

`GET /views/competency/{module}/{cohort}` returns per-CFItem counts and
per-learner states with the MVA-02 freshness block and explain links to
`fact_ids_used`, method and threshold (DRV-15 form); `GET /backpack/plans`
returns each plan's CFItems with state, advisory target date, evidence and,
for unmastered CFItems, aligned activities not yet attempted. A device may
compute mastery locally with the WASM engine and labels the source (MVA-10);
no content is withheld on a mastery predicate (ACT-11 posture).

#### Scenario: Report with work in transit
- **WHEN** two learners' streams have pending gaps
- **THEN** the report shows "2 devices have work in transit", marks their rows, and MVA Tension 1's rule on punitive actions applies

#### Scenario: Offline learner
- **WHEN** the device is offline
- **THEN** the plan view is derived on the device and labelled "computed on this device; not yet synced: 3 items"

### Requirement: The system SHALL record award decisions as `award.v1` facts, rule-based through an MVA SideEffectIntent behind a 24 h stability window or manual by an instructor, and issue credentials only in the home region as signed OpenBadgeCredentials with deterministic ids, stored as content-addressed blobs and recorded by `issue.v1` and the sent ledger [CRD-06]

Rule evaluation runs in `nm-recompute` after mastery: when a rule holds for
a subject with no effective credential for the `achievement_id`
(region-local backpack read) it creates `SideEffectIntent { kind:
credential, window: 24 h, payload: {achievement_id, achievement_version,
scopes[]} }` with `intent_id = sha256(tenant ‖ "credential" ‖ subject ‖
achievement_id ‖ achievement_version)`, identical in every region; the wait
is a Step Functions Standard `Wait` (project §5.2), after which
`intent-evaluator` applies MVA-08 with the quiet period taken over
`payload.scopes`, re-arms rather than drops in a non-home region until some
region's ledger holds `award#<intent_id>`, and fires after at most
`max_deferral` (default 7 days) of consecutive successful re-evaluations.
The home region's `credential-emitter` consumes `effect.ready`, reads every
region's ledger, appends `award.v1 { kind: rule, intent_id }` as the region
system device and issues; a manual `award.v1 { kind: manual }` from an
instructor in any region is issued by the home region on fold with no
window. Issuance builds the credential (CRD-07) with the Domain model's `id`
(uuid5 over issuer DID, achievement, subject and award `fact_id`) and
`validFrom` from the award fact's `sync_hlc`, signs it as a VC-JWT (ES256,
`kid` = DID URL of the current key, KMS `Sign` with the issuer's asymmetric
multi-Region key), stores the compact JWS at `content/<sha256>` encrypted
under the subject's data key, appends `issue.v1`, writes ledger
`credential#<award_fact_id>` and publishes `credential.issued` for COM-07;
since the id is a pure function of the award fact, a repeated issuance over
the same award fact during a home-region flip yields the same `id` and
consumers dedupe. A Data Integrity `ecdsa-rdfc-2019` proof is a later change
(RDF canonicalisation cost).

#### Scenario: Rule-based award for an active learner
- **WHEN** a learner masters every CFItem of an achievement on Monday and keeps practising in the same module daily
- **THEN** the intent re-arms each day the quiet period fails, fires on the first day with 24 h of quiet in the aligned scopes or on day 7 at the latest, and issues only if the predicate still holds at a vector dominating `decided_at_vector`

#### Scenario: Same award fact issued twice during a flip
- **WHEN** region A issues for an award fact and, before `issue.v1` replicates, the home flips to B and B drains pending awards
- **THEN** both `issue.v1` facts carry the same `credential_id`, the backpack shows one credential with `duplicates = [1]`, and the learner may receive two notifications (Tension 3)

### Requirement: The system SHALL issue OpenBadgeCredentials conforming to the Open Badges 3.0 AchievementCredential schema, identifying the subject by a salted hash, embedding the issuance-time Achievement, carrying `validUntil` from the achievement's validity and a `credentialStatus` naming the issuer's status lists [CRD-07]

The credential carries the VC Data Model 2.0 and OB 3.0 contexts, `type:
[VerifiableCredential, OpenBadgeCredential]`, the issuer Profile with its
DID, `credentialSubject { type: AchievementSubject, identifier: [{ type:
IdentityObject, identityType: emailAddress, hashed: true, salt, identityHash
}], achievement }`, `evidence[]` from the award's `evidence_refs` (CRD-13),
`credentialSchema` naming the OB 3.0 JSON schema, and `credentialStatus`
entries of type `1EdTechRevocationList` and `BitstringStatusListEntry`
(CRD-09); `validUntil = validFrom + validity.duration` when set. The payload
is validated against the OB 3.0 schema before signing; a failure alarms and
retries after the next definition change, never a partial issuance.

#### Scenario: Subject identity
- **WHEN** a credential is issued to a learner whose profile email is `a@example.edu`
- **THEN** it holds `sha256$` of the salted lower-cased email and no plaintext email, and a wallet that knows the email can match it

#### Scenario: Two-year validity
- **WHEN** the achievement sets `validity.duration = P2Y`
- **THEN** `validUntil` is two years after `validFrom` and no status-list entry is needed for expiry

### Requirement: The system SHALL let holders download credentials as VC-JWT, baked PNG or SVG, or a certificate rendered from the credential (HTML, PDF when enabled), and expose a verification endpoint that checks signature, validity period and status against the serving region's derived status data, reporting the vector that status was computed at [CRD-08]

`GET /credentials/{id}?format=jwt|json|png|svg` serves the subject's session,
roles authorised over the subject (IDE-09) or a share token (CRD-12), the id
resolved through the `CID` map; PNG baking inserts an `iTXt` chunk keyed
`openbadgecredential` holding the compact JWS into the achievement image,
SVG baking adds `<openbadges:credential verify="…"/>` in the
`https://purl.imsglobal.org/ob/v3p0` namespace, and baked artefacts are
cached at `derived/<sha256>` and served only through signed regional URLs.
`GET /credentials/{id}/certificate?format=html|pdf` renders the
achievement's tenant template from the credential, the current profile
display name (IDE-04, labelled as such because the credential carries only a
hashed identity), the id and a verification QR code, with a `REVOKED`
watermark from `SL#R#` at render time and PDF behind a feature flag (ADM-05;
`406` with the HTML alternative when off). `POST /credentials/verify`
accepts a compact JWS, credential JSON or baked image, checks `kid` against
the issuer's DID document, the signature, `validFrom`/`validUntil`, the
schema and revocation from `T#t#CRD#SL#<issuer>`, and returns the checks
with `status_freshness { vector_digest, max_sync_hlc, region }`; a foreign
issuer returns `unsupported_issuer` (CRD-17).

#### Scenario: Baked PNG round trip
- **WHEN** a learner downloads the PNG and uploads it to the verifier
- **THEN** the JWS is extracted from the chunk, verifies, and the report names the achievement, the salted subject hash and `revoked = false` with the status vector

#### Scenario: Revocation not yet replicated
- **WHEN** a credential was revoked in region A 2 s ago and the verifier lands in region B
- **THEN** B reports `valid` with `status_freshness` showing B's `max_sync_hlc` and states that later revocations are not visible

### Requirement: The system SHALL revoke credentials by `revoke.v1` facts from which every region derives per-issuer status lists (W3C Bitstring Status List and 1EdTech Revocation List) published as JSON blobs at stable URLs, accepting that a revoked credential may verify as valid for the replication-lag window [CRD-09]

`revoke.v1` is written by an admin, an issuer-role principal, or the region
system device for policy-driven revocations (CRD-14, CRD-15); the status
derivation is grow-only, so an effective revocation is permanent (the
Bitstring `revocation` purpose is irreversible; re-award is a new award
fact, CRD-16). `backpack-updater` writes `R#<credential_id>` under
`T#t#CRD#SL#<issuer>`, and `status-list-builder` (every region, debounced
30 s, plus hourly) rebuilds the 1EdTech `revokedCredential` list and the
signed `BitstringStatusListCredential` (131,072-bit lists; `statusListIndex`
allocated at issuance from the region-striped counter `CTR#<region>`,
recoverable from `issue.v1`), stores both at `content/<sha256>` and
CAS-updates `SL#HDR`. `crd-api` serves them in every region at
`https://<tenant-host>/ims/ob/v3p0/status/<issuer_id>/revocations` and
`…/bitstring/<n>` through CloudFront with a 60 s cache (edge-cacheable, as
they hold no personal data): the TTL bounds artefact staleness, while
content freshness is the `vector_digest` and `max_sync_hlc` embedded under
`trellis:freshness`. A revocation is visible in the writing region within
about 35 s and in a peer only after replication, fold and cache expiry;
until then a verifier there sees `valid`, and the learner is notified
through COM-07 with `learner_message`.

#### Scenario: Admin revokes
- **WHEN** an admin revokes a credential in region A at 10:00:00
- **THEN** A's lists include it by 10:00:35, B's after replication plus its own rebuild, and the verifier report in either region shows that list's `max_sync_hlc`

#### Scenario: Both indexes of a double issuance
- **WHEN** a credential id was issued twice with two bitstring indexes
- **THEN** the revocation sets both bits, because `X#<credential_id>` lists every index tied to the id

### Requirement: The system SHALL expose the Open Badges 3.0 API issuer side in every region, with discovery, RFC 7591 dynamic client registration, OAuth 2.0 authorization-code grant with PKCE behind a learner consent screen, `GET /ims/ob/v3p0/credentials` and `GET /ims/ob/v3p0/profile`, using tokens verifiable in every region [CRD-10]

`GET /ims/ob/v3p0/discovery` (unauthenticated) returns the service
description with `x-imssf-registrationUrl`, `x-imssf-image`, privacy and
terms URLs and the `OAuth2ACG` scheme naming `/oauth2/authorize`,
`/oauth2/token`, `/oauth2/register` and the `credential.readonly` and
`profile.readonly` scopes (upsert and update scopes are not offered,
CRD-17); registration mints `client_id = "ob_" + hash(tenant ‖ client_uri ‖
redirect_uris)` (deterministic, as LTI-15) and appends `ob.client.v1`.
`/oauth2/authorize` requires a session (IDE-03), renders the consent screen
(client name and logo, scopes, the credentials to share: all or a
selection), appends `consent.v1 { kind: ob3_client, client_id, scopes,
credential_ids|all }` on grant and issues a code that is a signed, encrypted
JWT `{ client_id, redirect_uri, code_challenge, scope, sub, consent_ref,
jti, exp: +5 min }` redeemable in any region; `/oauth2/token` verifies the
code, the S256 verifier and client authentication, records `jti` in
`T#t#CRD#NONCE` (region-local conditional put, TTL 10 min: single use per
region, project §4.9, so a code redeemed in two regions within the
replication lag yields two token pairs for one consent, counted as
`oauth.code_reuse`) and mints ES256 access (1 h) and refresh (30 d, bound to
`consent_ref`) tokens under the session keys (IDE-03, ADM). `getCredentials`
returns `{ compactJwsString: [...] }` for the credentials the consent covers,
one JWS per credential id (the canonical `issue.v1` by lowest `(sync_hlc,
fact_id)`), revoked ones included unless `status=active`, with `limit`,
`offset`, `since` and the headers `X-Total-Count`, `Link rel="next"`,
`X-Trellis-Epoch` and `X-Trellis-Freshness`; `since` compares with the
issuance `sync_hlc`, and a home-region flip bumps the tenant interop epoch
(ADR-018) so a stale-epoch client re-pulls in full. `getProfile` returns the
resource owner's `Profile` (`id`, `name`, `email` when consented) per IDE-04;
a withdrawal `consent.v1 { status: withdrawn }` makes bound tokens fail once
it folds.

#### Scenario: Consent in one region, token and pull in another
- **WHEN** a wallet registers and the learner consents in region A and the token request and `getCredentials` land in region B
- **THEN** B verifies the code with its JWKS, checks PKCE, mints tokens and serves the consented credentials from its backpack with `X-Trellis-Freshness`

#### Scenario: Epoch changed by a flip
- **WHEN** the wallet presents `since` with a previous epoch
- **THEN** the response ignores `since`, returns the full set and carries the new `X-Trellis-Epoch`

#### Scenario: Consent withdrawn
- **WHEN** the learner disconnects the wallet
- **THEN** the next refresh or credentials call in any region that has folded the withdrawal answers `401 invalid_token`

### Requirement: The system SHALL issue CLR 2.0 ClrCredentials bundling a learner's achievement credentials, results and evidence, on learner request or on programme completion, through the same home-region issuance path with deterministic ids [CRD-11]

A `ClrCredential { type: [VerifiableCredential, ClrCredential],
credentialSubject: ClrSubject { identifier, achievement[], association[]?,
verifiableCredential: [embedded OpenBadgeCredential JWS…], result[]? } }`
embeds the canonical JWS of each included credential not revoked at
issuance. A learner request `POST /backpack/clr` makes the region system
device append `award.v1 { kind: clr, requested_by: self, selection }`;
programme completion (`policy.v1.credentials.programme` over course-level
NMRows) creates an intent of kind `clr` behind the 24 h window; issuance
follows CRD-06 with `id = uuid5(NS_TRELLIS, issuer_did ‖ "clr" ‖ subject_id
‖ award_fact_id)`. The CLR API (`GET /ims/clr/v2p0/discovery`,
`GET /ims/clr/v2p0/clrs`, `GET /ims/clr/v2p0/profile`) uses the CRD-10 OAuth
flow with the CLR scopes.

#### Scenario: Learner requests a record
- **WHEN** a learner with 12 credentials requests a CLR from region B
- **THEN** the award fact replicates, the home region issues a ClrCredential embedding the 12 JWSs, and it appears in `GET /ims/clr/v2p0/clrs` from any region after fold

#### Scenario: Embedded credential revoked later
- **WHEN** one of the 12 is revoked after the CLR was issued
- **THEN** the CLR remains valid, the embedded credential shows revoked through its own status entry, and the learner can request a fresh CLR (new award fact, new id)

### Requirement: The system SHALL derive a per-subject learner backpack in every region from award, issue, revoke, evidence, plan and consent facts, served with its freshness and shareable through revocable share links [CRD-12]

`backpack-updater` folds `fact.folded` events for the subject into
`T#t#CRD#BP#<subject>` (`HDR`, `C#<credential_id>`, `P#<plan_id>`,
`E#<fact_id>`, `A#<client_id>`) with a region-local CAS on `version`,
collapsing duplicates by credential id (canonical plus `duplicates[]`) and
taking status from `SL#R#`. `GET /backpack` serves the subject and
`GET /backpack/{subject}` instructors and observers per IDE-09; a share link
is an ES256 capability token for one credential recorded as `consent.v1 {
kind: share_link }` and withdrawn by a superseding fact. The learner's device
pulls `issue.v1` with its `_profile` stream (FLS-10) and can show the
credential offline, fetching the blob when connected.

#### Scenario: Derived table lost
- **WHEN** a region's `derived` table is deleted
- **THEN** replaying each subject's `_profile` and module facts regenerates every backpack, `PEND`, `CID` and `SL#` item with no loss

#### Scenario: Share link withdrawn
- **WHEN** the learner withdraws a share link in region A
- **THEN** region B honours it until the withdrawal folds there (seconds), after which the link answers `410`

### Requirement: The system SHALL store evidence attachments as content-addressed blobs referenced by `evidence.v1` facts, embed them in credentials only when the learner has chosen to share them, and serve them by capability URL [CRD-13]

Files are uploaded through `POST /blobs/presign` (FLS-12) and referenced by
`body_ref`; an evidence fact is accepted before its blob arrives
(`blob_pending`) and never refused for being duplicated or unplanned.
Evidence with `share = credential` named in an award's `evidence_refs`
becomes `evidence[]` entries whose `id` is
`https://<tenant-host>/evidence/<fact_id>?t=<capability>`, an ES256 token
bound to `(fact_id, blob hash)`; `GET /evidence/{fact_id}` verifies it and
redirects to the CloudFront blob URL (origin-group failover, ADR-017). A void
of the evidence fact makes the URL answer `410` after fold; erasure (ADM-11)
destroys the blob's data key.

#### Scenario: Large evidence
- **WHEN** a learner attaches an 80 MB video to CFItem `M.3` offline
- **THEN** the fact syncs first and shows `blob_pending`, the upload completes later against the presigned checksum, and the evidence appears in the plan view

#### Scenario: Evidence voided after inclusion
- **WHEN** the learner voids evidence that an issued credential references
- **THEN** the credential still verifies (evidence is by reference) and the evidence URL answers `410`

### Requirement: The system SHALL reconcile duplicate issuances, which the model permits during a home-region flip, by deterministic-id collapse where the award fact is shared and by a revocation-with-apology workflow where two award facts exist [CRD-14]

On ADM-03 `home.changed` the new home's `credential-emitter` drains
`T#t#CRD#PEND` (award facts with no `issue.v1` in this replica) after reading
every region's ledger. Case (a), one award fact issued twice: two `issue.v1`
facts share one id, the backpack keeps the canonical one and records the
other as `duplicate_of`, and nothing is revoked. Case (b), one `intent_id`
with two `award.v1` facts because both regions fired inside the flip window
(about 90 s, LTI Tension 1): `backpack-updater` detects two effective awards
for one `intent_id` and the home region starts Step Functions Standard
`credential-reconcile`, which waits up to 7 days for an instructor or admin
decision and at timeout appends `revoke.v1 { reason: duplicate_issuance,
learner_message }` for the later credential; `credential.duplicate` counts
both cases.

#### Scenario: Backlog drained after a flip
- **WHEN** region A fails with 40 award facts unissued and B becomes home
- **THEN** B issues the 40 with entries in its own ledger, and any that A had in fact issued surface later as case (a) duplicates

#### Scenario: Two award facts for one intent
- **WHEN** A and B each append an `award.v1` for the same `intent_id` 20 s apart
- **THEN** two credentials with different ids exist, the instructor is asked which to keep, and the learner receives one message explaining the duplicate and the revocation

### Requirement: The system SHALL treat issuance as final: when a later fact makes an award's predicate false, the system SHALL flag the credential for review and revoke only by an explicit or policy-driven `revoke.v1` with a learner-facing explanation [CRD-15]

After each mastery recompute the rule evaluator compares held rule-based
credentials with their predicates and records losses in
`credential_conflicts[]` and as `credential.predicate_lost`. In the home
region, `on_predicate_loss = flag` (default) starts Step Functions Standard
`credential-review`, which waits up to 14 days for an instructor decision:
`keep` appends `award.v1 { kind: affirm }` so the conflict stops re-flagging
and `revoke` appends `revoke.v1`; the `revoke` policy appends `revoke.v1 {
reason: predicate_no_longer_holds, learner_message }` as the region system
device after a second 24 h window in which the predicate stays false; the
`keep` policy only records the conflict. The fact that caused the loss is
never rejected, and a credential is never silently withdrawn.

#### Scenario: Submission voided after issuance
- **WHEN** an instructor voids the submission that completed an awarded achievement
- **THEN** the credential enters the review queue with the void's `fact_id` and remains valid until a decision or the 14-day default

#### Scenario: Key correction lowers a cohort
- **WHEN** a corrected answer key drops 40 holders below threshold
- **THEN** 40 conflicts are grouped by achievement in one review, and a `keep` decision affirms all 40 with one action

### Requirement: The system SHALL express expiry as `validUntil` inside the credential and re-issue by a new award fact, for renewal, key compromise or a changed definition, producing a new credential id and leaving the prior credential's status untouched unless policy revokes it as superseded [CRD-16]

Expiry needs no status entry: verifiers compare `validUntil` and the
backpack shows `expired`. Under `policy.v1.credentials.renew = auto`, rule
evaluation treats an expired credential as not held so the intent fires
again behind the window; `manual` renewal is an instructor's `award.v1 {
kind: reissue, supersedes }`. A key marked `compromised` starts `key-reissue`
(Step Functions Distributed Map, concurrency 50), which re-awards every
credential signed under it with `reason: key_compromise` and revokes the
originals while the DID document drops the key. A re-award after revocation
is likewise a new award fact and therefore a new id.

#### Scenario: Automatic renewal
- **WHEN** a credential with `P1Y` validity expires while the learner still meets the rule
- **THEN** a new intent fires after the window, a new credential with a new id and `validFrom` is issued, and the expired one stays in the backpack marked `expired`

#### Scenario: Key compromise
- **WHEN** an issuer key with 20,000 credentials is marked compromised
- **THEN** all 20,000 are re-issued under the new key within an hour and the originals appear in the status lists with reason `key_compromise`

### Requirement: The system SHALL declare only the Issuer role for Open Badges 3.0 and CLR 2.0 and the Consumer role for CASE 1.0 in its discovery documents, and answer Host, Displayer, Provider and OB 2.0 operations with an explicit `501 not_supported` problem document [CRD-17]

Out of initial scope, with reasons: the OB 3.0 and CLR 2.0 **Host** role
(`POST …/credentials`, `PUT …/profile`), which would make third-party
authored mutable profile state the only such state in the system while
learners already use external wallets; the **Displayer** role, which needs a
cache of foreign issuers' DID documents and status lists with its own
staleness semantics and serves no formative need; the CASE **Provider** role
(CRD-02); **OB 2.0 export**, whose hosted assertions are mutable server state
with an in-place `revoked` flag at a stable URL, contrary to ADR-002 and
ADR-003, and whose need the 3.0 status list meets; and **endorsements**
(`EndorsementCredential`), which need third-party signing keys and a second
issuance pipeline and can be added later without changing issued
credentials. Discovery omits the corresponding scopes and paths.

#### Scenario: Wallet pushes a credential
- **WHEN** a wallet calls `POST /ims/ob/v3p0/credentials`
- **THEN** the response is `501` with a problem document naming the Host role as unsupported and linking the issuer discovery document

#### Scenario: OB 2.0 assertion URL
- **WHEN** a legacy backpack requests an OB 2.0 hosted assertion
- **THEN** the response is `404` with a pointer to the 3.0 download and verification endpoints

---

## DynamoDB access patterns

### `facts` (global, one per residency zone)

| # | Item | PK | SK | Notes |
|---|---|---|---|---|
| 1 | Course facts `align.v1`, `achievement.v1` | `T#t#S#C#<course>` | `F#_struct#<dev>#<seq10>` | Editor streams; index rebuild uses FLS pattern 3 |
| 2 | Tenant facts `framework.v1`, `issuer.v1`, `achievement.v1` (tenant), `ob.client.v1` | `T#t#S#T#<tenant>` | `F#_admin#<dev>#<seq10>` | Admin or `dev_sys_<region>` streams |
| 3 | Subject facts `award.v1`, `issue.v1`, `revoke.v1`, `plan.v1`, `consent.v1` | `T#t#S#L#<usr>` | `F#_profile#<dev>#<seq10>` | `issue.v1` only from `dev_sys_<home>` |
| 4 | `evidence.v1` | `T#t#S#L#<usr>` | `F#<module>#<dev>#<seq10>` | Body > 4 KB → `body_ref` (FLS-12) |
| 5 | Sent ledger, decision | `T#t#LEDGER#<region>#crd` | `award#<intent_id>` | Region-owned, channel shard per FLS pattern 7; read from every region before deciding |
| 6 | Sent ledger, issuance | `T#t#LEDGER#<region>#crd` | `credential#<award_fact_id>`, `clr#<award_fact_id>` | Idempotency for retries and flips |
| 7 | Key registry (read only, ADM) | `T#t#KEYS` | `K#<kid>` | Key group `issuer:<issuer_id>`; states |

### `derived` (regional)

| Item | PK | SK | Size | Access |
|---|---|---|---|---|
| Framework header | `T#t#CRD#FW#<sourcedId>` | `HDR` | 1 KB | Generation switch (CAS) |
| CFItem | same | `G#<gen>#I#<sourcedId>` | 1–2 KB | GetItem; children listed in the parent item |
| CFAssociation | same | `G#<gen>#A#<sourcedId>` | small | Query prefix for a CFItem |
| Search token | same | `G#<gen>#S#<token>` | ≤ 50 KB | Picker prefix Query (ADR-016) |
| Alignment index | `T#t#CRD#AL#<course>` | `T#<target>#<fw>#<cfitem>`, `C#<fw>#<cfitem>#<target>` | 300 B | Both directions; `dangling` flag |
| Achievement index | `T#t#CRD#ACH#<course or tenant>` | `A#<achievement_id>` | 2 KB | Latest version plus version list |
| Mastery NMRow (MVA layout) | `T#t#V#<module>#<cohort>` / `T#t#VC#<course>#<cohort>` | `NM#mastery`, `NM#mastery#L#<subject>` | 2 KB each | Replaced wholesale; per-learner items only where cursors moved |
| Backpack | `T#t#CRD#BP#<subject>` | `HDR`, `C#<credential_id>`, `P#<plan_id>`, `E#<fact_id>`, `A#<client_id>` | ≤ 1 KB each | Query prefix; CAS on version |
| Pending awards | `T#t#CRD#PEND` | `A#<award_fact_id>` | 200 B | Flip catch-up; deleted when `issue.v1` folds |
| Credential id map | `T#t#CRD#CID` | `<credential_id>` | 150 B | id → subject, blob, issue fact; replaces a GSI |
| Status-list state | `T#t#CRD#SL#<issuer>` | `HDR`, `CTR#<region>`, `R#<credential_id>`, `X#<credential_id>` | small | CAS on `HDR` and `CTR#` |
| OAuth nonce | `T#t#CRD#NONCE` | `<jti>` | tiny | Conditional put; TTL 10 min |
| Client index | `T#t#CRD#CLI` | `<client_id>` | 1 KB | From `ob.client.v1`; cached 60 s |
| Review / reconcile state | `T#t#CRD#REV#<subject>` | `<credential_id>` | small | Step Functions task token |

**GSIs.** None. The only lookup not keyed by a known subject, course,
issuer or framework is credential id → subject, served by the `CID` map.

**Item collection sizing.** A 5,000-item framework: 5,000 × 1.5 KB + 2,000
associations × 0.3 KB + ~10 MB of search tokens ≈ 18 MB per region.
Alignment index per course: 500 items × 3 alignments × 2 directions × 0.3 KB
≈ 1 MB. Backpack: 10 credentials × 1 KB + plans and evidence ≈ 15 KB per
learner (150 MB per 10,000 learners). `CID`: 100,000 credentials/year × 150 B
≈ 15 MB per tenant-year. Mastery: 2,000 learners × 2 KB ≈ 4 MB per
partition. No LSIs, so the 10 GB collection limit does not apply.

**Hot-partition risk.** `T#t#CRD#PEND`, `T#t#CRD#CID` and `SL#…#CTR#<region>`
take one write per issuance on a single PK per tenant: 10,000 issuances a
month at L10k is 0.004 writes/s, and a term-end burst of 10,000 intents
firing in one hour is bounded by the emitter's concurrency (20 × ~4
issuances/s ≈ 80 writes/s per PK), far under the 1,000 WCU/s ceiling and
under the KMS asymmetric `Sign` quota. At 1M a million-intent burst is a
throughput problem (≈ 3.5 h at concurrency 20), not a heat problem; raising
concurrency to 200 requires sharding `PEND` and `CID` by `hash(subject) mod
16`. Framework index builds are paced at ≤ 500 writes/s; the ledger PK stays
under 1 write/s.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `case-fetch`, `case-index` (inside Step Functions Standard `case-import`) | HTTP API `POST /frameworks/import` | Java 21 SnapStart, 1024 MB | 2–20 s per package | 300 / 700 ms | Fetch or upload, schema check, blob, fact; index paced ≤ 500 writes/s |
| `crd-index-updater` | EventBridge `fact.folded` (structure and tenant types) → SQS FIFO `crd-index`, group = course or tenant, batch 10 | Rust, 512 MB | 5 ms/fact | 20 / 60 ms | Alignment, achievement, client, issuer indexes |
| (in-process) mastery and rule evaluation | Linked into `nm-recompute` (MVA-07) | Rust | +5–50 ms/run | — | Writes changed `NM#mastery#L#` items; creates intents |
| `credential-wait` | Step Functions Standard `Wait` 24 h → `intent-evaluator` (MVA-08) | — | — | — | Re-arms up to `max_deferral` |
| `credential-emitter` | EventBridge `effect.ready {kind: credential, clr}` and `fact.folded {award.v1}` → SQS FIFO `crd-emit`, group = subject, max concurrency 20; home region only | Java 21 SnapStart, 1024 MB | 250 ms | 350 / 800 ms | Cross-region ledger reads, KMS `Sign`, S3 PUT, two facts, ledger, event |
| `backpack-updater` | EventBridge `fact.folded` (subject types) → SQS FIFO `crd-subject`, group = subject | Rust, 512 MB | 10 ms/fact | 20 / 60 ms | `BP`, `PEND`, `CID`, `SL#R#`; starts reconcile and review |
| `status-list-builder` | EventBridge `credential.revoked` → SQS delay 30 s; Scheduler hourly per issuer | Rust, 512 MB | 100–500 ms | 20 / 60 ms | Both lists, KMS `Sign`, S3 PUT, CAS `HDR` |
| `crd-api` | HTTP API `/frameworks/*`, `/achievements/*`, `/backpack/*`, `/credentials/*`, `/evidence/*`, `/views/competency/*`, DID documents, status URLs | Java 21 SnapStart, 512 MB | 20–60 ms | 300 / 700 ms | Baking and verification in-process |
| `ob3-api` | HTTP API `/ims/ob/v3p0/*`, `/ims/clr/v2p0/*`, `/oauth2/*` | Java 21 SnapStart, 512 MB | 15–40 ms | 300 / 700 ms | Tokens signed via KMS with IDE-03 keys |
| `certificate-render` | HTTP API `GET /credentials/{id}/certificate` | Java 21 SnapStart, 1536 MB | 300 ms HTML / 1.5 s PDF | 500 / 1200 ms | Cached by hash; PDF behind ADM-05 flag |
| `credential-reconcile`, `credential-review` | Step Functions Standard, task-token wait ≤ 7 / 14 days | Java 21, 512 MB | — | 300 / 700 ms | Appends `revoke.v1` or `award.v1 {affirm}` on decision or timeout |
| `key-reissue` | Step Functions Distributed Map, concurrency 50, on key `compromised` | Java 21, 1024 MB | 250 ms/credential | 350 / 800 ms | Re-award plus revoke |

## Propagation path

1. Structure and tenant facts (`align.v1`, `achievement.v1`, `framework.v1`,
   `issuer.v1`, `ob.client.v1`) → `facts` → per-region DynamoDB Stream →
   `stream-router` → SQS FIFO `roster` → `roster-updater` → EventBridge
   `fact.folded` → rule on type → SQS FIFO `crd-index` (group = course or
   tenant) → `crd-index-updater` → indexes; a `framework.v1` starts
   `case-index` in every region to build a new generation from the blob.
2. Learner facts fold (MVA-03) → `view.updated` → `nm-recompute` (MVA-07) →
   mastery NMRows and rule evaluation → `SideEffectIntent {kind: credential
   | clr, window: 24 h}` → Step Functions Standard `credential-wait` →
   `intent-evaluator` (MVA-08; quiet period over `payload.scopes`; re-arm
   ≤ 7 days; non-home regions re-arm until a ledger entry exists) →
   EventBridge `effect.ready`.
3. Home region only (rule enabled by the ADM-03 registry): `effect.ready` →
   SQS FIFO `crd-emit` (group = subject) → `credential-emitter` → ledger
   reads in every region → `award.v1` (region system device) → KMS `Sign` →
   S3 blob → `issue.v1` → ledger `credential#…` → EventBridge
   `credential.issued` → COM-07 notification under its own ledger.
4. Manual award: instructor `award.v1` via `POST /sync/v1` in any region →
   `fact.folded` → home-region rule → `crd-emit` → step 3 from `Sign`. A
   learner's CLR request → `crd-api` appends `award.v1 {kind: clr}` → same.
5. `award.v1`, `issue.v1`, `revoke.v1`, `evidence.v1`, `plan.v1`,
   `consent.v1` → `fact.folded` → SQS FIFO `crd-subject` (group = subject)
   → `backpack-updater` → `BP`, `PEND`, `CID`, `SL#R#` → EventBridge
   `credential.revoked` → SQS delay 30 s → `status-list-builder` (every
   region) → signed blob + `SL#HDR` → `crd-api` behind CloudFront (60 s).
6. Flip and apologies: ADM-03 `home.changed` → `credential-emitter` (new
   home) drains `PEND` with ledger checks; `credential.duplicate` and
   `credential.predicate_lost` → Step Functions Standard
   `credential-reconcile` / `credential-review` (home) → human decision or
   timeout → `revoke.v1` or `award.v1 {affirm}` → step 5.
7. Anti-entropy repairs (FLS-14) re-enter steps 1 and 5; the hourly
   status-list rebuild covers any event missed on the way.

Telemetry per region (ADM-08): intent deferrals, issuance latency from award
fact to ledger entry, duplicates by case, open reviews, status-list build lag
(`now − max_sync_hlc` of the published list), verification outcomes by
reason, `oauth.code_reuse`, KMS `Sign` throttles; alarms on issuance latency
p99 > 10 min after the window, status-list lag > 5 min and any KMS throttle.

## Cost model

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Mastery inside NM recompute | 200 k runs × 6 WRU × 2 regions = 2.4 M WRU ≈ $1.5; compute 200 k × 20 ms × 1 GB ≈ $0.15 → **$1.7** | $170 | Regional WRU $0.625/M; rows already read by MVA |
| Course-level mastery and rule evaluation | 100 k runs × (8 RRU + 4 WRU × 2 regions) ≈ 0.8 M RRU + 0.8 M WRU → **$0.6** | $60 | |
| Stability wait (Step Functions Standard) | 10.5 k intents × 5 transitions + 2 re-arms × 2 transitions ≈ 95 k × $25/M → **$2.4** | $240 | 24 h `Wait`; Scheduler one-shots at $1/M would cut this 20× |
| Issuance (10 k OB + 0.5 k CLR) | KMS 10.5 k × $0.03/10k = $0.03; S3 PUT $0.05; Lambda 10.5 k × 0.3 s × 1 GB ≈ $0.05; 4 replicated items × 10.5 k × 2 regions ≈ 92 k rWRU ≈ $0.09; SQS/EventBridge $0.02 → **$0.25** | $25 | Emails counted in COM |
| Other credential-side facts (evidence, plan, revoke, consent ≈ 20 k) | 20 k × 1.2 rWRU × 2 regions = 48 k rWRU → **$0.05** | $5 | $0.9375/M rWRU |
| Index and backpack updaters | 60 k folded facts × 2 regions × 3 WRU = 360 k WRU → **$0.25** | $25 | Rust compute negligible |
| Status lists | (100 revocations + 1,440 hourly) × 2 regions × (Sign + 2 PUT + 0.3 s × 0.5 GB) → **$0.05**; 50 k fetches within CloudFront free tier | $2 | Lists ≤ 100 KB |
| KMS key rental | 2 issuers × 2 regions × $1 = $4; $8 during rotation overlap → **$4–8** | $40–80 (20 issuers) | Scales with issuers, not learners |
| APIs (backpack 50 k, verify 50 k, OB3/CLR 5 k) | 105 k × $1/M + 105 k × 50 ms × 0.5 GB → **$0.15** | $15 | DID and status via CloudFront |
| Certificates (5 k, PDF) | 5 k × 1.5 s × 1.5 GB = 11 k GB-s → **$0.2** | $20 | HTML is ~5× cheaper |
| CASE imports (5 per year) | Step Functions ~50 transitions + 15 k WRU × 2 regions per import → **$0.01** | $0.5 | |
| Blob storage and CRR (VCs 50 MB/month cumulative, frameworks 25 MB, evidence ~5 GB) | 5 GB × $0.023 × 2 + 5 GB × $0.02 → **$0.35** | $35 | Evidence dominates |
| Derived storage | ~0.4 GB × 2 regions × $0.25 → **$0.2** | $20 | |
| Reconcile and review workflows | ≤ 200 per month × 10 transitions → **$0.05** | $5 | |
| **Total** | **≈ $10–14 / month** | ≈ $670–710 | KMS rental and the 24 h waits dominate at L10k; the wait cost is the non-linearity to watch |

## Standards conformance

| Standard | Role | Target conformance | In scope | Out of scope and why | Where the eventually-consistent model conflicts and how it is resolved |
|---|---|---|---|---|---|
| 1EdTech CASE 1.0 | Consumer | CASE 1.0 Consumer (CFPackage via REST or file; hierarchy, associations, display) | CRD-02 import, per-region index, picker, alignments, re-import | Provider: Trellis authors no frameworks; local competencies are stored CASE-shaped for a later projection. CFRubrics: marking rubrics are CAC-07 | The import is immutable (blob + fact). A re-import is a new generation per region, so two regions may briefly show different framework versions; the picker labels the generation and alignments survive by sourcedId |
| Open Badges 3.0 (on W3C VC Data Model 2.0, VC-JOSE, `did:web`, Bitstring Status List, 1EdTech Revocation List) | Issuer | 1EdTech OB 3.0 Issuer certification including the OB3 API: discovery, RFC 7591 registration, authorization code + PKCE, `getCredentials`, `getProfile`; VC-JWT ES256 | CRD-01, CRD-06 to CRD-10, CRD-12 to CRD-16 | Host (`upsertCredential`, `putProfile`): third-party mutable profile state; learners use external wallets. Displayer: foreign-issuer verification cache. Endorsements: third-party keys. Data Integrity `ecdsa-rdfc-2019`: RDF canonicalisation cost, later change. RS256 kept as a tenant fallback pending the certification suite's ES256 support | **Status-list lag:** a revoked credential verifies as valid in a peer region for replication + fold + 60 s cache; the list embeds its vector and the verifier report states it. **Double issuance:** one shared award fact gives one id (dedupe by id); two award facts give two ids, reconciled by a review-and-revoke workflow. **Mastery non-monotone:** awards fire only after a 24 h stability window at a dominating vector; at most one award per `intent_id` per region ledger. **Award reversal after issuance:** nothing un-issues; a lost predicate becomes a flagged review or a policy revocation with a learner-facing explanation |
| 1EdTech CLR 2.0 | Issuer | CLR 2.0 Issuer: `ClrCredential`, CLR API read side, discovery | CRD-11 | Host: same reasons as the OB 3.0 Host | As for OB 3.0. An embedded credential revoked after the CLR is issued stays embedded and shows revoked through its own status entry; the learner requests a fresh CLR (new id) |

## Known Tensions

1. **Issuance is irrevocable except by revocation.** Where the model breaks:
   a signed credential in a wallet is outside the fact set, so a late fact
   that would have prevented the award cannot un-issue it. Symptom: a
   learner holds a badge they no longer qualify for, then receives a
   revocation with an apology. Options: (A) flag for instructor review with
   a 14-day default of keeping it (CRD-15); (B) automatic revocation after
   a second 24 h window; (C) never revoke on predicate loss, only on error.
   Recommendation: A by default, B per achievement for compliance-type
   credentials, and every revocation message written for the learner.
2. **The 24 h window delays legitimate badges.** Where the model breaks: the
   award predicate is non-monotone, so the only proof against flicker is
   time. Symptom: the badge arrives a day late, and an active learner can be
   deferred further by the quiet-period clause. Options: (A) 24 h with the
   quiet period scoped to the predicate's inputs and a 7-day maximum
   deferral (CRD-06); (B) a shorter tenant window (1 h) for low-stakes
   micro-credentials; (C) issue immediately and lean on revocation.
   Recommendation: A, with B as tenant policy per achievement and a floor of
   5 minutes (MVA Tension 3); C rejected because revocation is an apology,
   not a correction.
3. **Two notifications during a home-region flip.** Where the model breaks:
   region-owned sent ledgers replicate with lag, so both regions can issue
   the same award within about 90 s. Symptom: two "you earned a badge"
   emails, and in case (b) of CRD-14 two credentials followed by a
   revocation. Options: (A) deterministic ids plus cross-region ledger reads
   and the reconcile workflow; (B) pause credential emission for one
   replication interval after a flip (ADM-03 already checks catch-up);
   (C) COM-07 dedupes notifications by credential id across ledgers.
   Recommendation: A and B, C as a cheap addition; accept the residual
   duplicate email.
4. **Status-list lag.** Where the model breaks: each region derives its own
   list and CloudFront adds a cache TTL. Symptom: a verifier sees `valid`
   for up to replication + fold + 60 s after a revocation, longer during a
   replication interruption. Options: (A) state the window in the list and
   the verifier report; (B) serve status only from the home region (loses
   availability, gains nothing when the home region is the laggard);
   (C) a 10 s cache at 6× the request cost. Recommendation: A with the 60 s
   cache; high-stakes re-checking is outside a formative LMS.
5. **Deterministic ids and re-award after revocation.** Where the model
   breaks: the id is a function of the award fact and a revocation is
   irreversible by standard. Symptom: a wrongly revoked learner cannot get
   the same credential back; they get a new id and wallets show two entries.
   Options: (A) new award fact, new id, reason `issued_in_error` on the old
   one; (B) a Bitstring `suspension` purpose for reversible cases; (C) let a
   void of `revoke.v1` clear the bit, contradicting the standard.
   Recommendation: A now, B as a later change; C rejected.
6. **A KMS asymmetric multi-Region key per issuer.** Where the model breaks:
   nowhere, but it is this capability's only idle cost. Symptom: $2 per
   issuer-month, $4 during rotation overlap, and a compromise means
   re-issuing every credential under the key. Options: (A) one key per
   issuer with overlap and never-retired verification methods (CRD-01);
   (B) one tenant key shared by all issuers, each DID pointing at it;
   (C) one key per zone shared by tenants. Recommendation: A for tenants
   with few issuers, B as an admin option for many departments; C rejected
   because a compromise would cross tenants.
7. **Mastery disagrees across regions and is not sticky.** Where the model
   breaks: mastery is recomputed per region at different vectors and can
   fall. Symptom: a learner sees "mastered" then "in progress"; instructors
   in two regions see different competency reports. Options: (A) accept,
   always show the vector and the reason for a transition; (B) record
   mastery as a fact, contradicting rule 1; (C) serve the freshest
   comparable view on request (MVA-11). Recommendation: A with C; B
   rejected.
