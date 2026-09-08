# Security and Assurance Specification

Capability ID prefix: **SEC**

## Purpose

This capability makes Trellis assessable against the NCSC Cyber Assessment
Framework (ADR-024). It owns the technical controls the other capabilities
rely on but do not specify: delivery-pipeline gates, the operator identity
model, the unsampled and immutable security log, monitoring and proactive
discovery, vulnerability management, incident response, supply-chain
controls, data classification, device data protection, penetration testing,
and the evidence pack an assessor reads. `caf-mapping.md` beside this file
maps all 39 contributing outcomes to the requirement that meets each, the
process that complements it, and the evidence produced.

The CAF assesses an *organisation*. The system can only **support** the
outcomes below; the tree states what it supplies toward each:

| Outcome group | What the system supplies | What only the operating organisation can supply |
|---|---|---|
| A1 Governance (A1.a–c) | ADR-024 and project.md principle 12 as the decision record; this spec and `caf-mapping.md` as the scope statement; evidence-pack slots for board artefacts (SEC-11) | Board ownership, accountable roles, risk appetite, decision records |
| A2 Risk management (A2.a–b) | Per-capability threat models with their accepted-risk registers (SEC-01); pipeline, probe and pentest results as assurance inputs (SEC-10) | The risk process itself, acceptance signatures, review cadence |
| B6 Staff awareness and training (B6.a–b) | Runbooks, threat models and the incident plan as training material; security-event access limited to trained roles (SEC-02) | Training records, culture, competence assessment |
| D2 Lessons learned (D2.a–b) | Immutable logs and provenance for root-cause analysis (SEC-03); the review template and the change-proposal path for actions (SEC-06) | Holding reviews, acting on them, tracking to closure |

Every other outcome is technical or mixed, has a requirement here or in
another spec, and targets **Achieved** before general availability.

## Consistency boundary

1. **The security log** is append-only per region: each region records
   what it did; nothing is replicated or merged between regions, and a
   zone-wide question is answered by reading both regions' logs. Object
   Lock in compliance mode gives immutability; an hourly manifest hash chain
   gives integrity (SEC-03).
2. **Pipeline gates** are strongly consistent by construction: one
   sequential run per release decides pass or fail.
3. **Alert and triage state** is operator-plane, single-writer, in the
   operator region's `derived` table, like the registry (ADM class 1).
4. **Abuse counters** are region-owned and eventually consistent; a source
   split across two regions can reach twice a limit before **verdicts**,
   which are facts (`abuse.v1`), converge by union.
5. **Evidence packs** are point-in-time snapshots stamped with the release
   versions and the interval they describe, never live views.
6. **Authorisation** stays eventually consistent (IDE-09); security logs
   every decision, flags writes made under stale authorisation and relies
   on voidability (FLS-07). Operator privilege is region-local and expiring
   (ADM-07), so no lag applies to it.

The security log is not in DynamoDB and is not a fact stream; `audit.v1`
facts (ADM-09) remain the tenant-visible audit record and are correlated
with the log, not replaced by it. Nothing here is authority over marks,
rosters or completion.

## Domain model

### Security event (a line in the security log; never a DynamoDB item)

```
SecurityEvent {
  event_id, ts (ms UTC, region clock), ingest_ts (added by the shipper)
  sync_hlc?, device_hlc?          -- carried when the event came from a fact or sync; device_hlc labelled claimed
  zone, region, tenant_id?        -- tenant_id absent for operator-plane events
  category : authn | authz_denied | admin | privileged | key_op | export | tenant_data_access
           | abuse | pipeline | infra | hunt | incident
  action   : dotted name, e.g. authn.magic.request, authz.denied.leading_keys, key.dk.destroy
  actor    : { principal: usr_<ULID> | usr_sys | idc:<identity-center id>, device?, role?, kid? }
  target?  : { kind, id }         -- pseudonymous ids only
  outcome  : success | denied | error
  request_id, fact_ref? (the audit.v1 appended in the same request), grant_ref? (ADM-07)
  source   : { ip, ua_family }    -- ip is personal data; SEC-08, Tension 5
  detail   : map                  -- schema-checked; never bodies, profile fields, tokens or secrets
}
```

Store: CloudWatch log group `/trellis/sec/<zone>/<region>` (transport,
90 days) → S3 `trellis-seclog-<zone>-<region>` under
`sec/<yyyy>/<mm>/<dd>/<hh>/<ulid>.jsonl.gz`, Object Lock compliance mode,
366 days; one `manifest.json` per hour `{ hour, objects: [{key, sha256,
count}], prev_manifest_sha256, max_skew_ms }`.

### Operator-plane and per-tenant derived state

```
Alert        { finding_id, source, severity: critical|high|medium|low, state: open|acked|suppressed|closed,
               first_seen, last_seen, count, region, resource, owner?, incident_ref? }
Verdict      { key: usr_<ULID> | domain:<hash> | net24:<hash>, verdict: quarantine|release, until?, decided_hlc }
GateResult   { release, commit, sbom_digest, sast, deps, iac, signatures, golden_vectors, a11y, isolation_probe, verdict }
Finding      { finding_id, source, severity, kev, component, opened, due, state: open|excepted|remediated|verified }
EvidencePack { assessment_id, version, caf_version, tenant_id, zone, generated_at, release_versions{},
               outcomes: [{id, claim, controls[], evidence[]}], manifest_sha256, signature }
```

### Fact types owned by this capability

| Type | Owner | Subject kind | Scope | Writer | PII | Purpose |
|---|---|---|---|---|---|---|
| `sec.policy.v1` | SEC | T | `_admin` | admin / operator | S | Tenant security policy, LWW per field by HLC: `replica_idle_purge` ceiling (default `P14D`, max `P30D`; UIX-09 role defaults apply within it), abuse thresholds (consumer realm), optional verified-IdP requirement for soft-organisation members (IDE-21), evidence-pack schedule |
| `abuse.v1` | SEC | L or T | `_profile` (L) / `_admin` (T) | region system device / operator / admin | P (L) / S (T) | Abuse verdict for a principal (L) or a sending-domain or source-network key (T): `{ verdict: quarantine\|release, dimension, evidence_hash, until? }`, max-by-HLC; release supersedes, never voids |

Both are appended through the FLS ingest library; the system device's `seq`
uses ADM-09's region-local counter.

### Data classes (handling rules in SEC-08)

| Class | Examples | Key | Leaves zone? | On devices |
|---|---|---|---|---|
| C1 Personal learning data | `resp`, `mark`, `feedback`, `post`, `msg`, `progress` bodies; view rows | per-subject `DK#` (FLS-16) | Never | Own data on learner devices; others' data only under SEC-09 |
| C2 Identity data | `identity`, `profile`, `device` bodies; email hashes; source IPs in logs | per-subject `DK#`; log-store key | Never | Session tokens only |
| C3 Credentials and secrets | signing private keys, integration secrets, VAPID keys, tokens | KMS / SSM SecureString | Never; per region | Session and refresh tokens only |
| C4 Tenant configuration and content | `tenant`, `flag`, `policy`, `struct` facts; blobs; answer keys and rubrics | tenant `TK#` | Never | Published bundles per CAC-09 |
| C5 Operational telemetry | sampled application logs, metrics, traces, the security log, cost rollups | log-group KMS key | Metrics and CloudTrail management events only (no personal data) | Never |

---

## Requirements

### Requirement: The system SHALL gate every release on secure-by-design checks: an in-tree threat model per capability, static analysis, dependency and SBOM scanning for Maven and npm, infrastructure-as-code scanning, signed artefacts, and no deployment while a critical finding is open [SEC-01]

The system SHALL gate every release on secure-by-design checks: an in-tree threat model per capability, static analysis, dependency and SBOM scanning for Maven and npm, infrastructure-as-code scanning, signed artefacts, and no deployment while a critical finding is open.
Each capability keeps `specs/<capability>/threat-model.md` (assets, trust
boundaries, STRIDE threats, controls by requirement ID, accepted risks with
owner and review date); the tree check fails a spec whose threat model does
not name every one of its requirement IDs. The pipeline runs SAST over Java
and TypeScript (Semgrep with the OWASP rule sets and SpotBugs with
find-sec-bugs, or equivalents), builds a CycloneDX SBOM per artefact from
the Maven and npm lockfiles and scans it against OSV and the NVD, scans the
CloudFormation templates and IAM policies (checkov or cfn-nag plus the
ADM-18 policy test), and runs the DRV-02 golden vectors, the UIX-03
accessibility gate and the SEC-12 isolation probe. Function packages are
signed with AWS Signer and every function's code-signing configuration
rejects unsigned packages; the client and engine bundles and the SBOMs are
Sigstore-signed and verified by the deploy job, which assumes its role by
OIDC federation. A Critical finding (CVSS ≥ 9.0 or listed in CISA KEV), a
SAST error or a high IaC finding fails the run; a High finding fails unless
a SEC-05 exception is in force. The `GateResult` is logged as `pipeline.gate`.

#### Scenario: Critical CVE in a transitive Maven dependency
- **WHEN** the SBOM scan finds a Critical vulnerability in a library the sync API pulls in transitively
- **THEN** the run fails before signing, nothing is deployed, and a `Finding` opens with the 7-day SLA (SEC-05)

#### Scenario: Package deployed outside the pipeline
- **WHEN** a principal calls `UpdateFunctionCode` with a package not signed by the release signing profile
- **THEN** Lambda rejects it under the code-signing configuration and the CloudTrail record becomes a High alert (SEC-04)

### Requirement: The system SHALL authenticate every operator through IAM Identity Center with phishing-resistant MFA, grant least-privilege per-function and per-role permissions, hold no long-lived access keys, reach tenant data only by the ADM-07 break-glass path, and produce quarterly access-review evidence [SEC-02]

The system SHALL authenticate every operator through IAM Identity Center with phishing-resistant MFA, grant least-privilege per-function and per-role permissions, hold no long-lived access keys, reach tenant data only by the ADM-07 break-glass path, and produce quarterly access-review evidence.
Humans sign in only through Identity Center with FIDO2 authenticators;
permission sets mirror the ADM-07 roles plus `auditor` (evidence
read-only); sessions last ≤ 8 h, privileged sets ≤ 1 h. No IAM user exists;
SCPs deny `iam:CreateUser` and `iam:CreateAccessKey`, disabling CloudTrail,
GuardDuty, Config or Object Lock, and any call outside the zone's regions
and the operator region. The deploy role is assumed by OIDC federation
with 1 h sessions. Function roles follow ADM-18; no human permission set
carries `dynamodb:*Item` on `facts` or `derived`, so the only path to
tenant data is the break-glass grant, whose IAM session is held by the
support tool's function and never issued to a workstation. Root credentials
are sealed under a runbook with hardware MFA; any root sign-in pages. Each
quarter `access-review-export` writes Identity Center assignments,
permission-set policies, role trust policies, federation configuration and
the quarter's break-glass grants to the evidence store; a named reviewer
signs off as a `priv.access_review.signed` event and an unsigned review
after 14 days alarms.

#### Scenario: Quarter end
- **WHEN** the quarterly export runs and no reviewer has signed within 14 days
- **THEN** a High alert is raised and the evidence pack shows the review as outstanding rather than omitting it

#### Scenario: Root sign-in
- **WHEN** an account root sign-in succeeds
- **THEN** a Critical alert pages within 5 minutes and the runbook requires the incident lead to match it to a sealed-procedure ticket or declare an incident (SEC-06)

### Requirement: The system SHALL log every security-relevant event in full, never sampled, to an immutable per-region store with integrity and clock consistency, retained at least twelve months, and correlated with `audit.v1` facts [SEC-03]

The system SHALL log every security-relevant event in full, never sampled, to an immutable per-region store with integrity and clock consistency, retained at least twelve months, and correlated with `audit.v1` facts.
Security-relevant means authentication events (OIDC, magic link, LTI and
SAML sign-in, refresh, revocation, failures); authorisation denials (`403`,
`advice.denied`, `unauthorised_subject`, `unauthorised_device`,
`dynamodb:LeadingKeys` denials, `tenant_mismatch`); every action that
appends `audit.v1` and every operator-plane action; key operations (data
key creation and destruction, tenant and signing key rotation, KMS grant
changes); exports (FLS-20 runs, ADM-13 requests, approvals, downloads);
operator access to tenant data (grant, expiry and every read under it,
with `grant_ref`); abuse verdicts; pipeline and deployment events. The
`SecurityLogger` library in every function writes them synchronously to
`/trellis/sec/<zone>/<region>` before the invocation returns, bypassing
the ADM-08 sampler, with a fallback marker in the application log that the
shipper also collects: this amends ADM-08 as ADR-024 amends ADR-020. The
shipper drops and counts fields outside the schema, writes to the Object
Lock bucket, and closes each hour with a manifest chained to the previous
one; `seclog-verifier` re-hashes the previous day. Timestamps come from
the AWS-synchronised region clock; `sync_hlc` and `device_hlc` travel
alongside and never order the log. Events written in a request that
appended an `audit.v1` carry `fact_ref`, `sec-fold` mirrors every folded
`audit.v1` as `audit.mirror`, and a daily count of facts against mirrors
per tenant and region alarms on any difference. Retention is 366 days in
compliance mode; `retention.v1 {class: logs}` may lengthen it, never
shorten it. Reads are `operator.security` and `auditor` only, through
Athena in a zone region.

#### Scenario: Magic link under application sampling
- **WHEN** `auth-magic` handles a request while the application logger samples success paths at 10%
- **THEN** the `authn.magic.request` event is written for every request, whether or not the application line exists

#### Scenario: Chain break
- **WHEN** `seclog-verifier` finds an hour whose `prev_manifest_sha256` does not match the previous manifest
- **THEN** a Critical alert names the hour and region and the incident runbook treats it as suspected tampering until explained

#### Scenario: Break-glass reads
- **WHEN** a support engineer under grant `bg_7` opens 40 derived rows of tenant `t_x`
- **THEN** 40 `tenant_data_access.read` events carry `grant_ref = bg_7`, `tenant_id = t_x` and the row keys, and the tenant admin's ADM-07 notification links the count

### Requirement: The system SHALL monitor every region and the operator plane with GuardDuty, Security Hub, Config rules and an organisation CloudTrail, triage alerts by a runbook, and proactively hunt for abnormal behaviour over the security log [SEC-04]

The system SHALL monitor every region and the operator plane with GuardDuty, Security Hub, Config rules and an organisation CloudTrail, triage alerts by a runbook, and proactively hunt for abnormal behaviour over the security log.
Coverage (C1): GuardDuty with S3 and Lambda protection in every region of
every zone and the operator region; Security Hub with the AWS Foundational
Security Best Practices standard, aggregated to the operator region; Config
recording all resource types with the `trellis-baseline` pack (SEC-16); one
organisation trail with log-file validation, management events everywhere,
S3 data events on export, evidence, blob and security-log buckets, and
DynamoDB data events on `registry`. Findings, CloudTrail metric filters
(root sign-in, IAM and SCP changes, trail or Object Lock changes, KMS key
deletion) and application alarms (authentication-failure spikes,
`unauthorised_subject` rate per tenant, any `LeadingKeys` denial or
`tenant_mismatch`, break-glass grants, abuse verdicts, chain failures)
reach `sec-triage` through EventBridge; it deduplicates by `finding_id`,
maps severity (Critical: 15-minute acknowledgement, pages; High: 1 h;
Medium: 1 business day; Low: weekly), pages through an EventBridge API
destination with SES fallback, and applies suppressions that carry a
reason, approver and expiry. `security/runbooks/triage.md` names the
criteria for declaring an incident (SEC-06). Proactive discovery (C2):
`security/hunts/*.sql` are versioned hunting queries with a hypothesis and
baseline, run weekly and on demand by `sec-hunt` over the security log;
indicators include sync volume per device or principal above the tenant's
30-day p99.9, cohort pulls (FLS-10) beyond the cohorts a principal teaches,
decrypted-export requests above baseline, any cross-tenant attempt,
first-seen IAM actions or principals, privileged actions outside declared
hours, mass `void.v1` or `role.v1`, and magic-link storms. Hits are alerts.

#### Scenario: Function credentials used elsewhere
- **WHEN** GuardDuty reports `UnauthorizedAccess:Lambda/MaliciousIPCaller` for a function role
- **THEN** `sec-triage` opens a Critical alert, pages within 5 minutes, and the runbook's first step invalidates the role's sessions by redeploying its configuration

#### Scenario: Weekly hunt finds over-broad pulls
- **WHEN** the cohort-pull hunt shows an instructor device that pulled 12 cohorts' module scopes in an hour while its principal teaches 2
- **THEN** a Medium alert names the device, principal and cohorts, and the analyst decides between benign (offline marking preparation) and incident

### Requirement: The system SHALL manage vulnerabilities with patching SLAs by severity, keep Lambda runtimes and dependencies current through automated rebuilds, and record exceptions with compensating controls and expiry [SEC-05]

The system SHALL manage vulnerabilities with patching SLAs by severity, keep Lambda runtimes and dependencies current through automated rebuilds, and record exceptions with compensating controls and expiry.
Sources: daily rescans of every deployed SBOM against OSV and the NVD,
Amazon Inspector scanning of functions in one region per zone (packages are
identical in both), Security Hub, pentest findings (SEC-10), disclosures
through `security.txt`, AWS Health and runtime-deprecation notices. SLAs
from detection: Critical 7 days (72 h if in CISA KEV), High 30, Medium 90,
Low 180; with no fix available, a mitigation and an exception within the
same SLA. The Java 21 managed runtime updates automatically
(`UpdateRuntimeOn = Auto`); dependencies are bumped by automated pull
requests (patch level auto-merged on green, minor with review); a monthly
rebuild of every artefact from the locked set and a rebuild triggered by
any new Critical matching a deployed SBOM both pass through SEC-01.
Exceptions live in `security/exceptions.yaml` (finding, justification,
compensating control, owner, approver, expiry ≤ 90 days; Critical needs
two approvers and ≤ 30 days); an expired exception fails the build.
`Finding` items and a monthly SLA report go to the evidence store.

#### Scenario: High with no upstream fix
- **WHEN** a High CVE in the Automerge Java binding has no fixed release
- **THEN** an exception records the compensating control (documents are materialised only from validated facts, so the path is unreachable), an owner and a 30-day expiry, and the build passes until then

#### Scenario: Critical published overnight
- **WHEN** the daily rescan matches a new Critical against the sync API's SBOM
- **THEN** a rebuild pull request opens automatically and the deployment lands within the 7-day SLA, or the finding escalates to the security lead at day 5

### Requirement: The system SHALL maintain an incident response and recovery plan with named roles, customer and regulator communications including UK GDPR breach notification, at least annual exercising alongside ADM-20 game days, and a lessons-learned process [SEC-06]

The system SHALL maintain an incident response and recovery plan with named roles, customer and regulator communications including UK GDPR breach notification, at least annual exercising alongside ADM-20 game days, and a lessons-learned process.
`security/incident-response.md` defines severities S1–S4, declaration
criteria, roles (incident lead, security lead, communications lead, tenant
liaison, scribe), escalation, evidence preservation (the security log is
immutable already; derived tables, Lambda versions and CloudTrail are
snapshotted) and pre-authorised containment playbooks: tenant-wide
`session.revoke.v1`, signing-key tombstones (ADM-19) with an epoch bump
(ADR-018), suspension of interop clients or break-glass, kill switches
(ADM-05), forced regional isolation through the Route 53 health check,
source-network blocks in the Lambda-side limiter, `abuse.v1` quarantines and
secret rotation (SEC-13). Communications: the status page (ADM-08) and a
service notice to tenant admins that consent preferences cannot suppress;
as processor, Trellis notifies each affected tenant's admin without undue
delay and within 24 h of confirming a personal data breach, with what the
controller needs for its 72-hour ICO notification; as controller of the
consumer realm it notifies the ICO within 72 h under UK GDPR Article 33
and data subjects under Article 34, with equivalent obligations per zone.
Recovery uses ADM-10, ADM-03 and the ADM-20 runbooks. At least one ADM-20
game day a year is a security scenario run end to end and measured for
time to detect and time to contain, recorded as `audit.v1 {action:
game_day}` and `incident.exercise`. S1 and S2 incidents get a post-incident
review within 10 working days; actions become change proposals under
`openspec/changes/` or owned tasks, and the review joins the evidence store.

#### Scenario: Suspected exfiltration through break-glass
- **WHEN** a hunt shows a break-glass session reading 30,000 rows across a tenant
- **THEN** the grant is revoked, S1 is declared, the tenant admin is notified within 24 h with the row classes and count, and the tenant receives the notification pack for its ICO decision

#### Scenario: Annual exercise
- **WHEN** the security game day injects a compromised function-role credential in a staging tenant of a production zone
- **THEN** time to detect (finding to acknowledgement) and time to contain are recorded, and any step slower than its runbook target amends the runbook before the next release

### Requirement: The system SHALL control its supply chain: assessed third-party services, pinned and verified open-source dependencies, checksum-verified Automerge native and browser artefacts, and an SBOM published to customers on request [SEC-07]

The system SHALL control its supply chain: assessed third-party services, pinned and verified open-source dependencies, checksum-verified Automerge native and browser artefacts, and an SBOM published to customers on request.
`security/suppliers.md` registers every third party with criticality, the
data it can reach and the assurance relied on: AWS (shared responsibility;
SOC 2 and ISO 27001 reports through AWS Artifact; services in use and their
residency), the source-control and CI provider, the paging provider, the
penetration-testing firm, and tenants' identity providers (trusted only
through OIDC discovery of a pinned issuer); a change that adds a service or
supplier fails the tree check unless the register changes with it. Maven
dependencies are pinned in `dependencyManagement` with checksum
verification; npm uses `npm ci` against a lockfile with integrity hashes;
every artefact ships a CycloneDX SBOM (SEC-01). The Automerge core is a
vendored dependency in two forms, `@automerge/automerge` (WASM in the
browser) and the Automerge Java binding (JNI on the JVM), pinned to exact
versions whose SHA-256 checksums live in `security/pins.yaml`; the build
extracts the JNI library for the Lambda architecture in use and fails on a
checksum mismatch; GraalJS artefacts are pinned and verified the same way.
CI workflows are pinned by commit SHA; `security/`, IaC and pipeline paths
need two reviewers. A tenant admin can request the deployed release's SBOM
and CycloneDX VEX statements from the console, delivered signed through the
evidence store.

#### Scenario: Automerge checksum mismatch
- **WHEN** the resolved Automerge Java binding's JNI library hashes to a value other than the pinned one
- **THEN** the build fails before packaging and a High alert is raised for a possible upstream compromise

#### Scenario: Customer asks for the SBOM
- **WHEN** a tenant admin requests the SBOM for the current release
- **THEN** within 15 minutes signed CycloneDX files and VEX statements are at a 4-hour URL in the tenant's zone and `audit.v1 {action: sbom.deliver}` is appended

### Requirement: The system SHALL classify data into the five classes of the domain model, apply handling rules per class, encrypt in transit with TLS 1.2 or later and HSTS and at rest under FLS-16 and ADR-022, inherit media sanitisation from AWS, and control decrypted exports through ADM-13 [SEC-08]

The system SHALL classify data into the five classes of the domain model, apply handling rules per class, encrypt in transit with TLS 1.2 or later and HSTS and at rest under FLS-16 and ADR-022, inherit media sanitisation from AWS, and control decrypted exports through ADM-13.
C1 and C2 are encrypted under per-subject keys, read only under IDE-09,
exported only under ADM-13, retained per ADM-14, erased per ADM-11 and
never leave the zone (ADM-02); C3 lives only in KMS or SSM and never in
facts, logs, exports, environment variables or client storage beyond the
token itself (SEC-13); C4 is under the tenant key with answer keys governed
by CAC-09; C5 carries pseudonymous ids, and only metrics and CloudTrail
management events, which hold no personal data, cross zones. Every fact
type declares a PII class in `fact-types.md` and every table, bucket and
log group carries a `data_class` tag; a lint fails an unclassified type or
resource. In transit: CloudFront and API Gateway enforce a TLS 1.2 minimum
policy with TLS 1.3 offered, HSTS `max-age` one year with `includeSubDomains`
and `preload` on zone hosts, HTTPS-only origins, ACM certificates with CAA
records, and AWS-managed encryption for replication between regions. At
rest: fact bodies under per-subject or tenant keys (FLS-16), tables and
buckets under SSE-KMS as a second layer, log groups, queues and buses under
KMS keys, Step Functions payloads restricted to pointers. Media
sanitisation is an AWS responsibility evidenced by its compliance reports;
no Trellis-managed media exists, and tenant data reaches an operator device
only through the support tool's viewer, never as a download. Decrypted
exports follow ADM-13; every download is also an `export.decrypted.download`
event and clients never persist an export (SEC-09).

#### Scenario: Unclassified fact type
- **WHEN** a change registers `sketch.v1` without a PII class
- **THEN** the lint fails the change and the type cannot be ingested

#### Scenario: Operator tries to take an export
- **WHEN** an `operator.support` engineer requests a decrypted export of a tenant
- **THEN** it is refused because only the tenant's own admins can request and approve one, and the refusal is an `authz.denied.export` event

### Requirement: The system SHALL protect data on devices: learner replicas hold only the learner's own data as a stated accepted risk, while instructor and admin replicas holding other people's data are encrypted under a non-extractable WebCrypto key bound to the session, purged after a configurable idle period and on sign-out, and never hold decrypted export files [SEC-09]

The system SHALL protect data on devices: learner replicas hold only the learner's own data as a stated accepted risk, while instructor and admin replicas holding other people's data are encrypted under a non-extractable WebCrypto key bound to the session, purged after a configurable idle period and on sign-out, and never hold decrypted export files.
A learner's replica (ACT-02) holds that learner's facts, released keys and
bundles (CAC-14) and drafts on an untrusted device (ADR-006) that belongs
to the person the data is about; the platform claims nothing for it beyond
UIX-09 and says so in the privacy notice and in `caf-mapping.md` B3.d. A
replica holding other people's data (cohort pulls under FLS-10, marking
queues, cached gradebook rows, directory results) is encrypted record by
record with AES-256-GCM under a replica key generated non-extractable in
WebCrypto whose wrapping key is bound to the session (UIX-09): created at
sign-in, never exportable to script, and destroyed, shredding the
ciphertext, on sign-out, on an observed `session.revoke.v1` (IDE-12), on a
refresh refused with `unauthorised_device`, and after an idle period.
`sec.policy.v1.replica_idle_purge` (default `P14D`, max `P30D`) is the
security ceiling on that period; UIX-09's role defaults (12 h for
instructors and tutors, 1 h for admins and operators) apply within it, and
a tenant may lengthen a role's period only up to the ceiling. Instructor pulls
are limited to cohorts the principal currently teaches or marks. Decrypted
exports (ADM-13) are never written to IndexedDB or the cache; the client
hands the URL to the browser's download path, beyond which the tenant's
device policy governs.

#### Scenario: Laptop idle for three weeks
- **WHEN** an instructor opens the app 21 days after last use under the tenant default
- **THEN** the key and the encrypted cohort stores are deleted before any UI renders, and the instructor re-pulls the cohorts they teach

#### Scenario: Device revoked remotely
- **WHEN** an admin revokes a lost instructor tablet (IDE-12)
- **THEN** the next refresh from that device fails and the client purges; until it contacts a region the ciphertext is unreadable without the non-extractable key, the residual the threat model states

### Requirement: The system SHALL undergo an annual CHECK- or CREST-accredited penetration test whose scope covers multi-tenancy isolation, the interop endpoints, the consumer realm and the client, with remediation tracked under SEC-05 and independent assurance of the evidence pack [SEC-10]

The system SHALL undergo an annual CHECK- or CREST-accredited penetration test whose scope covers multi-tenancy isolation, the interop endpoints, the consumer realm and the client, with remediation tracked under SEC-05 and independent assurance of the evidence pack.
Minimum annual scope: the learner, instructor, admin and consumer-realm web
and API surfaces including the realm's OpenID Provider (IDE-20) and
self-service sign-up; the sync protocol (spoofed subjects, seq conflicts,
oversized batches, replay); tenant isolation (ADM-04: key-prefix and
hostname confusion, wildcard soft-organisation hosts, token `ten` claims,
KMS encryption context); interop (LTI-01 and LTI-05 launches, DIO-19
client-credentials endpoints, OneRoster, Edu-API, Caliper, SCIM (DIO-20),
webhooks, the OB 3.0 API and CRD-08 verification); the client (service
worker, replica encryption, script injection to key use); the AWS
configuration; and the pipeline. A new interop surface is tested before
its first release. Tests run against a staging tenant in production zones
with synthetic data under AWS's customer testing policy; denial of service
is excluded. Findings enter SEC-05 with its SLAs; Critical and High are
retested and the retest letter joins the report in the evidence store;
`security/pentest/<year>.md` holds ids and states only. A disclosure policy
is published at `/.well-known/security.txt` (RFC 9116); a bug bounty is
optional. An assessor independent of the engineering team reviews the
evidence pack (SEC-11) before each CAF assessment, and Cyber Essentials
Plus is obtained annually as the subset it is.

#### Scenario: Cross-tenant read found
- **WHEN** the tester reads tenant B's catalogue through tenant A's hostname
- **THEN** the finding is Critical, the fix ships within 7 days, the provider retests, and the isolation probe (SEC-12) gains a case for it

#### Scenario: Scope check
- **WHEN** a proposed test plan omits the consumer realm
- **THEN** the evidence-pack builder flags A2.b as incomplete for the year until the scope is amended

### Requirement: The system SHALL generate a per-assessment CAF evidence pack that lists each contributing outcome, its rating claim, its controls and links to evidence, regenerated on demand and stored in the tenant's residency zone [SEC-11]

The system SHALL generate a per-assessment CAF evidence pack that lists each contributing outcome, its rating claim, its controls and links to evidence, regenerated on demand and stored in the tenant's residency zone.
A tenant admin or operator starts `evidence-pack` from the console
(`audit.v1 {action: evidence_pack.request}`); it also runs yearly. The
workflow reads the claims from `caf-mapping.md` at the deployed commit and
collects in parallel: configuration (Config compliance for the zone,
permission sets, Object Lock and trail settings, KMS key policies, TLS
policies, GuardDuty and Security Hub status); logs (chain-verification
results, alert statistics, access reviews, the tenant's break-glass grants
and export approvals); test results (the release's `GateResult`,
golden-vector and isolation-probe runs, pentest summary and retest letter,
game-day audit facts); the in-tree policy set at that commit; and slots
marked `organisation-supplied` for board, risk and training artefacts.
Platform-wide evidence contains no tenant's data and tenant-scoped evidence
only that tenant's. The pack is written to `evidence/<assessment_id>/v<n>/`
in the tenant's zone bucket with a signed manifest, an `audit.v1 {action:
evidence_pack.generate, params_hash}` and a 4-hour URL. Regeneration adds a
version and keeps the old; a failed collector marks its outcome `evidence
unavailable` rather than omitting it, and the run retries.

#### Scenario: Assessment pack
- **WHEN** a tenant admin requests a pack
- **THEN** within 15 minutes the manifest lists all 39 outcomes, each with a claim, control IDs and at least one evidence link or an `organisation-supplied` slot, and the admin receives the URL

#### Scenario: Residency
- **WHEN** a pack is generated for a tenant in the `eu` zone
- **THEN** every object, including platform-wide evidence copied into it, is written in an `eu` region bucket and no evidence request crosses a zone boundary

### Requirement: The system SHALL name the multi-tenancy threats of pooled tables and shared regions and defend against cross-tenant access and noisy neighbours with layered controls, a continuous isolation probe and zero-tolerance detection [SEC-12]

The system SHALL name the multi-tenancy threats of pooled tables and shared regions and defend against cross-tenant access and noisy neighbours with layered controls, a continuous isolation probe and zero-tolerance detection.
Threats: key-prefix confusion in `facts` and `derived`; hostname confusion
on wildcard soft-organisation hosts; a token's `ten` claim used at another
tenant's host; a consumer-realm `id_token` (IDE-20) accepted directly by an
organisation instead of being exchanged under IDE-21; interop client
confusion; S3 prefix traversal; tenant data left in a warm execution
environment's cache; leakage through logs or metrics; one tenant's burst
starving another. Controls: the tenant id comes only from the verified
session and is checked against the registry entry for the request's
hostname (`tenant_mismatch` otherwise); every key, S3 prefix, KMS
encryption context and cache key is built from it (ADM-04, ADM-01); tooling
roles carry `dynamodb:LeadingKeys`; caches are keyed by tenant and bounded;
the log-schema test allows `tenant_id` only in its declared field; fact
writes are keyed by subject so a burst touches only its own partitions,
sync is never throttled below FLS-13 queueing, read APIs are limited per
tenant (ADM-04) and abusive sources are shed by SEC-14. `isolation-probe`
keeps two probe tenants per zone and, after every deploy and daily,
presents tenant A's tokens, hostnames and client credentials against every
API with tenant B's identifiers, expecting denial or emptiness; a failure
blocks the release. Any `LeadingKeys` denial or `tenant_mismatch` in
production is a High alert because the expected rate is zero.

#### Scenario: Token replayed at another tenant's host
- **WHEN** a session minted for `t_a` is presented at `t_b`'s hostname
- **THEN** the request fails with `401 tenant_mismatch` before any key is built, and the event raises a High alert naming both tenants

#### Scenario: Deadline burst in one tenant
- **WHEN** a 2,000-learner cohort in `t_a` submits at 5 facts/s
- **THEN** `t_b`'s sync and read latency are unchanged because no partition key is shared, and `t_a`'s sync is queued, never refused

### Requirement: The system SHALL keep every secret in KMS or SSM Parameter Store, never in facts, logs, exports, environment variables, client bundles or source, with rotation paths and alerting on human access [SEC-13]

The system SHALL keep every secret in KMS or SSM Parameter Store, never in facts, logs, exports, environment variables, client bundles or source, with rotation paths and alerting on human access.
Secrets are C3 data: private signing keys (region-local, ADM-19, IDE-03),
tenant integration secrets (SIS and OneRoster client credentials, webhook
signing secrets referenced by `webhook.v1`, OIDC client secrets for social
sign-in, Cognito bridge secrets), VAPID keys and the paging credential.
Each is an SSM `SecureString` at `/trellis/<zone>/<region>/<tenant>/<name>`
under a dedicated KMS key, read by function roles with a path-scoped
`ssm:GetParameter` whose path is built from the verified tenant id. Fact
schemas carry only references (`secret_ref`) and ingest rejects a body
field named like a secret as `malformed`; the log-schema test, a
secret-pattern scan of log samples, the client build and the repository
(push protection and CI scanning) all fail on secret material; Step
Functions payloads carry pointers. Rotation: signing keys by ADM-19
add-then-retire; integration secrets by the tenant admin from the console
with a 24-hour overlap where the peer allows two active secrets; the zone
MRK with automatic annual material rotation. Any `GetParameter` on a
`SecureString` or `kms:Decrypt` under the secrets key by a human principal
is a High alert that closes only when a ticket is attached.

#### Scenario: Secret committed
- **WHEN** a developer pushes a commit containing an OIDC client secret
- **THEN** push protection rejects it; if it lands by another route, CI fails, the secret is rotated within 24 h and an S3 incident is opened

#### Scenario: Human reads a parameter
- **WHEN** an `operator.sre` principal reads a tenant's SIS credential from SSM during a runbook step
- **THEN** the read succeeds only if the permission set allows that path, and the resulting High alert closes when the ticket is attached

### Requirement: The system SHALL limit abuse of the consumer realm's self-service surfaces with per-address, per-network and per-account rate limits, email abuse controls, and quarantine verdicts that restrict outbound effects without ever refusing learning [SEC-14]

The system SHALL limit abuse of the consumer realm's self-service surfaces with per-address, per-network and per-account rate limits, email abuse controls, and quarantine verdicts that restrict outbound effects without ever refusing learning.
Surfaces: sign-up and magic-link requests, social OIDC sign-in,
self-service organisation creation (ADR-026), invitations (IDE-15, IDE-21),
messages and forum posts in open courses, and webhook registration by soft
organisations. Limits (defaults in `sec.policy.v1`; region-owned counters):
3 magic links per address per 15 minutes and 10 per day, after which the
request is acknowledged as sent but no email goes; 20 sign-ups per source
/24 per hour; accounts under 24 h old or without any learning fact may send
5 invitations or messages per day and no free text in invitations. Email
abuse: SPF, DKIM and DMARC `p=reject` on every sending domain; the SES
suppression list fed by `notify.delivery.v1` bounces and complaints; a
complaint rate above 0.1% or bounce rate above 5% alarms and tightens
limits by `flag.v1`; transactional templates carry no user-controlled link
other than the magic link. `abuse-detector` evaluates velocity windows
(accounts per network, sequential addresses, sign-up followed by mass
invitations) and appends `abuse.v1 {quarantine}`: a quarantined principal
still signs in, syncs and learns, but invitations, messages, organisation
creation and webhooks are held until `release` (automatic after 7 days
without further signals, or by review). No CAPTCHA or cognitive test is
ever used (ADR-025). Because counters are region-owned, a source split
across two regions can reach twice a limit before the verdict converges.

#### Scenario: Magic-link bombing
- **WHEN** 50 magic-link requests name one address within 10 minutes
- **THEN** 3 emails are sent, the rest are acknowledged without sending, each is an `abuse.magic.suppressed` event, and the address stays on cool-down for the day

#### Scenario: Sign-up burst from one network
- **WHEN** 200 sign-ups arrive from one /24 in an hour
- **THEN** every sign-up succeeds, the accounts receive `abuse.v1 {quarantine}` facts, their invitations are held, and the operator sees the cluster in the abuse view

### Requirement: The system SHALL secure the interop surfaces: scoped OAuth client credentials per DIO-19, JWKS rotation per IDE-03, validated launches and registrations, hardened parsers, and SSRF-safe outbound calls with signed webhooks [SEC-15]

The system SHALL secure the interop surfaces: scoped OAuth client credentials per DIO-19, JWKS rotation per IDE-03, validated launches and registrations, hardened parsers, and SSRF-safe outbound calls with signed webhooks.
Inbound: client-credentials tokens (DIO-19) are audience-bound, scoped per
service, valid ≤ 1 h, with `jti` single-use recorded region-locally; LTI
launches (LTI-01, LTI-05) validate `iss`, `aud`, `azp`, `deployment_id` and
`nonce` against registration facts, accept only ES256 and RS256, and route
`state` to the issuing region (IDE Known Tension 5); dynamic registration
(LTI-15) activates only after admin approval; SCIM (DIO-20), OneRoster,
Caliper and CC payloads are size-capped and schema-validated, XML parsers
disable external entities and bound entity expansion, packages are bounded
against decompression bombs, and inbound scores and results become facts an
instructor can void, never authority (DRV-01). Outbound (AGS posts, SIS
pushes, webhooks, JWKS, discovery, CASE and deep-link fetches): HTTPS only;
resolved addresses must be public unicast (no RFC 1918, link-local
including the instance metadata address, loopback or IPv6 ULA ranges);
redirects re-checked; response size and time capped; functions run without
a VPC so nothing internal is reachable; webhooks carry an HMAC-SHA256
signature and timestamp with a replay window. Our JWKS rotation follows
IDE-03 with tombstones for compromise and an epoch bump (ADR-018);
per-client rate limits and a suspension state on `lti.reg.v1`,
`ob.client.v1` and `webhook.v1` are the kill switches.

#### Scenario: Webhook aimed at the metadata endpoint
- **WHEN** a soft organisation registers a webhook URL resolving to 169.254.169.254
- **THEN** the registration is stored with `status = invalid_url`, nothing is ever sent to it, and an `abuse.webhook.rejected` event is logged

#### Scenario: Compromised tool floods scores
- **WHEN** a registered tool posts 10,000 AGS scores in a minute
- **THEN** posts beyond the client's limit receive `429`, accepted ones are `ext.score.v1` facts, the volume hunt raises a High alert, and the admin suspends the registration while an instructor voids the facts

### Requirement: The system SHALL keep an asset inventory generated from infrastructure-as-code and reconciled nightly against AWS Config, and enforce a secure configuration baseline in which every change reaches production through the pipeline [SEC-16]

The system SHALL keep an asset inventory generated from infrastructure-as-code and reconciled nightly against AWS Config, and enforce a secure configuration baseline in which every change reaches production through the pipeline.
The inventory (A3.a) is derived from the deployed stacks: functions and
versions, tables, buckets, keys, queues, buses, distributions, hostnames,
roles, permission sets, external endpoints and suppliers, each tagged
`zone`, `capability`, `tenant_id` where applicable and `data_class`;
`inventory-reconcile` compares it with Config's resource inventory and
alerts on any resource IaC does not describe. The baseline (B4.b) is the
`trellis-baseline` conformance pack: encryption on every table, bucket,
queue and log group; no public bucket or publicly invocable function; PITR
on `facts` and `registry`; Object Lock on the security-log, trail and
evidence buckets; trail and GuardDuty enabled; zero IAM users; a
code-signing configuration on every function; TLS policies; drift detection
on every stack. Non-compliance is a Finding under SEC-05; a subset with safe
remediation (PITR, logging, public-access block) is auto-remediated through
SSM Automation. Secure management (B4.c): console and CLI writes to
production are denied to humans except `operator.sre` under a ticket, and
such a change must be reconciled into IaC within 5 working days while its
drift alert stays open.

#### Scenario: Hand-made bucket
- **WHEN** a bucket is created outside the stacks
- **THEN** the nightly reconcile lists it as unmanaged, a Medium alert names its creator from CloudTrail, and the evidence pack shows the interval under A3.a

#### Scenario: PITR switched off
- **WHEN** PITR on `facts` is disabled
- **THEN** the Config rule turns non-compliant within minutes, remediation re-enables it, and a High alert records who disabled it

---

## DynamoDB access patterns

The security log itself is not in DynamoDB (SEC-03). Operator-plane items
use the reserved tenant id `t_op`, which owns no facts; it exists so the
key convention and `dynamodb:LeadingKeys` discipline apply to the operator
plane too.

### `facts` (global, per zone)

| # | Access pattern | Key condition | Notes |
|---|---|---|---|
| 1 | Tenant security policy facts | `PK = T#t#S#T#<tenant>`, `SK begins_with F#_admin#` | `sec.policy.v1`; folded LWW per field into `T#t#CFG` / `SEC` |
| 2 | Abuse verdicts for a principal | `PK = T#t#S#L#<usr>`, `SK = F#_profile#dev_sys_<region>#<seq10>` | `abuse.v1`, max-by-HLC per key |
| 3 | Abuse verdicts for a domain or network key | `PK = T#t#S#T#<tenant>`, `SK = F#_admin#dev_sys_<region>#<seq10>` | consumer realm tenant only |

### `derived` (regional) — items owned by this capability

| Item | PK | SK | Purpose |
|---|---|---|---|
| Abuse counter | `T#t#AB#<dim>#<key_hash>#<shard>` | `W#<window_start>` | `dim ∈ addr, net24, domain, principal`; shard 0–7; TTL 25 h |
| Verdict cache | `T#t#ABV#<key>` | `STATE` | Folded from `abuse.v1`; read by emitters before any send |
| Security policy cache | `T#t#CFG` | `SEC` | Shares ADM's config collection |
| Alert | `T#t_op#SA` | `<finding_id>` | Operator region; dedupe and state |
| Open-alert index | `T#t_op#SAO` | `<severity>#<first_seen>#<finding_id>` | Deleted on close; stands in for a GSI |
| Suppression | `T#t_op#SUP` | `<rule_id>` | Reason, approver, expiry |
| Hunt state | `T#t_op#HUNT#<query_id>` | `R#<run_ts>` | Latest results; the log is the record; TTL 400 d |
| Chain head | `T#t_op#SLC#<zone>#<region>` | `HEAD` | Last manifest digest and hour |
| Finding | `T#t_op#VF` | `<finding_id>` | Severity, due, state, exception ref |
| Access review | `T#t_op#AR` | `<yyyy>-Q<n>` | Generated, signed_by, signed_at |
| Isolation probe run | `T#t_op#ISO` | `<run_ts>` | Pass/fail per case; TTL 400 d |
| Evidence pack | `T#t#EP#<assessment_id>` | `MANIFEST` / `V#<n>` / `O#<outcome>` | Tenant's zone; links to the S3 objects |

No GSIs: the one list-by-state need (open alerts) is served by the `SAO`
index item. **Sizing.** `SA` ≈ 1,000 findings/month × 2 KB; abuse counters
in the consumer realm ≈ 100 k events/day → ≈ 3 M small items/month under
TTL; an evidence pack version is 39 outcome items × ≈ 5 KB + a 20 KB
manifest ≈ 220 KB. **Hot partitions.** A flood from one /24 concentrates
on one counter PK: increments are batched per execution environment
(written every 100 requests, as ADM-04) and spread over 8 shards, so
10,000 req/s from one source yields ≈ 12 writes/s per shard against the
1,000 WCU/s ceiling; `SA` takes < 1 write/s; the chain head one per hour.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `SecurityLogger` (library) | Linked into every function | — | ≤ 3 ms | — | Synchronous `PutLogEvents`; fallback marker in the app log |
| `seclog-shipper` | CloudWatch Logs subscription (sec group; app group filtered on the fallback marker) | Java 21 SnapStart, 512 MB | 30 ms/batch | 350 / 800 ms | Schema check, gzip, Object Lock PUT |
| `seclog-verifier` | Scheduler hourly (close manifest) and daily (re-hash) | Java 21 SnapStart, 1024 MB | 1–20 s | 350 / 800 ms | Chain; `SLC` head |
| `sec-fold` | EventBridge `fact.folded` filter `audit.v1 \| abuse.v1 \| sec.policy.v1` | Java 21 SnapStart, 512 MB | 10 ms | 350 / 800 ms | Audit mirror, verdict and policy caches |
| `sec-triage` | EventBridge: GuardDuty, Security Hub, Config, CloudTrail metric alarms, app alarms, hunt hits | Java 21 SnapStart, 512 MB | 40 ms | 350 / 800 ms | Operator region; dedupe; pages via API destination |
| `abuse-detector` | Scheduler every 15 min; `fact.folded` filter `identity.v1 \| device.v1 \| enrol.v1 \| notify.delivery.v1` | Java 21 SnapStart, 512 MB | 50–500 ms | 350 / 800 ms | Velocity windows; appends `abuse.v1` |
| `sec-hunt` | Step Functions Standard (Scheduler weekly; on demand) | Java 21 SnapStart, 512 MB | Athena wait | 350 / 800 ms | Results to the log and `HUNT` |
| `evidence-pack` | Step Functions Standard (`admin-api`; Scheduler yearly) | Java 21 SnapStart, 1024 MB | 1–60 s per collector | 350 / 800 ms | Parallel collectors; signed manifest |
| `access-review-export` | Scheduler quarterly | Java 21 SnapStart, 512 MB | ≈ 5 s | 350 / 800 ms | Identity Center and IAM exports |
| `isolation-probe` | Pipeline post-deploy; Scheduler daily | Java 21 SnapStart, 512 MB | 2–10 s | 350 / 800 ms | Probe tenants; `ISO` results |
| `inventory-reconcile` | Scheduler nightly | Java 21 SnapStart, 1024 MB | 10–60 s | 350 / 800 ms | Config inventory versus IaC |

Every function is asynchronous; no cold start is user-visible and none has
provisioned concurrency.

## Propagation path

1. Any function → `SecurityLogger` → CloudWatch `/trellis/sec/<zone>/<region>` (synchronous, unsampled) → subscription filter → `seclog-shipper` → Object Lock bucket → hourly manifest chain → daily `seclog-verifier` → `SLC` head; a break → step 3.
2. `audit.v1` fact → FLS propagation (stream-router → roster-updater → EventBridge `fact.folded`) → `sec-fold` → `audit.mirror` record → step 1; the daily fact-versus-mirror count alarms on any difference.
3. CloudTrail organisation trail → Object Lock bucket and CloudWatch metric filters → alarms; GuardDuty, Security Hub and Config findings → each region's default bus → rule to the operator-region bus → `sec-triage` → `SA` / `SAO` → EventBridge API destination (pager) with SES fallback → triage runbook → SEC-06 declaration when the criteria hold.
4. `auth-magic`, sign-up and invitation APIs → `AB` counters → `abuse-detector` → `abuse.v1` by the region system device (FLS-04 put) → replication → `fact.folded` → `sec-fold` → `ABV` cache in every region → COM-07 and invitation emitters consult `ABV` before sending → `abuse.verdict` record → step 1.
5. Scheduler → Step Functions `sec-hunt` → Athena over the security log → results → step 1 and `HUNT`; hits → step 3.
6. `admin-api` `evidence_pack.request` → Step Functions `evidence-pack` (parallel collectors) → `evidence/<assessment_id>/v<n>/` in the tenant's zone → signed manifest → `audit.v1 {evidence_pack.generate}` → presigned URL.
7. Pipeline run → gates (SEC-01) → signed artefacts → OIDC deploy role → Lambda code-signing enforcement → `pipeline.gate` and `pipeline.deploy` records (the deploy role holds `logs:PutLogEvents` on the security group only) → step 1; the deployment API calls appear in CloudTrail → step 3.

## Cost model

Per zone (two regions). Prices marked † are outside project.md §6.1 and
are mid-2025 list-price assumptions.

| Component | L10k | 1M | Basis |
|---|---|---|---|
| GuardDuty † | **$14** | $250 | ≈ 2.5 M CloudTrail management events (KMS calls dominate) × $4/M = $10; S3 protection 2 M data events × $0.80/M = $1.6; Lambda protection ≈ $2; tiered at 1M |
| Security Hub † | **$25** | $30 | FSBP ≈ 230 controls × 2 regions × daily ≈ 14 k checks × $0.001 + change-triggered checks; per account, not per learner |
| AWS Config † | **$12** | $40 | ≈ 2 k configuration items × $0.003 + ≈ 40 k rule evaluations × $0.001 |
| CloudTrail † | **$2.5** | $80 | First management-event copy free; 2 M S3 data events × $0.10/100 k = $2; registry data events ≈ $0.1; trail storage ≈ 4 GB × $0.023 |
| Security log (CloudWatch ingest, S3 Object Lock, PUTs) | **$2** | $120 | 2 M events × 0.5 KB = 1 GB × $0.50 ingest; 90-day CloudWatch storage ≈ $0.1 †; ≈ 150 MB/month gzipped, 12 months retained ≈ $0.05; 40 k PUTs $0.2; trail objects ≈ 50 GB retained ≈ $1.2 |
| Inspector for Lambda † | **$18** | $18 | 60 functions × $0.30 in one region per zone (packages identical in both) |
| KMS keys (log, secrets, evidence signing) | **$6** | $6 | 3 keys × 2 regions × $1 |
| Athena hunts † | **$0.1** | $10 | Weekly × ≈ 5 GB scanned ≈ 0.02 TB × $5/TB |
| Lambda, Step Functions, EventBridge (shipper, fold, triage, detector, hunts, packs, probes) | **$1.5** | $150 | ≈ 3 M invocations × 0.2 GB-s ≈ $0.6 + $0.6 requests; ≈ 5 k transitions × $25/M |
| Evidence and access-review storage | **$0.1** | $1 | < 1 GB |
| **Total per zone** | **≈ $80** (≈ $60 of it fixed at zero traffic) | ≈ $700 | 1M = 100 tenants × 10 k learners in one zone |

ADR-024 estimated $30–60 per zone; the difference is Inspector and Security
Hub, already reduced to one region and one standard. Outside the AWS bill
and not totalled: the annual penetration test (order of £15–30 k †), any
scanner subscription, and the paging provider. The pipeline scanners are
open-source tools run in CI minutes.

## Standards conformance

| Standard | Role | Target | In scope | Out of scope (why) | Eventually-consistent conflict → resolution |
|---|---|---|---|---|---|
| NCSC CAF v3.2 (objectives A–D) | Assurance framework for the operating organisation | Technical outcomes Achieved; organisational outcomes supported (`caf-mapping.md`) | All 39 contributing outcomes | Nothing; organisational evidence is the organisation's | B2 authorisation lag (IDE-09) → log, flag, void; B3.d learner devices → accepted risk; C1.b per-region logs → union, never merge |
| NCSC Cloud Security Principles | Customer-facing statement of the service | Statement per principle in the evidence pack | All 14 principles | — | Principle 3 separation → SEC-12; 13 audit information → SEC-03 |
| UK GDPR Articles 33–34 (breach notification) | Processor for organisations; controller for the consumer realm | Notify controllers within 24 h of confirmation; ICO within 72 h as controller | Breach notification only | Erasure, consent, retention (ADM-11, ADM-14, ADM-16) | Immutable logs keep pseudonymous ids for 12 months → residual stated (Tension 5) |
| Cyber Essentials / CE Plus | Baseline subset of CAF objective B | Plus, annually | Five controls | Assessment of the operated service (the CAF does that) | — |
| OWASP ASVS 4.0 | Rule baseline for SAST and pentest scope | Level 2 | SEC-01, SEC-10 | Level 3 items needing hardware or proctoring | — |
| RFC 9116 `security.txt` | Vulnerability disclosure | Published | SEC-10 | — | — |
| WCAG 2.2 AA | Not applicable | — | This capability has no user interface of its own; console surfaces are UIX-03 | — | — |

ISO 27001 and SOC 2 are not targeted; the evidence pack is organised so
their control mappings can be added without new controls.

## Known Tensions

1. **Sampled application logs versus full security logging (resolved).**
   ADM-08 samples success paths at 10%; an investigation cannot tolerate a
   missing authentication or export event. Options: (a) 100% application
   logging (≈ 10× the CloudWatch line); (b) sample security events too;
   (c) a separate unsampled channel with its own retention. Resolution:
   (c), SEC-03, at ≈ $2 per zone-month; ADR-024 amends ADR-020 accordingly.
2. **Untrusted learner devices versus B3.d.** A learner's device holds
   their facts, released keys (known-tensions §4) and drafts, under the
   learner's control. Symptom: an assessor reads "important data on
   uncontrolled mobile devices". Options: (a) accept for learners and
   protect replicas that hold other people's data (SEC-09); (b) encrypt
   learner replicas under a server-held key (ends offline work); (c) manage
   learner devices (impossible for a public service). Recommendation: (a),
   with B3.d claimed as Partially achieved and the reason stated.
3. **Eventually consistent authorisation (IDE-09) versus B2.** A revoked
   role works elsewhere for the replication lag. Symptom: a fact written by
   a writer who was unauthorised at fold time. Options: (a) accept, log,
   flag `writer_unauthorised_at_fold`, void; (b) a cross-region revocation
   read per request; (c) route privileged writes to the home region.
   Recommendation: (a) for tenant roles; operator privilege is already
   region-local and expiring (ADM-07), so the lag does not apply there.
4. **Consumer-realm self-service versus identity verification (B2.a).**
   Email possession is the only proof; display names are unverified.
   Symptom: impersonation by name; abusive sign-ups. Options: (a) accept,
   with SEC-14 quarantines and a soft-organisation policy requiring a
   verified IdP (`sec.policy.v1`); (b) require social or institutional
   OIDC for everyone (excludes people); (c) identity proofing
   (disproportionate for formative learning). Recommendation: (a); B2.a is
   claimed Partially achieved for the consumer realm and Achieved for
   operators and strict organisations.
5. **Immutable logs versus erasure.** The security log holds pseudonymous
   ids and source IPs for 366 days in compliance mode and cannot be edited.
   Symptom: after ADM-11 erasure a trace of "someone with this id signed in
   from this address" remains for up to a year, longer than the 30-day
   residual ADM states. Options: (a) accept as a documented residual (the
   link from id to person is destroyed with the `identity.v1` and
   `profile.v1` bodies; IPs are retained on the security basis); (b) HMAC
   source IPs under a monthly KMS key so only the security team can
   re-derive them; (c) governance-mode locks that a privileged role can
   lift (weakens C1.b). Recommendation: (a) with retention held at exactly
   12 months, stated in the privacy notice and the erasure verification;
   (b) as a tenant-selectable option.
6. **The CAF's organisational scope versus a SaaS vendor's evidence.** The
   CAF assesses an organisation; a tenant may be assessed and need its
   supplier's evidence, or the operator may be assessed and must not leak
   other tenants' data. Symptom: an assessor asks a tenant for the
   operator's board minutes, or the pack contains another tenant's grants.
   Options: (a) per-tenant packs with platform-wide plus own-tenant
   evidence and organisation-supplied slots (SEC-11); (b) a public
   statement only (Cloud Security Principles); (c) a SOC 2 report instead.
   Recommendation: (a) and (b) together; (c) when customers require it.
7. **Compliance-mode locks versus defects.** A defect that writes
   personal data into the security log cannot be corrected for a year.
   Options: (a) governance mode; (b) compliance mode with the schema
   enforced at the shipper, which drops undeclared fields before the PUT;
   (c) tokenise every free-text field. Recommendation: (b).
8. **Security tooling floor versus "idle costs nothing".** ≈ $60 per
   zone-month is spent with no traffic, on top of ADM's ≈ $60 floor.
   Options: (a) accept and amortise across the zone's tenants; (b) drop
   Inspector and Security Hub for small zones (loses B4.d and B4.b
   evidence); (c) open zones only above a tenant-count threshold (ADM
   Tension 7). Recommendation: (a), with (c) as the zone-opening policy.
