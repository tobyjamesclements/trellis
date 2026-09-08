# Administration and Tenancy Specification

Capability ID prefix: **ADM**

## Purpose

This capability owns what exists *around* the fact log: tenants and residency
zones, the home-region assignment and its failover, configuration and flags,
observability, backup and restore, data protection (erasure, retention,
takedown, consent, export authorisation), audit, security posture and cost
governance. It is the only writer of the `registry` table, the only capability
that deletes anything in the global `facts` table (data keys and shredded
bodies, both terminal), and the one that names the home region every emitter
(COM-07, LTI-11, DIO-06, CRD-06) obeys.

## Consistency boundary

Three consistency classes coexist here and must not be confused:

1. **Operator plane (`registry`).** A global table replicated to every region
   of every zone (hostname → tenant → zone → region set → home region →
   epoch) with one writer: the operator-plane workflows (ADM-01, ADM-03,
   ADM-17) in a single operator region, so last-writer-wins never adjudicates
   between two meanings. Regions read it through a 60 s cache, which bounds
   how long a region can act on a stale home region (ADM-03).
2. **Tenant configuration (`facts`).** `tenant.v1`, `flag.v1`, `retention.v1`,
   `consent.v1`, `erasure.v1`, `takedown.v1` and `audit.v1` are immutable
   facts, merged by union and folded into a region-owned cache in `derived`.
   Repeatable settings resolve last-writer-wins **per field by HLC** over the
   facts, never by item overwrite. Regions may briefly disagree about a
   setting; nothing correctness-bearing reads a flag (ADM-05).
3. **Terminal deletes.** Erasure (ADM-11), takedown (ADM-12) and tenant
   deletion (ADM-17) are the only operations that delete or overwrite items in
   `facts`. Each write is the same in every region, idempotent, and never
   followed by a write restoring the deleted meaning. A creation that survives
   (a data key minted elsewhere during the replication window) is caught by a
   second sweep after the window, not by coordination.

Nothing here is an authority over marks, rosters or completion; admin console
views are region-owned derived indexes over identity, enrolment and structure facts.

## Domain model

### Registry items (global, operator-plane single writer)

```
Hostname    PK = H#<hostname>       SK = TENANT   { tenant_id, created_hlc }
Tenant      PK = TN#<tenant_id>     SK = REG      { hostname[], zone, regions[], home_region,
                                                    epoch, status: provisioning|active|
                                                    suspended|deleting|deleted, mrk_arn,
                                                    provisioned_hlc, failover_hlc? }
Zone        PK = Z#<zone>           SK = REG      { regions[], facts_table, derived_tables{},
                                                    blob_buckets{}, mrk_arn, operator_region }
Platform    PK = PLATFORM           SK = FLAGS    { kill_switches{} }  -- no tenant data
```

The registry holds no personal data: hostnames, ULIDs, region names and ARNs.
That is what allows it to be replicated to every region of every zone
(ADM-02).

### Key hierarchy (ADR-022)

```
KMS multi-Region key (MRK)   one per zone; primary in operator_region, replica per region
  └─ tenant key   TK#<tk_id>   AES-256 data key wrapped by the MRK, stored in facts under
  │                            PK = T#t#KEYS; encrypts T and S bodies; several may exist
  └─ subject key  DK#<dk_id>   per learner (FLS-16), stored under the subject's PK;
                               encrypts P bodies; destroyed by ADM-11
Signing keys    K#<kid>        public half in facts under T#t#KEYS; private half in SSM
                               Parameter Store of the signing region only (ADM-19)
```

### Fact types owned by this capability

Registered in `fact-types.md`: `tenant.v1`, `flag.v1`, `consent.v1`,
`erasure.v1`, `retention.v1`, `audit.v1`, plus one type this spec adds:

| Type | Owner | Subject kind | Scope | Writer | PII | Purpose |
|---|---|---|---|---|---|---|
| `takedown.v1` | ADM | T | `_admin` | admin / moderator / operator | S | Takedown order naming a target `fact_id` and pointer; the target's body is shredded in every region of the zone (ADM-12) |

`consent.v1` is writable by `self` or a `guardian (observer role)`, so a parent
can record consent for a minor; the authorisation check is IDE-09.

### Body schemas (summary)

`tenant.v1 { fields: {display_name, locale, timezone, default_lateness_policy,
rounding, stability_windows{}, abandon_days, key_visibility_default,
home_region?, epoch?, lifecycle?}, set_hlc }` LWW per field; `flag.v1 { name,
enabled, default, rules: [{cohort? | course? | principal_bucket_lt? |
percentage?}], set_hlc }` LWW per name; `retention.v1 { class: facts|blobs|
audit|logs|exports, scope: tenant|course:<id>, after: duration, action: erase|
shred|delete_blobs|void|expire, set_hlc }` LWW per `(class, scope)`;
`consent.v1 { purpose: analytics|comms|research|tool:<reg_id>, granted,
text_hash, set_hlc }` LWW per purpose; `erasure.v1 { subject, requested_by,
reason, phase: requested|executed|verified, sweep_n? }` one fact per phase;
`takedown.v1 { target: fact_id, target_ptr: {PK, SK}, reason, legal_basis,
actor }`; `audit.v1 { action, actor_principal, actor_device, target,
params_hash, request_id, region, reason?, ticket? }`. LWW ties resolve by
`(set_hlc, fact_id)`; a device cannot advance `set_hlc` beyond its `sync_hlc`
(FLS-05), so a mis-set clock cannot pin a setting.

---

## Requirements

### Requirement: The system SHALL provision a tenant through one Step Functions Standard workflow that is the only writer of the registry [ADM-01]

The system SHALL provision a tenant through one Step Functions Standard workflow that is the only writer of the registry.
Provisioning runs in the operator region as a Step Functions Standard
workflow: assign the zone from the tenant's residency requirement (ADR-013);
write the registry items (`H#`, `TN#`, and the tenant's slot in `Z#`);
create Route 53 latency records per region for the hostname, delegating
hostname uniqueness to DNS (a `CREATE` change set fails on an existing name
and the workflow surfaces the collision to the operator rather than
adjudicating it); request an ACM certificate for a vanity hostname (the
default `<slug>.<zone>.trellis.example` uses the wildcard certificate already
attached to each regional API custom domain); create KMS grants on the zone
MRK constrained by `kms:EncryptionContext:tenant_id`; generate the first
tenant key `TK#`; create the S3 prefixes in each region's blob bucket; and
append `tenant.v1` facts carrying the default policies. Tenant configuration
thereafter is `tenant.v1` facts resolved LWW per field by HLC; the registry is
written only by operator-plane workflows.

#### Scenario: New tenant in the eu zone
- **WHEN** an operator submits `{hostname: "acme.eu.trellis.example", zone: eu}`
- **THEN** the workflow writes `H#acme.eu.trellis.example → t_x`, `TN#t_x {zone: eu, regions: [eu-west-1, eu-central-1], home_region: eu-west-1, epoch: 1, status: active}`, two latency records, one KMS grant per region, S3 prefixes, and a `tenant.v1` fact with the defaults
- **AND** every step is idempotent, so a re-run after a failure completes without duplicating resources

#### Scenario: Hostname already taken
- **WHEN** the Route 53 `CREATE` fails because the record set exists
- **THEN** the workflow parks in a `wait_for_operator` state with the collision, and no registry `H#` item is written
- **AND** the operator either chooses another hostname or attaches the existing name after confirming ownership

### Requirement: The system SHALL keep a tenant's facts and blobs inside its residency zone, with the registry as the only cross-zone item [ADM-02]

The system SHALL keep a tenant's facts and blobs inside its residency zone, with the registry as the only cross-zone item.
A zone is a set of regions sharing one `facts` global table, per-region
`derived` tables and blob buckets (cross-region replication only within the
zone), and SES, Cognito, SSM and log groups in those regions. Function roles
are scoped to zone ARNs, exports land in zone buckets, Athena runs in a zone
region, and the operator plane reaches tenant data only through per-zone
endpoints. The registry crosses zones because it holds no personal data. A
tenant's zone is fixed at provisioning; moving zones is a migration (export,
re-import into the new zone's table, DNS cutover), not a setting.

#### Scenario: Operator dashboard in another zone
- **WHEN** an operator in the `us` operator region opens the platform dashboard
- **THEN** it renders metrics from every zone's regions and registry items, and no request for a fact, blob, derived row or log line crosses a zone boundary

### Requirement: The system SHALL name each tenant's home region in the registry and fail it over by a Step Functions Standard workflow that bumps the interop epoch [ADM-03]

The system SHALL name each tenant's home region in the registry and fail it over by a Step Functions Standard workflow that bumps the interop epoch.
Every emitter checks the `TN#` item's `home_region` (60 s cache) before
sending anything external. Failover starts automatically when the home
region's Route 53 health check has failed for 10 minutes, or manually. The
workflow (a) sets `home_region` to the surviving region and `epoch + 1`
(ADR-018) in one registry write, (b) appends `tenant.v1 {home_region, epoch}`
in the new home region, (c) if the old home region is reachable, drains its
outbox so in-flight intents finish and land in `T#t#LEDGER#<old>`, and (d)
makes the new home region consult the sent ledger of **every** region in the
zone (`T#t#LEDGER#<r>`) by idempotency key before emitting any backlog
intent. API traffic fails over independently by Route 53 latency routing with
health checks (ADR-021). The double-emission window is the old region's
ledger replication lag plus the cache TTL, target ≤ 90 s; it is accepted and
its duplicates are counted by the sent-ledger duplicate alarm (ADM-08).

#### Scenario: Home region lost
- **WHEN** eu-west-1's health check has failed for 10 minutes for tenant `t_x`
- **THEN** the workflow writes `home_region = eu-central-1, epoch = 2`, skips the drain (old region unreachable), and eu-central-1's emitters read both ledgers before emitting
- **AND** an intent the old region emitted in its last 90 s but whose ledger write had not replicated may be emitted twice; the duplicate is recorded once the ledger converges

#### Scenario: Planned failback
- **WHEN** eu-west-1 is healthy again and the operator runs failover back
- **THEN** the drain completes before the registry write, the new home region finds every backlog key in the ledgers, and the measured duplicate count is zero
- **AND** external consumers see `epoch = 3` and perform a full resync (LTI-11, DIO-06)

### Requirement: The system SHALL isolate tenants in pooled tables by key prefix, IAM leading-key conditions and per-tenant rate limits [ADM-04]

The system SHALL isolate tenants in pooled tables by key prefix, IAM leading-key conditions and per-tenant rate limits.
Every `facts` and `derived` key begins with `T#<tenant_id>`; the session's
tenant (IDE-03) is bound into every key a request builds. Admin, support and
export tooling assumes roles carrying `dynamodb:LeadingKeys =
["T#<tenant_id>#*", "T#<tenant_id>"]` from a session tag, so a tool cannot
read across tenants even if its code is wrong. Because HTTP APIs have no
usage plans and AWS WAF does not attach to them, per-tenant rate limiting is
a Lambda-side token bucket per execution environment, refilled from a
region-local counter `T#t#RL#<bucket>` written every 100 requests; exceeding
the limit returns `429` with `Retry-After` on read APIs only. `POST /sync/v1`
is never rate-limited below the level at which FLS-13 queueing takes over.

#### Scenario: Break-glass role reads the wrong tenant
- **WHEN** a support tool with a session tag for `t_a` queries `PK = T#t_b#…`
- **THEN** DynamoDB returns `AccessDeniedException` and the attempt is logged with the tool's `request_id`

#### Scenario: Scraper hits a tenant's read API
- **WHEN** one tenant's read traffic exceeds 200 requests/s sustained
- **THEN** the token bucket returns `429` for that tenant's read calls while other tenants and every sync call proceed normally

### Requirement: The system SHALL express feature flags as `flag.v1` facts evaluated from a region-owned cache and never use them for correctness decisions [ADM-05]

The system SHALL express feature flags as `flag.v1` facts evaluated from a region-owned cache and never use them for correctness decisions.
Flags are folded into `derived` `T#t#CFG` / `FLAG#<name>` (LWW per name by
HLC). Evaluation is in-process: tenant, then cohort or course rule, then
`principal_bucket_lt` over `hash(flag, principal) mod 10000`, then
`percentage`, then `default`. A flag may hide a UI surface, choose between
implementations with identical outputs, or throttle a non-essential job
(ADM-15). It may not alter what a derivation returns, what a fact means, who
is authorised, or whether a side effect is sent; those are policy facts
(CAC-10), role facts (IDE-08) and intents (MVA-08); a build lint fails any
flag read inside the engine or an emitter predicate. Platform kill switches
live in the registry `PLATFORM#FLAGS` item, read through the same cache.

#### Scenario: Gradual rollout
- **WHEN** an admin sets `new_gradebook_ui` to `percentage: 10`
- **THEN** the same 10% of principals see it in every region once the fact has replicated, and a learner who syncs to the other region during the lag sees at most a UI difference

### Requirement: The system SHALL provide an admin console whose directory, catalogue and reports are region-owned derived indexes over facts [ADM-06]

The system SHALL provide an admin console whose directory, catalogue and reports are region-owned derived indexes over facts.
The user directory is `T#t#UD` index items folded from `identity.v1`,
`profile.v1`, `enrol.v1` and `role.v1` (prebuilt keys by normalised name and
email hash, ADR-016), rebuilt from facts on demand and pruned by the erasure
recompute. Bulk enrolment appends `enrol.v1` facts (IDE-05) or runs the
OneRoster import (DIO-02); caps are not enforced and the result links the
IDE-06 reconciliation. The catalogue is `T#t#CAT` folded from `catalogue.v1`,
`struct.v1` and `publish.v1` (CAC). Integrations management writes
`lti.reg.v1` / `lti.deploy.v1` (LTI-15) and DIO endpoint settings as
`tenant.v1` fields, with secrets in SSM. Policy defaults are `tenant.v1`
fields that `policy.v1` inherits; reports are MVA-13 rollups with vectors shown.

#### Scenario: Directory search
- **WHEN** an admin searches "garcia"
- **THEN** the console queries `T#t#UD` with `SK begins_with N#garcia` in the local region and shows results with the index's `max_sync_hlc`

#### Scenario: Bulk enrolment over the cap
- **WHEN** a CSV enrols 2,300 learners into a cohort capped at 2,000
- **THEN** all 2,300 `enrol.v1` facts are appended, the sub-cohort split (ADR-019) applies, and the result page links the IDE-06 reconciliation

### Requirement: The system SHALL define platform operator roles and a time-boxed, audited break-glass path into tenant data [ADM-07]

The system SHALL define platform operator roles and a time-boxed, audited break-glass path into tenant data.
Operator roles: `operator.readonly` (registry and metrics), `operator.sre`
(failover, restore, throttle, game days), `operator.support` (tenant derived
views with a grant), `operator.security` (key operations, takedown execution).
No operator role can decrypt fact bodies without a break-glass grant: requested
with a ticket and reason, approved by a second operator or the tenant admin,
materialised as an IAM session with a `tenant_id` session tag and
`dynamodb:LeadingKeys`, at most 4 hours, producing `audit.v1 {action:
break_glass, …}` on grant and expiry, with the tenant admin notified (COM-07).

#### Scenario: Support investigates a sync failure
- **WHEN** an `operator.support` engineer requests access to `t_x` with ticket `SUP-812`
- **THEN** a second operator approves, the grant item `T#t_x#BG#<id>` is written with a 4 h TTL, the audit fact is appended, and the tenant admin receives a notification naming the engineer, ticket and expiry

### Requirement: The system SHALL observe every region with sampled structured logs, EMF metrics, traces, dashboards, alarms and a derived per-tenant status page [ADM-08]

The system SHALL observe every region with sampled structured logs, EMF metrics, traces, dashboards, alarms and a derived per-tenant status page.
Logs are structured JSON, sampled 10% on success paths and 100% on errors,
retained 30 days, and never contain fact bodies or profile fields (pseudonymous
ids only; a log-schema test in CI enforces it). Metrics are EMF with
dimensions `region`, `function` and, for ≤ 5 metrics, `tenant_id`. X-Ray
samples 5% of API invocations. Each region has a dashboard; the operator
region has a cross-zone dashboard built from metrics only. Alarms:
replication-lag proxy (MVA-14, > 60 s for 5 min), fold lag, DynamoDB
throttles, API error rate (> 1% for 5 min), cost anomaly, and sent-ledger
duplicates (> 0 outside a failover window). A per-tenant public status page is
a static page in the zone's bucket regenerated from health-check and alarm
state every 5 minutes; it is derived and carries no personal data.

#### Scenario: Replication degraded in one zone
- **WHEN** the replication-lag proxy in eu-central-1 exceeds 60 s for 5 minutes
- **THEN** the alarm fires, the on-call is paged, the UI banner switches (MVA-14) and every eu tenant's status page shows "cross-region sync delayed" within 5 minutes

### Requirement: The system SHALL write one `audit.v1` fact, by the region system device, for every administrative action [ADM-09]

The system SHALL write one `audit.v1` fact, by the region system device, for every administrative action.
Role grants, setting, flag and integration changes, exports and approvals,
erasures, takedowns, retention runs, break-glass grants, failovers and
restores each append `audit.v1` with subject `T` and scope `_admin`. The
writer is `dev_sys_<region>`; its stream `seq` comes from a region-local
conditional increment on `derived` `T#t#SEQ#dev_sys_<region>#T#<tenant>#_admin`,
and a seq skipped by a crash is filled with `noop.v1` (FLS-09). A region-owned
index `T#t#AU#<actor|target>` serves the console. Audit facts are never
voided; a correction is another audit fact.

#### Scenario: Two regions audit concurrently
- **WHEN** admins in two regions change roles in the same second
- **THEN** each region's system device appends to its own stream, both facts replicate, and the audit index in every region lists both ordered by `(sync_hlc, fact_id)`

### Requirement: The system SHALL back up only facts and restore by re-union, never by replacement [ADM-10]

The system SHALL back up only facts and restore by re-union, never by replacement.
`facts` has PITR (35 days) and a monthly S3 export (FLS-20); `registry` has
PITR; `derived` is never backed up. Restore = PITR (or export) into a new
single-region table → Distributed Map re-import putting each item into the
live global table with `attribute_not_exists(PK)` (union; existing items are
never overwritten) → on-demand anti-entropy (FLS-14) → partition recompute
(MVA-12) where headers changed. The re-import skips `DK#` items of erased
subjects and re-applies the takedown index (ADM-12), so a restore cannot
resurrect erased keys or shredded bodies. Regional loss: RPO ≈ replication
lag (seconds; device-authored facts are re-pushed on the next sync, FLS-18),
RTO ≈ DNS failover (30 s × 3 checks + 60 s TTL ≈ 3 min) plus ≤ 10 min if the
lost region was the home region. Logical corruption: RPO = 0 for facts present
at the PITR point, RTO = PITR restore (≈ 1 h per 50 GB) + import.

#### Scenario: Region destroyed
- **WHEN** eu-west-1 is lost with 40 facts accepted in its last second
- **THEN** devices holding those facts re-push them to eu-central-1 on their next sync, the roster confirms, and no fact authored on a device is lost

#### Scenario: Deploy deletes 10,000 fact items
- **WHEN** a defect is found 6 hours later
- **THEN** the operator restores PITR at T−7 h to `facts-restore`, the re-import puts 10,000 missing items (existing items untouched), anti-entropy and recompute run, and the incident audit fact records the vectors before and after

### Requirement: The system SHALL erase a subject by destroying its data keys, then sweeping blobs, derived state and late-created keys [ADM-11]

The system SHALL erase a subject by destroying its data keys, then sweeping blobs, derived state and late-created keys.
On `erasure.v1 {phase: requested}` (admin, after IDE session revocation), a
Step Functions Standard workflow: (1) deletes every `DK#<subject>#*` item — a
terminal, idempotent, LWW-safe delete that replicates everywhere; (2) reads
the subject's facts (FLS pattern 4) and deletes every `body_ref` blob in every
region's bucket (S3 replication does not carry deletes); (3) triggers MVA-15
recompute, which removes the subject's rows and directory entries; (4) waits
the replication window (24 h) and sweeps `DK#` again to catch a key minted
elsewhere during the window; (5) verifies via each region's endpoint that no
`DK#` item exists and appends `erasure.v1 {phase: verified}`. Backups hold
only ciphertext. The residual is plaintext metadata (pseudonymous `usr_`/
`dev_` ids, item ids, seqs, HLCs, key versions) in fact items, Merkle leaves
and 30-day logs; it is acceptable because the only link from those ids to a
person is in `identity.v1`/`profile.v1` bodies that are now unreadable. A
tenant may also physically delete the subject's fact items after verification
(Merkle rebuild per touched partition plus a tombstone set for anti-entropy),
costed per subject.

#### Scenario: Ordinary erasure
- **WHEN** an admin erases learner `usr_a` with 3 data keys and 12 blobs
- **THEN** within one hour the keys and blobs are gone in both regions and MVA-15 has recomputed every partition the learner touched; 24 h later the second sweep finds nothing and `phase: verified` is appended

#### Scenario: Stale session pushes during the window
- **WHEN** a device with a not-yet-revoked session pushes a fact 10 minutes after step (1), causing a new `DK#` in the other region
- **THEN** the second sweep deletes it, and the fact's ciphertext is unreadable

### Requirement: The system SHALL remove a single fact's content by shredding its body in every region while leaving its identity intact [ADM-12]

The system SHALL remove a single fact's content by shredding its body in every region while leaving its identity intact.
A `takedown.v1` fact (legal or moderation removal) is folded in every region;
each region's `takedown-executor` overwrites the target item's `body` with
`{shredded: true, takedown: <fact_id>}`, clears `body_ref`, deletes the blob
from its bucket, and records the target in the region-owned index `T#t#TD`.
The write is terminal and idempotent, so any order of arrival across regions
converges on a shredded copy. Anti-entropy repair (FLS-14) skips a differing
item whose local copy is shredded, and re-runs the shred when it pulls an
unshredded copy of an indexed target. The fact's metadata and `fact_id`
remain, so version vectors and Merkle summaries are unaffected. Derivation
treats a shredded body as an effective fact with empty content.

#### Scenario: Forum post removed under a legal order
- **WHEN** `takedown.v1` targets a `post.v1` with a 60 KB attachment
- **THEN** both regions shred the body and delete the blob within minutes, the thread view (COM-04) shows "removed", and the partition's Merkle root is unchanged

#### Scenario: Replica arrives after the shred
- **WHEN** region B pulls the original item from a peer whose copy had not yet been shredded
- **THEN** B's executor sees the target in `T#t#TD` and shreds it again

### Requirement: The system SHALL authorise a decrypted export by two distinct admin principals and deliver it through a time-boxed URL [ADM-13]

The system SHALL authorise a decrypted export by two distinct admin principals and deliver it through a time-boxed URL.
A requesting tenant admin appends `audit.v1 {action: export.request, scope,
purpose}`; a Step Functions Standard workflow waits (task token, ≤ 72 h) for
`audit.v1 {action: export.approve}` from an admin holding `export_approver`
whose principal differs from the requester (checked against IDE-11 merge
facts too). It then runs the FLS-20 decrypted export inside the zone, appends
`export.v1` naming the manifest, and returns a presigned URL valid for 4 hours.
S3 access logging records every download in the tenant's audit prefix.

#### Scenario: Requester approves their own export
- **WHEN** the approving principal equals the requesting principal or is its merge alias
- **THEN** the workflow stays in `awaiting_approval` and the console shows "a second admin must approve"

### Requirement: The system SHALL apply retention policies as `retention.v1` facts whose granularity is per subject, and state what per-course retention can and cannot do [ADM-14]

The system SHALL apply retention policies as `retention.v1` facts whose granularity is per subject, and state what per-course retention can and cannot do.
A daily scheduler evaluates each tenant's effective retention (LWW per
`(class, scope)`) against the subject index's `last_activity_hlc`. Because
data keys are per subject, the only retention action that makes content
unreadable is an erasure of the whole subject (`action: erase` → ADM-11).
Per-course retention (`scope: course:<id>`) cannot destroy keys, so it only
deletes the course's `body_ref` blobs, shreds bodies via `takedown.v1`
(`action: shred`) or appends `void.v1` facts (`action: void`); fact items
under 4 KB remain ciphertext under live subject keys. The console says this
plainly when a per-course policy is created. Logs, audit facts and exports
have their own classes (`expire` sets log-group and S3 lifecycle rules).

#### Scenario: Tenant-wide inactivity erasure
- **WHEN** policy `{class: facts, scope: tenant, after: P6Y, action: erase}` matches 40 learners
- **THEN** the scheduler appends 40 `erasure.v1 {phase: requested}` facts and the erasure workflows run, each with an audit fact

#### Scenario: Per-course policy created
- **WHEN** an admin sets `{class: blobs, scope: course:c1, after: P2Y, action: delete_blobs}`
- **THEN** the console shows "this removes uploaded files; responses and marks remain readable until the learner is erased", and the policy is stored

### Requirement: The system SHALL govern cost with on-demand capacity, per-tenant allocation, budgets that throttle only non-essential work, and anomaly alarms [ADM-15]

The system SHALL govern cost with on-demand capacity, per-tenant allocation, budgets that throttle only non-essential work, and anomaly alarms.
Every table is on-demand and no function has provisioned concurrency
(ADR-020). Per-tenant resources carry a `tenant_id` cost-allocation tag;
pooled resources are apportioned by metered per-tenant EMF counters
(requests, facts, WRU, RRU, GB-s, emails, egress), and a monthly `cost-rollup`
writes `T#t#AN#COST / M#<yyyy-mm>` with "cost per active learner". A budget
breach (per tenant or zone) alerts, then throttles non-essential jobs by
`flag.v1`: analytics rollups, digests (COM-09), verifier sampling and
anti-entropy frequency (hourly → 6-hourly). Learner sync, fold and emission
are never throttled. Logs stay sampled (ADM-08); cost anomaly alarms page.

#### Scenario: Tenant exceeds budget mid-month
- **WHEN** `t_x` reaches 120% of its monthly budget on day 20
- **THEN** the admin is notified, `throttle.analytics`, `throttle.digests` and `anti_entropy.interval = PT6H` are set for `t_x`, and sync latency and fold lag for `t_x` are unchanged

### Requirement: The system SHALL record consent as `consent.v1` facts resolved per purpose and consulted by every consumer that needs it [ADM-16]

The system SHALL record consent as `consent.v1` facts resolved per purpose and consulted by every consumer that needs it.
Purposes: `analytics`, `comms`, `research`, `tool:<reg_id>`. The region-owned
state `T#t#CN#<subject>` is folded LWW per purpose by HLC. Analytics rollups
(MVA-13) exclude subjects without `analytics`; the notification emitter
(COM-07) checks `comms` at emit time; research exports (ADM-13) filter on
`research`; an LTI launch (LTI-01) without `tool:<reg_id>` carries pseudonymous
claims only. Withdrawal is a new fact; its effect lags by replication plus fold.

#### Scenario: Consent withdrawn for a tool
- **WHEN** a learner withdraws `tool:reg_9`
- **THEN** the next launch to that tool carries no name or email claims, and an already-open tool session is unaffected

### Requirement: The system SHALL delete a tenant by crypto-shredding its keys after a cooling-off period, then sweeping derived state, blobs and DNS [ADM-17]

The system SHALL delete a tenant by crypto-shredding its keys after a cooling-off period, then sweeping derived state, blobs and DNS.
Tenant admin request plus operator approval starts a Step Functions Standard
workflow with a 30-day cancellable wait. It then sets registry `status:
deleting` and removes the hostname records, revokes sessions
(`session.revoke.v1`), appends `tenant.v1 {lifecycle: deleted}`, deletes every
`TK#` item and every subject's `DK#` items (rendering all bodies unreadable),
deletes the tenant's S3 prefixes in every region, deletes `T#t#` derived items
per region by Distributed Map, and leaves the registry `TN#` tombstone. Fact
ciphertext ages out of PITR in 35 days and the export prefix is deleted;
physical deletion of fact items is optional and costed. With a per-tenant MRK
(ADM-18 option) the shred is instead a scheduled KMS key deletion.

#### Scenario: Deletion cancelled on day 12
- **WHEN** the tenant admin cancels
- **THEN** the workflow ends with no key, blob or DNS change and an audit fact records the cancellation

### Requirement: The system SHALL run with least-privilege IAM per function, Shield Standard, optional WAF, secrets in SSM Parameter Store and one KMS multi-Region key per zone [ADM-18]

The system SHALL run with least-privilege IAM per function, Shield Standard, optional WAF, secrets in SSM Parameter Store and one KMS multi-Region key per zone.
Each function has its own role limited to the tables, queues, buses, buckets
and parameters it uses; admin tooling adds `dynamodb:LeadingKeys`. Shield
Standard covers Route 53, CloudFront and API Gateway at no cost. AWS WAF
cannot attach to HTTP APIs, so it is optional on the content CloudFront
distribution and, for tenants needing edge rate limits on the API, on a
CloudFront distribution in front of the regional API; both are costed below.
Secrets (LTI client secrets, SIS credentials, private signing keys) are SSM
`SecureString` parameters per region. The key hierarchy is one MRK per zone
with per-tenant `TK#` and per-subject `DK#` keys bound by encryption context.
One MRK per zone costs $2/month; one per tenant costs $2/tenant-month (1,000
tenants: $2,000/month) and buys KMS-level key deletion on tenant removal.
Recommendation: one MRK per zone; tenant deletion is a `TK#` shred.

#### Scenario: Function role over-broad
- **WHEN** a role gains `dynamodb:*` on `facts`
- **THEN** the IAM policy test fails the build

### Requirement: The system SHALL keep signing keys in a per-tenant registry under `T#t#KEYS` with immutable items per `kid` [ADM-19]

The system SHALL keep signing keys in a per-tenant registry under `T#t#KEYS` with immutable items per `kid`.
Each region signs sessions (IDE-03), LTI platform messages (LTI-01) and
credentials (CRD-06) with its own key; `kid` embeds the region, so key
creation needs no coordination. `K#<kid>` holds the public key, algorithm,
`use`, `not_before`, `not_after`; the private half lives only in the signing
region's SSM. Rotation adds a `K#` item; early retirement adds a `KR#<kid>`
tombstone. The JWKS endpoint serves the union of unexpired, untombstoned keys.

#### Scenario: Key rotation
- **WHEN** eu-west-1 rotates its session key
- **THEN** a new `K#` item replicates, both keys are in the JWKS for the overlap, and tokens signed by either verify in every region

### Requirement: The system SHALL maintain DR runbooks and exercise them in quarterly game days that record measured RPO and RTO [ADM-20]

The system SHALL maintain DR runbooks and exercise them in quarterly game days that record measured RPO and RTO.
Runbooks: regional loss, home-region failover and failback, PITR restore and
re-union, derived-table loss and recompute, erasure verification, operator
region loss (ADM Known Tension 6). Each game day runs against a staging
tenant in production zones, measures RPO/RTO, counts sent-ledger duplicates,
and appends an `audit.v1 {action: game_day, results}`.

#### Scenario: Failover game day
- **WHEN** the quarterly exercise fails over the staging tenant under synthetic emitter load
- **THEN** the measured duplicate window is ≤ 90 s and the DNS failover ≤ 3 min, or the runbook is amended before the next release

### Requirement: The system SHALL verify, before any pipeline depends on it, that replicated writes appear in the receiving region's stream, with a costed fallback [ADM-21]

The system SHALL verify, before any pipeline depends on it, that replicated writes appear in the receiving region's stream, with a costed fallback.
Project.md A6 is an assumption. An early task in change 001 writes facts in
region A and observes region B's stream, checking presence, record type,
latency, and behaviour of identical-content repair puts. If replicated writes
are absent, the fallback is a cross-region EventBridge fan-out of `(PK, SK)`
pointers from the ingest region's router to the peer bus, with the receiver
reading the item locally after replication (≈ $2.5/month at L10k).

#### Scenario: Spike passes
- **WHEN** every replicated write appears in B's stream within replication lag
- **THEN** A6 is marked verified in project.md and the router design in FLS-17 stands

### Requirement: The system SHALL provide tenant tiers, with self-service creation of soft organisations by consumers and operator provisioning of strict organisations [ADM-22]

The system SHALL provide tenant tiers, with self-service creation of soft organisations by consumers and operator provisioning of strict organisations.
Tiers: `consumer` (the realm, one per zone), `soft` (self-service), `strict`
(contracted). Creating a soft organisation from the realm runs a lightweight
provisioning path: a registry item under the zone's wildcard host, zone and
home region inherited from the realm, default policies, no DNS, certificate
or per-tenant metrics, and the creating consumer as the first admin; abuse
controls limit creations per consumer and per day and require a verified
email. Strict organisations use the operator workflow (ADM-01) and may have
custom hostnames, SSO, SCIM and integrations. Per-tenant metrics and
dashboards exist for strict tenants; soft tenants are observed in aggregate.

#### Scenario: Consumer creates a study organisation
- **WHEN** a verified consumer creates "Riverside Tutoring"
- **THEN** within seconds `riverside-tutoring.orgs.<zone-host>` resolves, the consumer is its admin, and no per-tenant AWS resources were created

#### Scenario: Creation abuse
- **WHEN** a consumer exceeds the daily creation limit
- **THEN** further creations are refused with `429` and the abuse-detection job (SEC-04) is notified

### Requirement: The system SHALL host soft organisations and the consumer realm on shared wildcard hostnames and reserve custom hostnames for strict organisations [ADM-23]

The system SHALL host soft organisations and the consumer realm on shared wildcard hostnames and reserve custom hostnames for strict organisations.
The registry resolves `learn.<zone-host>` to the realm and
`<slug>.orgs.<zone-host>` to soft organisations under one wildcard
certificate per zone; slugs are minted deterministically from the chosen
name plus a short hash so two regions creating the same slug converge, and
a slug collision surfaces as a rename prompt rather than a failure. Strict
organisations may map custom hostnames through ADM-01 with ACM certificates.

#### Scenario: Slug collision
- **WHEN** two consumers in different regions create organisations with the same display name within the replication window
- **THEN** both registry items exist with distinct hashed slugs and each creator sees their own organisation's address

#### Scenario: Custom hostname for a strict tenant
- **WHEN** an operator provisions `learn.example.ac.uk` for a strict tenant
- **THEN** ADM-01 issues the certificate and DNS records and the tenant is reachable on both the custom and the wildcard address

---

## DynamoDB access patterns

### `facts` (global) and `registry` (global)

| # | Access pattern | Key condition | Notes |
|---|---|---|---|
| 1 | Tenant config/flag/retention/audit/takedown facts | `PK = T#t#S#T#<tenant>`, `SK = F#_admin#<dev>#<seq10>` | Query `begins_with F#_admin#` on cache rebuild |
| 2 | Consent, erasure facts | `PK = T#t#S#L#<usr>`, `SK = F#_profile#<dev>#<seq10>` | Folded with profile stream |
| 3 | Data key sweep | `PK = T#t#S#L#<usr>`, `SK begins_with DK#` | DeleteItem each; repeated after 24 h |
| 4 | Shred target | `GetItem(PK, SK)` from `target_ptr`, then PutItem shredded body | Region-local `attribute_exists(PK)` |
| 5 | Tenant keys, signing keys | `PK = T#t#KEYS`, `SK = TK#<id>` / `K#<kid>` / `KR#<kid>` | Immutable; ≤ 100 items |
| 6 | Sent ledgers at failover | `PK = T#t#LEDGER#<region>`, `SK = <channel>#<idem_key>` | Read for every region of the zone |
| 7 | Registry resolve | `registry`: `GetItem(H#<host>)` then `GetItem(TN#<tenant>)` | 60 s in-memory cache |
| 8 | Re-import | PutItem `attribute_not_exists(PK)` per restored item | Distributed Map, ≤ 500 puts/s per PK prefix |

### `derived` (regional) — items owned by this capability

| Item | PK | SK | Purpose |
|---|---|---|---|
| Config cache | `T#t#CFG` | `TENANT` / `FLAG#<name>` / `RET#<class>#<scope>` / `HOME` | LWW-per-field folds; `HOME` is the registry cache |
| Consent state | `T#t#CN#<subject>` | `<purpose>` | Per purpose |
| Erasure state | `T#t#ER#<subject>` | `STATE` | Phase, sweep count, verified regions |
| Takedown index | `T#t#TD` | `<fact_id>` | Pointer + per-region shred status |
| Audit index | `T#t#AU#<actor\|target>` | `<sync_hlc>#<fact_id>` | Console queries |
| System-device seq | `T#t#SEQ#<dev_sys>#<subject>#<scope>` | `CTR` | Region-local conditional increment |
| User directory | `T#t#UD` / `T#t#UD#<usr>` | `N#<name_key>#<usr>`, `E#<email_hash>` / `PROFILE` | Prebuilt search keys |
| Course catalogue | `T#t#CAT` | `C#<course>` | Folded from structure facts |
| Rate-limit counter | `T#t#RL#<bucket>` | `<minute>` | TTL 1 h |
| Break-glass grant | `T#t#BG` | `<grant_id>` | TTL = expiry |
| Cost rollup | `T#t#AN#COST` | `M#<yyyy-mm>` | Monthly |
| Status snapshot | `T#t#STATUS` | `CURRENT` | Source for the static page |

No GSIs; directory search uses prebuilt index items (ADR-016). **Sizing.**
The tenant-subject collection holds ~50 k audit facts/year at L10k (≈ 60
MB/year); `T#t#KEYS` < 100 items; `T#t#TD` < 10 k items; a subject sweep reads
≈ 15 MB (≈ 1,900 RRU) per region. **Hot partitions.** Audit writes reach ≈ 2/s
per region on one PK (ceiling 1,000 WCU/s); registry reads are ≈ one per
execution environment per minute; the `T#t#SEQ` counter takes one CAS per audit fact.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `admin-api` | HTTP API `/admin/*` | Java 21 SnapStart, 1024 MB | 30 ms | 300 / 700 ms | Writes facts via FLS ingest path; audit library in-process |
| `tenant-provision` | Step Functions Standard tasks | Java 21 SnapStart, 1024 MB | 0.2–5 s | 300 / 700 ms | Route 53, ACM, KMS, S3, registry |
| `failover-runner` | Step Functions (alarm or manual) | Java 21 SnapStart, 512 MB | 100 ms | 300 / 700 ms | Registry write, drain call, ledger read |
| `config-fold` | EventBridge `fact.folded` (scope `_admin`, `_profile` types) | Java 21 SnapStart, 512 MB | 8 ms | 400 / 900 ms | CFG, CN, RET, AU items |
| `directory-indexer` | EventBridge `fact.folded` (identity/profile/enrol/role/struct) | Java 21, 512 MB | 10 ms | 400 / 900 ms | UD, CAT items |
| `erasure-sweeper` | Step Functions Standard (24 h wait) | Java 21 SnapStart, 1024 MB | 0.5–3 s | 400 / 900 ms | DK deletes, blob deletes, verification |
| `takedown-executor` | EventBridge `fact.folded` type `takedown.v1`; anti-entropy hook | Java 21 SnapStart, 512 MB | 25 ms | 400 / 900 ms | Shred put, blob delete |
| `export-authoriser` | Step Functions Standard (task token) | Java 21, 512 MB | — | 300 / 700 ms | Waits ≤ 72 h |
| `restore-import` | Step Functions Distributed Map | Java 21, 1024 MB | 3 ms/item | 400 / 900 ms | Conditional puts |
| `retention-scheduler` | EventBridge Scheduler daily | Java 21, 1024 MB | — | — | Emits erasure/takedown/void facts |
| `status-page` | Scheduler 5 min + alarm events | Java 21 SnapStart, 512 MB | 60 ms | 400 / 900 ms | Writes static page to S3 |
| `cost-rollup` / `budget-governor` | Scheduler monthly / alarm events | Java 21, 1024 MB | — | — | Athena over exports; sets throttle flags |

## Propagation path

1. Admin action → `admin-api` → fact put through FLS-04 (`tenant.v1`,
   `flag.v1`, `retention.v1`, `takedown.v1`, `erasure.v1`, `consent.v1`) plus
   `audit.v1` by the system device.
2. `facts` stream → `stream-router` → SQS FIFO `roster` → `roster-updater` →
   EventBridge `fact.folded` (FLS propagation step 4).
3. Rules on `fact.folded` by type → `config-fold` (CFG/CN/RET/AU),
   `directory-indexer` (UD/CAT), `takedown-executor` (shred); `erasure.v1` →
   Step Functions `erasure-sweeper` → EventBridge `subject.erased` → MVA-15.
4. Health-check alarm → EventBridge → Step Functions `failover-runner` →
   registry write → each region's `HOME` cache refreshes within 60 s → emitters
   consult all ledgers.
5. CloudWatch alarm state change → EventBridge → `budget-governor` →
   `flag.v1` throttle facts → step 1.
6. Scheduler → `retention-scheduler` → erasure/takedown/void facts → step 1.

## Cost model

Fixed floor per zone (two regions), then variable cost. Prices marked † are
not in project.md §6.1 and are assumptions (mid-2025 list prices).

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Route 53 zone, health checks, latency queries | **$3.1** | $63 | 1 zone $0.50 + 4 checks × $0.50 + ≈ 1 M queries × $0.60/M |
| KMS MRK (zone) | **$2** | $2 | 2 regions × $1; per-tenant option +$2/tenant |
| KMS requests | **$5** | $500 | ≈ 1.6 M decrypt/generate × $0.03/10k |
| CloudWatch logs | **$0.6** | $60 | 9 M invocations × 10% × 1 KB + errors ≈ 1.1 GB × $0.50 |
| CloudWatch metrics, dashboards, alarms † | **$49** | $349 | 120 platform series × $0.30 + 5 × 2 per tenant × $0.30; 2 dashboards $6; 40 alarms $4 |
| X-Ray † | **$2** | $200 | 5% × 9 M traces × $5/M |
| Optional WAF † | **$16** (+$14 API) | $60 | $5 ACL + 5 rules × $1 + $0.60/M × 10 M content requests |
| Registry table | **$0.1** | $0.1 | PITR on < 1 MB |
| Monthly export + restore drills † | **$4.4** | $440 | 36 GB × $0.10 export; 36 GB × $0.15 × ¼ drills; S3 $0.8 |
| Step Functions (provision, failover, erasure, export, retention) | **$0.5** | $50 | ≈ 20 k transitions × $25/M |
| Admin API, audit facts, indexes | **$0.5** | $50 | 30 k calls; 50 k audit × 1.2 rWRU × 2; 100 k index WRU |
| Erasure sweeps, takedowns, rate-limit counters, status page, cost rollup (Athena †) | **$0.6** | $60 | 50 × (2 × 2 × 1,900 RRU + deletes); 66 k WRU; 8.6 k page writes; 0.04 TB × $5/TB |
| **Total** | **≈ $85** (≈ $65 floor + $20 variable, WAF included) | ≈ $1,850 | 1M = 100 tenants × 10 k learners |

An idle zone costs ≈ $60/month (Known Tension 7); the per-tenant increment is
≈ $3/month in metrics plus an optional $2 per-tenant MRK; the rest scales with use.

## Standards conformance

No standard applies directly to this capability. The provisioning and
rostering surfaces institutions integrate with (OneRoster 1.2, Edu-API) live
in DIO (DIO-02, DIO-14); ADM supplies the tenant, zone and home-region context.

## Known Tensions

1. **Erasure residuals.** Key destruction leaves pseudonymous ids, item ids,
   seqs and HLCs in fact items, Merkle leaves, rosters and 30-day logs.
   Symptom: a DPO can see that *someone* answered item X at time T. Options:
   (a) accept as pseudonymised; (b) physically delete fact items after
   verification (Merkle rebuild per partition, tombstone set for
   anti-entropy, ≈ 12 k deletes × 2 regions per subject); (c) encrypt
   metadata too and lose keyed access patterns. Recommendation: (a) by
   default, (b) as a per-tenant option.
2. **Retention granularity.** Keys are per subject, so "delete course X after
   5 years" cannot make X's responses unreadable while the learner lives on.
   Symptom: a per-course policy removes files but not answers. Options: (a)
   say so in the console (ADM-14); (b) per-(subject, course) keys (×50 key
   items and KMS calls per learner); (c) shred every fact body of the course
   by takedown (a large terminal write). Recommendation: (a), with (c)
   available for legal holds.
3. **Takedown versus immutability.** A shred mutates a global-table item,
   the one thing FLS forbids. Symptom: an old device replica still holds the
   content; an export taken before the shred still contains it. Options: (a)
   shred bodies, keep ids (ADM-12); (b) void only (content remains
   readable); (c) delete the item (breaks vectors and Merkle). Recommendation:
   (a); device replicas receive a `shredded` fact on next pull and drop the
   body; exports are the tenant's responsibility.
4. **Failover double emission.** During ≤ 90 s an intent may be emitted by
   both regions. Symptom: a duplicate email or AGS post. Options: (a)
   accept and count; (b) lengthen the pre-flip drain (slower failover); (c)
   a global lease on emission (forbidden by principle 5). Recommendation:
   (a); AGS and SIS consumers are idempotent by key, emails are not.
5. **Session revocation lag.** `session.revoke.v1` and the erasure replicate
   in seconds, but a region's cache and an in-flight sync can accept a fact
   from a revoked session, minting a data key. Symptom: none visible; a key
   exists for up to 24 h. Options: (a) second sweep (ADM-11); (b)
   synchronous revocation check per request (a read per call); (c) accept a
   single sweep. Recommendation: (a).
6. **Registry as a single-writer plane.** If the operator region is down,
   existing tenants keep working (registry reads are cached and replicated)
   but no provisioning, deletion or automated failover runs. Symptom: a home
   region that fails while the operator region is also down needs a manual
   failover. Options: (a) accept, with a runbook that runs the failover
   workflow from a secondary operator region after 15 minutes, writing the
   same fields so LWW converges on the same intent; (b) a per-zone operator
   plane (more floor cost, same problem one level down); (c) a leased writer
   (forbidden). Recommendation: (a).
7. **Cost floor versus "idle costs nothing".** Route 53, KMS, health checks,
   metrics, dashboards and optional WAF cost ≈ $60/zone-month with zero
   traffic. Symptom: a zone with one small tenant is not free. Options: (a)
   accept and amortise across tenants; (b) drop per-region dashboards and
   per-tenant metrics for small zones; (c) open a zone only at a tenant
   count threshold. Recommendation: (a), with (c) as the zone-opening policy.
