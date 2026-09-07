# LTI Interoperability Specification

Capability ID prefix: **LTI**

## Purpose

Trellis is both an LTI **Platform** (external tools launched inside Trellis
courses, the Moodle "External tool" role) and an LTI **Tool** (Trellis
activities launched from another LMS as a formative supplement). This
capability specifies LTI 1.3 Core, LTI Advantage (Names and Role
Provisioning Services, Assignment and Grade Services, Deep Linking), LTI
Dynamic Registration and the 1EdTech Security Framework for both roles, and
states exactly where the eventually consistent, derived-mark model collides
with LTI's assumption of a single authoritative gradebook.

## Consistency boundary

- **Inbound** LTI messages and service calls become facts: launches,
  registrations, deployments, lineitems, external scores.
- **Outbound** LTI messages are stateless (signed JWTs) and can be produced
  in any region. Outbound *service calls that mutate a remote system* (AGS
  score POSTs, lineitem creation) are side effects: home region only, sent
  ledger, monotone timestamps, stability window.
- **Read-your-writes** for tools calling our services holds within a
  region and is preserved across regions only by DNS affinity; an epoch
  header tells a consumer when its cursors are void.
- Identifiers that LTI expects to be unique (`client_id`, `deployment_id`,
  lineitem ids, pairwise `sub`) are either deterministic hashes (so two
  regions mint the same value) or region-prefixed (so two regions mint
  different values that are both valid).

## Domain model

```
ToolRegistration      lti.reg.v1  { role: tool, client_id, name, jwks_uri | jwks, initiate_login_uri,
                                    redirect_uris[], target_link_uri, scopes[], privacy_level,
                                    custom_params{}, placements[], status: pending|active|disabled }
PlatformRegistration  lti.reg.v1  { role: platform, issuer, client_id (ours at that platform),
                                    auth_login_url, auth_token_url, jwks_url, deployment_ids[], status }
Deployment            lti.deploy.v1 { deployment_id, registration, context_binding: course | category | tenant }
ResourceLink          lti.link.v1 { link_id, deployment_id, tool client_id, target_link_uri, custom{},
                                    title, lineitem_hint?, placement }        (subject = course, scope _struct)
Launch                lti.launch.v1 { role: tool, issuer, client_id, deployment_id, context_id,
                                      resource_link_id, platform_sub, roles[], ags: {lineitems, lineitem?, scopes},
                                      nrps: {context_memberships_url}, dl_return? }   (subject = learner, scope = module)
LineItem              lti.lineitem.v1 { role: platform|tool, id, url?, context, resource_id, tag, label,
                                        score_maximum, resource_link_id?, start?, end? }  (subject = course)
ExternalScore         ext.score.v1  { lineitem_id, user_sub, score_given?, score_maximum, activity_progress,
                                      grading_progress, timestamp, comment?, submission?{startedAt, submittedAt} }
Pairwise sub          sub = base32(HMAC(tenant_pairwise_key, client_id ‖ principal))[0:26]
Deterministic ids     deployment_id = "dep_" + hash(client_id ‖ context_binding)
                      course for a tool-role context = "crs_" + hash(issuer ‖ client_id ‖ deployment_id ‖ context_id)
                      lineitem id (platform role) = "li_" + hash(course ‖ activity)
```

New fact types beyond the registry: `lti.launch.v1` (L, module, region
system device on behalf of the launching principal, P) and
`lti.lineitem.v1` (C, `_struct`, tool via service or editor, T).

---

## Requirements

### Requirement: The system SHALL launch registered tools as a Platform with LTI 1.3 Core messages signed by regional keys verifiable from every region [LTI-01]

The system SHALL launch registered tools as a Platform with LTI 1.3 Core messages signed by regional keys verifiable from every region.
Third-party-initiated OIDC login: the tool calls `initiate_login_uri`; we
redirect to the tool's `redirect_uri` with an `id_token` carrying the
message type, `deployment_id`, context, resource link, roles mapped from
IDE-08, `lis` claims, custom parameters with substitution variables, launch
presentation, and the service endpoint claims for AGS, NRPS and the Caliper
endpoint. `state` and `nonce` are single-use per region (Tension 3). The
`id_token` is signed with the tenant's current regional key (IDE-03) and
the platform JWKS lists every active key.

#### Scenario: Learner opens an external tool
- **WHEN** a learner clicks a resource link bound to an active tool registration
- **THEN** the login initiation, authentication response and `id_token` POST complete within the same region, the token validates against our JWKS, and a `lti.launch.v1` fact is appended for the learner with `role = platform`

#### Scenario: Tool validates the token in a second region
- **WHEN** the tool fetches our JWKS through a different region than the one that signed the token
- **THEN** the key is present because every region serves the full replicated key registry

### Requirement: The system SHALL hold Platform-role tool registrations and deployments as facts and mint identifiers that are safe under concurrent creation [LTI-02]

The system SHALL hold Platform-role tool registrations and deployments as facts and mint identifiers that are safe under concurrent creation.
`client_id = "lti_" + hash(tenant ‖ tool registration payload's
initiate_login_uri ‖ jwks_uri)` so a repeated registration of the same tool
from two regions yields one `client_id`. Deployments are deterministic per
`(client_id, context_binding)`. Registrations have a status; only `active`
ones launch. Tool JWKS are fetched by `kid` on demand and cached
region-locally for 1 hour with negative caching of 60 s.

#### Scenario: Admin registers the same tool twice concurrently
- **WHEN** two admins in two regions submit the same tool's registration
- **THEN** both facts carry the same `client_id`; the derived registration is the latest by `(sync_hlc, fact_id)` and nothing needs merging

#### Scenario: Tool rotates its keys
- **WHEN** a tool signs a service request with a new `kid`
- **THEN** the region refetches the tool's JWKS once, validates, and caches the new key

### Requirement: The system SHALL issue Platform-role service access tokens by OAuth 2.0 client credentials with JWT client assertions, stateless and valid in every region [LTI-03]

The system SHALL issue Platform-role service access tokens by OAuth 2.0 client credentials with JWT client assertions, stateless and valid in every region.
The token endpoint validates the tool's `client_assertion` (RFC 7523)
against the tool's JWKS, checks requested scopes against the registration,
and returns a JWT access token (≤ 1 h) signed with regional keys carrying
`client_id`, scopes and tenant. Tokens are verified by signature in any
region; there is no token store and no revocation list for these short
tokens.

#### Scenario: Token issued in A used in B
- **WHEN** a tool obtains a token from region A and calls NRPS through region B after DNS failover
- **THEN** B verifies the token by signature and serves the request

### Requirement: The system SHALL advertise a Caliper endpoint claim as a Platform and accept tool events into the fact log [LTI-04]

The system SHALL advertise a Caliper endpoint claim as a Platform and accept tool events into the fact log.
Launch messages carry
`https://purl.imsglobal.org/spec/lti-ces/claim/caliper-endpoint-service`
with the tenant's endpoint (DIO-09) and a scoped token. Events received are
`caliper.in.v1` facts about the launching learner.

#### Scenario: Tool sends a ViewEvent
- **WHEN** a tool posts a Caliper envelope to the endpoint from the launch claim
- **THEN** the event is stored as a fact and becomes an activity signal for at-risk evaluation (MVA-09)

### Requirement: The system SHALL accept LTI 1.3 launches as a Tool from registered platforms and establish Trellis sessions bound to deterministic principals [LTI-05]

The system SHALL accept LTI 1.3 launches as a Tool from registered platforms and establish Trellis sessions bound to deterministic principals.
We validate the `id_token` (issuer, `aud`, `azp`, nonce, `exp`, signature
from the platform's cached JWKS, `deployment_id` known), map
`(issuer ‖ client_id, sub)` to a principal per IDE-01, map LTI roles to
Trellis roles, bind the platform context to a Trellis course (auto-created
with a deterministic id on first launch if the deployment policy allows),
bind the resource link to an activity, and append `lti.launch.v1` before
issuing a session (IDE-02). The launch also records AGS and NRPS endpoints
from the message claims.

#### Scenario: First launch from a new context
- **WHEN** a platform instructor launches a Trellis activity from a context Trellis has never seen
- **THEN** a course with id `crs_` + hash(issuer, client_id, deployment_id, context_id) is created by structure facts, the instructor is enrolled with the instructor role, and the launch succeeds

#### Scenario: Same first launch in two regions
- **WHEN** two learners from the same new context launch through different regions simultaneously
- **THEN** both regions create the same course id with equivalent structure facts; the derived structure folds both sets and no duplicate course exists

### Requirement: The system SHALL hold Tool-role platform registrations as facts with per-region JWKS caching and deployment lists [LTI-06]

The system SHALL hold Tool-role platform registrations as facts with per-region JWKS caching and deployment lists.
`lti.reg.v1 { role: platform }` records the platform's issuer, our
`client_id` there, endpoints, JWKS URL and deployment ids. Platforms may be
added by Dynamic Registration (LTI-15) or manually. JWKS caching as in
LTI-02.

#### Scenario: Platform adds a deployment
- **WHEN** an admin adds a new `deployment_id` for an existing platform registration
- **THEN** a superseding `lti.reg.v1` with the extended list is appended and launches with that deployment succeed within replication lag everywhere

### Requirement: The system SHALL enforce nonce and state single-use per region and route authentication callbacks to the issuing region [LTI-07]

The system SHALL enforce nonce and state single-use per region and route authentication callbacks to the issuing region.
`state` embeds the issuing region; the callback handler redirects a request
that lands elsewhere to the issuing region unless that region is unhealthy,
in which case it validates locally and accepts the residual replay window
(Tension 3).

#### Scenario: Callback lands in the wrong region
- **WHEN** a platform's auth response is posted to region B for a launch initiated in region A
- **THEN** B redirects the POST to A (HTTP 307) and A completes the launch with its local nonce record

### Requirement: The system SHALL provide Names and Role Provisioning Services as a Platform from derived membership and consume them as a Tool into enrolment facts [LTI-08]

The system SHALL provide Names and Role Provisioning Services as a Platform from derived membership and consume them as a Tool into enrolment facts.
Platform role: `GET /lti/nrps/{context}/memberships` serves members from
`M#<cohort>` and `RL#` for the deployment's binding, honours `role` and
`rlid` filters, pagination, and privacy level. The `differences` link
encodes `(epoch, region, membership_change_seq)`; a request with a stale
epoch or foreign region receives the full membership (allowed by the
specification). Tool role: a scheduled pull of the platform's membership
appends `enrol.v1`/`unenrol.v1` facts (method `lti`) idempotently.

#### Scenario: Tool syncs membership
- **WHEN** a tool requests memberships with a `since` link issued by the same region and epoch
- **THEN** only members whose derived enrolment changed since that change sequence are returned

#### Scenario: Differences after failover
- **WHEN** the tenant's epoch has changed
- **THEN** the request receives the full membership and a fresh `differences` link

### Requirement: The system SHALL provide Assignment and Grade Services as a Platform: lineitems derived from activities, scores stored as facts, results derived region-locally [LTI-09]

The system SHALL provide Assignment and Grade Services as a Platform: lineitems derived from activities, scores stored as facts, results derived region-locally.
Lineitems for Trellis activities have deterministic ids; tools may create
additional lineitems (`POST /lineitems`) which become `lti.lineitem.v1`
facts with `id = "li_" + hash(course ‖ client_id ‖ resource_id ‖ tag)` so a
duplicate POST from two regions creates one lineitem. `POST /scores`
appends `ext.score.v1`; a score whose `timestamp` is older than the latest
already held is accepted and stored (never rejected) and simply does not
win derivation. `GET /results` derives the latest score per user by
`timestamp` from the region's `ext.score` facts using a strongly consistent
read, giving read-your-writes within the region.

#### Scenario: Tool posts a score
- **WHEN** a tool POSTs a score for a learner
- **THEN** an `ext.score.v1` fact is appended, the activity's outcome for that learner derives from it (score / scoreMaximum), and `GET /results` in the same region returns it immediately

#### Scenario: Older timestamp arrives later
- **WHEN** a tool POSTs a score with a timestamp earlier than one already held
- **THEN** the fact is stored, the response is `200`, and the result still reflects the newer timestamp

### Requirement: The system SHALL create and maintain one platform lineitem per gradable Trellis activity as a Tool and record its URL as a fact [LTI-10]

The system SHALL create and maintain one platform lineitem per gradable Trellis activity as a Tool and record its URL as a fact.
On first launch of a gradable activity with the `lineitem` scope available,
the home region creates the lineitem (`resourceId` = activity id, `tag` =
`trellis`) unless the launch already carried a `lineitem` claim, and appends
`lti.lineitem.v1 { role: tool, url }`. Creation is idempotent per
`(deployment, activity)` through the sent ledger; if the platform returns
an existing lineitem for the same `resourceId` it is adopted.

#### Scenario: Lineitem created once
- **WHEN** ten learners launch a new gradable activity within a minute
- **THEN** exactly one lineitem creation is attempted by the home region and later launches reuse the recorded URL

### Requirement: The system SHALL write scores back to the platform as a Tool only from the home region, behind a stability window, with per-(lineitem, user) monotone timestamps recorded in the sent ledger [LTI-11]

The system SHALL write scores back to the platform as a Tool only from the home region, behind a stability window, with per-(lineitem, user) monotone timestamps recorded in the sent ledger.
The AGS write-back emitter consumes `effect.ready` intents of kind
`ags_score` (MVA-08, window 60 s). For each `(deployment, lineitem,
user_sub)` it reads the last sent record from every region's sent ledger,
sets `timestamp = max(last_sent_timestamp + 1 ms, derivation_hlc.phys)`,
posts `scoreGiven`, `scoreMaximum`, `activityProgress`, `gradingProgress`,
`comment` containing `trellis:vector=<digest>`, and `submission.submittedAt`
= the attempt's `device_hlc`, and then writes the ledger entry. A score
that has not changed since the last sent record is not re-sent. Platform
`4xx` other than `429` stops write-back for that lineitem and raises a
reconciliation item; `429`/`5xx` retry with backoff.

`gradingProgress` mapping: client-marked and stable → `FullyGraded`;
awaiting human mark → `PendingManual`; human-marked → `FullyGraded`; item
classified `server_or_human` with no mark → `Pending`. `activityProgress`:
`Started` on attempt start, `Submitted` on submit, `Completed` when the
activity's completion derives true.

#### Scenario: Learner's score changes after re-derivation
- **WHEN** a key correction raises a learner's score from 6 to 8 after 6 was posted
- **THEN** after the stability window the emitter posts 8 with a timestamp strictly greater than the one sent for 6 and records it in the ledger

#### Scenario: Home region fails over mid-stream
- **WHEN** the home region flips while scores are pending
- **THEN** the new home region reads the old region's ledger entries (replicated), continues with strictly greater timestamps, and any duplicate post within the flip window carries a later timestamp and the same score

#### Scenario: Platform lineitem deleted
- **WHEN** the platform returns `404` for the lineitem
- **THEN** write-back for that lineitem stops, the instructor's interop view shows the failure with the last accepted score, and re-creation is offered

### Requirement: The system SHALL raise a coalesced AGS score intent whenever a learner's derived outcome changes in a context launched with AGS scopes [LTI-12]

The system SHALL raise a coalesced AGS score intent whenever a learner's derived outcome changes in a context launched with AGS scopes.
During a fold (MVA-03), if a LearnerRow's activity outcome changes and the
row records a tool-role launch with `ags.lineitem` or the `lineitem` scope
for that activity, the updater upserts one `SideEffectIntent { kind:
ags_score, deployment, lineitem, user_sub, decided_at_vector }` per
`(deployment, lineitem, user_sub)`, replacing any pending intent so that
several changes within the window produce one post.

#### Scenario: Five answers in one minute
- **WHEN** a learner answers five items of an AGS-linked quiz within 60 seconds
- **THEN** one intent exists at the end of the window and one score is posted

#### Scenario: Launch without AGS scope
- **WHEN** the platform's launch carried no AGS claim
- **THEN** no intent is raised and the interop view shows "no gradebook link"

### Requirement: The system SHALL support Deep Linking as both Platform and Tool with content items becoming structure facts [LTI-13]

The system SHALL support Deep Linking as both Platform and Tool with content items becoming structure facts.
Platform: an editor launches a tool's deep-linking endpoint from the course
editor; the returned `LtiDeepLinkingResponse` content items become
`lti.link.v1` facts and CAC structure operations at the chosen position,
with `lineItem` hints creating lineitems. Tool: a platform editor selects
Trellis activities; we return resource links with `lineItem` hints and
custom parameters identifying the activity and cohort binding.

#### Scenario: Instructor embeds a tool activity
- **WHEN** the tool returns two `ltiResourceLink` items
- **THEN** two `lti.link.v1` facts and two structure `add_node` operations are appended and the course view shows them after the fold

### Requirement: The system SHALL map roles and apply per-registration privacy levels with pairwise pseudonymous subjects [LTI-14]

The system SHALL map roles and apply per-registration privacy levels with pairwise pseudonymous subjects.
LTI role URIs map to Trellis roles both ways (Instructor ↔ instructor,
TeachingAssistant ↔ tutor, Learner ↔ learner, ContentDeveloper ↔ designer,
Mentor ↔ observer, Administrator ↔ admin). As a Platform the `sub` sent to
a tool is pairwise per `(client_id, principal)`; privacy level `anonymous`
omits name and email claims, `name_only` omits email, `full` sends both.

#### Scenario: Anonymous tool
- **WHEN** a registration has privacy `anonymous`
- **THEN** launches carry only the pairwise `sub` and roles, and NRPS returns no names or emails

### Requirement: The system SHALL implement LTI Dynamic Registration as Platform and as Tool with an administrative approval step [LTI-15]

The system SHALL implement LTI Dynamic Registration as Platform and as Tool with an administrative approval step.
Platform: `/.well-known/openid-configuration` for the tenant includes the
`lti-platform-configuration` claim and the registration endpoint; an admin
starts registration by supplying the tool's initiation URL; the tool POSTs
its client metadata; we mint the deterministic `client_id`, reply with the
registration, and store `lti.reg.v1 { status: pending }` until an admin
activates it. Tool: our registration endpoint accepts a platform's
`openid_configuration` and `registration_token`, fetches the configuration,
POSTs our client registration, stores `lti.reg.v1 { role: platform, status:
pending }`, and an admin activates it.

#### Scenario: Tool registers dynamically
- **WHEN** a tool completes dynamic registration
- **THEN** the registration exists as `pending`, no launches succeed until an admin activates it, and activation is a superseding `lti.reg.v1`

### Requirement: The system SHALL support substitution parameters, custom parameters, launch presentation and target link overrides [LTI-16]

The system SHALL support substitution parameters, custom parameters, launch presentation and target link overrides.
Supported substitutions include `$User.id`, `$User.username`,
`$Person.email.primary`, `$Context.id`, `$Context.title`,
`$ResourceLink.id`, `$ResourceLink.title`, `$CourseSection.sourcedId`,
`$Person.sourcedId` (OneRoster ids when present), `$LineItem.resultValue.max`.
Unknown substitutions are passed through verbatim as the specification
requires.

#### Scenario: Custom parameter with substitution
- **WHEN** a link defines `custom.section=$CourseSection.sourcedId`
- **THEN** the launch carries the cohort's OneRoster `sourcedId` when it exists, otherwise the literal string

### Requirement: The system SHALL serve every LTI endpoint from every region and mark service responses with the tenant epoch [LTI-17]

The system SHALL serve every LTI endpoint from every region and mark service responses with the tenant epoch.
All login, launch, token, JWKS, NRPS, AGS, Deep Linking and registration
endpoints are deployed in every region of the zone behind latency routing.
Service responses carry `X-Trellis-Epoch`; delta cursors (NRPS
`differences`) are valid only within an epoch and region.

#### Scenario: Region outage
- **WHEN** a region is unhealthy
- **THEN** launches and service calls continue in the remaining region with no configuration change on the tool or platform side

### Requirement: The system SHALL derive the gradebook effect of external scores as a Platform through the derivation engine rather than storing them as grades [LTI-18]

The system SHALL derive the gradebook effect of external scores as a Platform through the derivation engine rather than storing them as grades.
`ext.score.v1` facts are inputs to DRV: the activity outcome is
`score_given / score_maximum` scaled to the activity's maximum, latest by
tool timestamp, subject to overrides (DRV-09) and epochs (DRV-16). A tool's
lineitem deletion voids nothing; the facts remain and the activity is
flagged `lineitem_removed`.

#### Scenario: External score and override
- **WHEN** a tool posts 7/10 and an instructor overrides to 9
- **THEN** the gradebook shows 9 with "override (tool 7/10)" and both facts are in provenance

### Requirement: The system SHALL provide interop status views and manual controls for write-back and lineitems [LTI-19]

The system SHALL provide interop status views and manual controls for write-back and lineitems.
An instructor/admin view lists, per deployment: lineitems, last sent score
and timestamp per learner, pending intents, failures with reasons, and the
vector digest the platform last received. Controls: resend, re-create
lineitem, pause write-back. Every manual action is an `audit.v1` fact.

#### Scenario: Resend after platform outage
- **WHEN** an admin clicks "resend all" for a lineitem
- **THEN** the emitter re-posts the current derived scores with new monotone timestamps and the ledger records each

### Requirement: The system SHALL support Submission Review as a Tool by rendering the learner's attempt for a given lineitem and user [LTI-20]

The system SHALL support Submission Review as a Tool by rendering the learner's attempt for a given lineitem and user.
`LtiSubmissionReviewRequest` launches render the derived outcome and the
attempt's facts (provenance, DRV-15) for the identified learner, subject to
the launching user's role.

#### Scenario: Instructor reviews from the platform gradebook
- **WHEN** a platform instructor opens the submission review link
- **THEN** Trellis shows the learner's attempt, marks and provenance with the freshness block

---

## DynamoDB access patterns

### `facts` (global)

| # | Pattern | Keys | Notes |
|---|---|---|---|
| 1 | Registrations, deployments | `PK = T#t#S#T#t`, `SK = F#_admin#<dev>#<seq10>` | Superseding facts for status changes |
| 2 | Resource links, lineitems | `PK = T#t#S#C#<course>`, `SK = F#_struct#<dev>#<seq10>` | |
| 3 | Launches, external scores | `PK = T#t#S#L#<usr>`, `SK = F#<module>#<dev>#<seq10>` | Region system device as writer for service-originated facts |
| 4 | AGS sent ledger | `PK = T#t#LEDGER#<region>#ags#<shard>`, `SK = <deployment>#<lineitem>#<user_sub>#<timestamp>` | Region-owned; shard = hash(lineitem) mod 16; read across regions on failover |

### `derived` (regional)

| Item | PK | SK | Size | Access |
|---|---|---|---|---|
| Tool/platform registration index | `T#t#LTI#REG` | `C#<client_id>` / `I#<issuer>#<client_id>` | ~2 KB | GetItem per launch (cached 60 s) |
| Deployment index | `T#t#LTI#DEP` | `D#<deployment_id>` | small | GetItem per launch |
| JWKS cache | `T#t#LTI#JWKS` | `<jwks_uri_hash>` | ≤ 50 KB | TTL 1 h; negative TTL 60 s |
| Nonce / state | `T#t#LTI#NONCE` | `<nonce>` | tiny | Conditional put; TTL 10 min |
| Lineitem index | `T#t#LTI#LI#<course>` | `<lineitem_id>` | small | Query per context |
| Results view (platform) | `T#t#LTI#RES#<lineitem_id>` | `U#<user_sub>` | small | Strongly consistent GetItem/Query |
| Write-back state (tool) | `T#t#LTI#WB#<deployment>` | `<lineitem>#<user_sub>` | small | Last sent, pending intent, failures |
| NRPS change sequence | `T#t#LTI#NRPS#<context>` | `HDR` and `C#<seq10>` | small | Region-local atomic ADD; `differences` cursor |

**Item collection sizing.** A context's NRPS change log grows by one item
per membership change (bounded by 2,000 members × churn); pruned after 90
days. Results views are per lineitem (≤ 2,000 users).

**Hot-partition risk.** The nonce table is keyed by nonce (uniformly
spread). `T#t#LTI#REG` is read on every launch and cached. The AGS ledger
PK is sharded 16 ways; at 1M learners, 60M score posts/month ≈ 23/s spread
over 16 shards.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `lti-platform-oidc` | HTTP API `/lti/login`, `/lti/auth` | Java 21 SnapStart, 1024 MB | 40 ms | 350 / 800 ms | Signs `id_token` via KMS; nonce conditional put |
| `lti-tool-launch` | HTTP API `/lti/tool/{login,launch}` | Java 21 SnapStart, 1024 MB | 60 ms | 350 / 900 ms | Validates `id_token`; appends launch fact; issues session. Cold start is user-visible; if p99 > 1 s in practice, ADR-001 permits a Rust rewrite of this function |
| `lti-token` | HTTP API `/lti/token` | Java 21 SnapStart, 512 MB | 30 ms | 300 / 700 ms | Client-assertion validation |
| `lti-services` | HTTP API `/lti/nrps/*`, `/lti/ags/*`, `/lti/dl/*` | Java 21 SnapStart, 1024 MB | 30–80 ms | 350 / 800 ms | Scope checks; derived reads; fact appends |
| `lti-registration` | HTTP API `/lti/register/*`, `/.well-known/*` | Java 21 SnapStart, 512 MB | 30 ms | 300 / 700 ms | |
| `ags-writeback` | SQS (from EventBridge `effect.ready` kind `ags_score`), batch 10, home region check | Java 21, 512 MB | 120 ms/post | 400 / 900 ms | Outbound HTTPS; ledger write |
| `ags-lineitem-create` | SQS, home region | Java 21, 512 MB | 150 ms | 400 / 900 ms | Idempotent via ledger |
| `nrps-pull` | EventBridge Scheduler hourly per active tool-role deployment (home region) | Java 21, 512 MB | — | — | Appends enrolment facts |

## Propagation path

1. Launch (either role) → `lti.launch.v1` fact → FLS stream → roster → MVA fold (the learner's row records the launch and, in the tool role, the AGS endpoints).
2. `resp.v1`/`mark.v1` facts fold (MVA-03) → row score changes → `nm-recompute` is not involved; the fold itself raises a `SideEffectIntent{kind: ags_score}` when the learner's launch context has AGS scopes → `intent-evaluator` after 60 s → EventBridge `effect.ready` → `ags-writeback` (home region) → platform → sent ledger (global, region-owned).
3. Platform role: tool `POST /scores` → `ext.score.v1` → fold → gradebook row; `GET /results` reads `ext.score` facts directly with a strongly consistent read.
4. Deep Linking response → `lti.link.v1` + CAC structure ops → structure snapshot → bundle rebuild on publish.

## Cost model

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Launches (both roles) | 300 k × ($1/M + 0.1 s × 1 GB) ≈ **$0.8** | $80 | assumes 1 launch per session |
| Launch facts | 300 k × 2 rWRU ≈ **$0.6** | $60 | |
| AGS score posts (tool role) | 600 k posts × 0.12 s × 0.5 GB Lambda ≈ $0.6; ledger 600 k × 2 rWRU ≈ $1.1; egress 0.6 GB ≈ $0.05 → **$1.8** | $180 | 20 gradable activities × 3 changes per learner |
| AGS/NRPS served (platform role) | 200 k service calls ≈ **$0.4** | $40 | |
| Tokens, JWKS, registration | 100 k ≈ **$0.2** | $20 | |
| Nonce and index writes | ~1 M WRU ≈ **$0.6** | $60 | |
| **Total** | **≈ $4.5** | ≈ $450 | |

## Standards conformance

| Standard | Role | Target conformance | In scope | Out of scope / why | EC conflict and resolution |
|---|---|---|---|---|---|
| LTI 1.3 Core | Platform | 1EdTech certification, Platform | Resource link launches, all required claims, JWKS, roles | LTI 1.1 / 2.0: deprecated, OAuth 1.0a signing; no migration claim support beyond `lti1p1` claim pass-through | Nonce single-use per region (Tension 3); deterministic ids remove creation races |
| LTI 1.3 Core | Tool | 1EdTech certification, Tool | Launches, session establishment, context auto-binding | — | Same |
| LTI Advantage NRPS 2.0 | Platform | Certification | Memberships, filters, pagination, differences, privacy | — | Differences cursors are per region and epoch; full membership on mismatch |
| LTI Advantage NRPS 2.0 | Tool | Certification | Scheduled membership pull into enrolment facts | Real-time pull on every launch (cost) | Duplicate enrolment facts are idempotent by content |
| LTI Advantage AGS 2.0 | Platform | Certification | Lineitems (derived + tool-created), scores as facts, results derived | Result Service `GET /results` strong global consistency: served region-locally only | Older-timestamp scores accepted, not rejected (spec permits either); read-your-writes per region |
| LTI Advantage AGS 2.0 | Tool | Certification | Lineitem creation, score publish incl. `submission` timestamps, `comment` | Reading results from the platform (no product need) | **Score write-back: single home-region writer, 60 s window, monotone timestamps, ledger; see Tension 1** |
| LTI Advantage Deep Linking 2.0 | Platform and Tool | Certification | `ltiResourceLink`, `link`, `file`, `html`, `image` items; `lineItem` hints | `iframe`/`window` presentation hints beyond basic | None |
| LTI Dynamic Registration | Platform and Tool | Certification | Registration flow, admin activation | Auto-activation without admin (security) | Deterministic `client_id` |
| LTI Submission Review | Tool | Implementation (certification when offered) | Review launches | Platform role | None |
| LTI Course Groups Service | — | Roadmap | — | Cohort ↔ group mapping needs sub-cohort semantics agreed | — |
| LTI Platform Notification Service | — | Roadmap | — | Not yet widely implemented by tools | — |
| 1EdTech Security Framework 1.1 | Both | Conformant | Client credentials + JWT assertion, JWKS rotation, `id_token` validation | — | JWKS lists all active keys with overlap ≥ replication lag + cache TTL |

## Known Tensions

1. **AGS score write-back assumes one authoritative gradebook and a
   single writer with monotone time.** Trellis marks are derived, change on
   re-derivation, and are computed independently in each region at
   different vectors. If both regions posted, the platform's
   latest-timestamp-wins rule could keep a *staler* score whose post
   happened to carry a later wall-clock time. Where the model breaks:
   nothing in Global Tables lets two regions agree on "who posts". Symptom
   if unmitigated: a platform gradebook that shows an old score after a
   correction. Options:
   - **A. Single home-region writer, stability window, ledger-derived
     monotone timestamps** (LTI-11). Residual: during a home-region flip
     both regions may post within ~90 s; the later post carries a later
     timestamp *and* a vector that is at least as fresh only if the new
     home region had caught up, which the failover workflow checks before
     enabling emission (ADM-03). Failure mode: a stale score for the length
     of the flip window, corrected by the next post. Cost: write-back
     unavailable while the home region is down and the flip has not
     happened (minutes).
   - B. Encode the vector in the AGS `comment` and rely on platforms to
     honour latest timestamp. Insufficient alone: platforms do not read the
     comment, and timestamp order is not vector order.
   - C. Disable tool-role write-back and make the platform pull results
     from Trellis by OneRoster or a Trellis API. Cleanest consistency,
     worst adoption: most platforms only support AGS push.
   - D. Post only "final" scores after a long window (hours). Reduces
     churn but makes formative feedback in the platform gradebook useless.
   **Recommendation: A**, with B's vector comment as a diagnostic, and C
   offered as a tenant option for platforms that support it. State this in
   customer documentation: "the platform gradebook is a delayed, eventually
   consistent copy; Trellis is the source of derivation."

2. **Platform-role read-your-writes is regional.** A tool that posts a
   score through region A and reads results through region B within the
   replication window sees the old result. DNS latency routing keeps a
   tool's traffic in one region almost always; a failover mid-conversation
   is the exception. Mitigation: epoch header and the tool's own retry.
   Recommendation: accept.

3. **Nonce replay across regions.** Single-use nonces cannot be enforced
   globally. LTI-07 routes callbacks to the issuing region, leaving a
   replay window only when that region is unhealthy. Impact: a second
   session for the same already-authenticated user. Recommendation: accept
   the residual; it is not an escalation.

4. **Duplicate lineitems.** The tool role creates lineitems idempotently
   per `(deployment, activity)` via the ledger, but a platform that does
   not deduplicate by `resourceId` may still end up with two lineitems if
   the ledger read races a flip. Mitigation: adopt the first lineitem the
   platform returns on listing by `resourceId`; expose "merge lineitems"
   in LTI-19. Recommendation: accept.

5. **Launch cold start.** A first launch after idle on a SnapStart Java
   function costs ~350–900 ms before the learner sees anything. The
   product accepts this for long-tail usage; if measured p99 exceeds 1 s,
   ADR-001 authorises a Rust implementation of `lti-tool-launch` rather
   than provisioned concurrency.
