# CAF Mapping

Numbering and titles follow the NCSC Cyber Assessment Framework **v3.2**
(four objectives, fourteen principles, 39 contributing outcomes). Change
014 re-baselines this table against the latest published CAF version
adopted by the assessing body before the first assessment; if an outcome
is split, merged or retitled, its row is re-derived from the requirements,
never the reverse. The ratings are **claims** the design supports: the
operating organisation must substantiate each with the evidence named
here, and organisational outcomes are rated on that organisation's own
process evidence, of which the system supplies only what the row says.
"Achieved" on a technical outcome means the deployed system, as specified,
evidences the indicators of good practice; "Partially achieved" names the
reason and the accepted risk. Nature: technical (a property of the
system), organisational (a property of the operator), mixed (both).

| Outcome | Title | Nature | How Trellis meets or supports it | Evidence produced | Target rating |
|---|---|---|---|---|---|
| A1.a | Board Direction | organisational | ADR-024 and project.md principle 12 record the decision and its scope; the evidence pack carries a board-artefact slot (SEC-11) | ADR-024; organisation-supplied slot in the pack | Achieved by the organisation (board evidence required) |
| A1.b | Roles and Responsibilities | organisational | Operator roles are defined (ADM-07, SEC-02) and incident roles named (SEC-06); the organisation assigns people | Permission-set export (SEC-02); `security/incident-response.md` | Achieved by the organisation |
| A1.c | Decision-making | organisational | Security decisions travel as change proposals under `openspec/changes/` with threat-model updates (SEC-01) and recorded exception approvals (SEC-05) | Merged proposals; `security/exceptions.yaml` | Achieved by the organisation |
| A2.a | Risk Management Process | organisational | Per-capability threat models carry accepted-risk registers with owners and review dates (SEC-01); the consolidated tensions documents name residual risks | `threat-model.md` files at the deployed commit | Achieved by the organisation (process owner) |
| A2.b | Assurance | mixed | Annual accredited pentest, independent pack review and Cyber Essentials Plus (SEC-10); pipeline gates (SEC-01); fold-versus-recompute verifier (MVA-04) | Pentest report and retest letter; `GateResult`; pack review sign-off | Achieved |
| A3.a | Asset Management | technical | IaC-derived inventory reconciled nightly with Config (SEC-16); SBOM per artefact (SEC-07); data classes and tags (SEC-08) | `inventory-reconcile` output; SBOMs; `data_class` tags | Achieved |
| A4.a | Supply Chain | mixed | Supplier register, pinned and checksum-verified dependencies, Automerge and GraalJS pins, SBOM and VEX to customers, AWS shared-responsibility evidence (SEC-07) | `suppliers.md`, `pins.yaml`, SBOMs, AWS Artifact reports | Achieved |
| B1.a | Policy, Process and Procedure Development | mixed | In-tree policy set, runbooks and incident plan derived from the threat models (SEC-01, SEC-04, SEC-06) | Policy set at the deployed commit (SEC-11) | Achieved (organisation owns adoption) |
| B1.b | Policy, Process and Procedure Implementation | mixed | Policies enforced by pipeline gates (SEC-01), SCPs and the configuration baseline (SEC-16), and access reviews (SEC-02) | `GateResult`; Config compliance; access-review exports | Achieved |
| B2.a | Identity Verification, Authentication and Authorisation | technical | Operators: Identity Center with FIDO2 (SEC-02). Users: passwordless OIDC or magic link (IDE-02), roles as facts (IDE-08), per-request authorisation (IDE-09); consumer-realm identity is email possession only (ADR-026) with abuse controls (SEC-14); external systems authenticate by scoped client credentials (SEC-15) | `authn.*` and `authz_denied.*` events (SEC-03); Identity Center configuration | Partially achieved: consumer-realm identity verification is email possession only by design, and tenant authorisation lags replication (IDE-09, Tension 3); Achieved for operators and strict organisations |
| B2.b | Device Management | mixed | Operator devices are organisation-managed and required by Identity Center conditions; learner and instructor devices are service clients outside B2.b and are treated under B3.d (SEC-09) | Identity Center device conditions; organisation device policy | Achieved (operator plane; organisation supplies device policy) |
| B2.c | Privileged User Management | technical | Break-glass with second-person approval, 4 h expiry and tenant notification (ADM-07); privileged sets ≤ 1 h, sealed root, every privileged action logged (SEC-02, SEC-03) | Break-glass grants and audit facts; `privileged.*` events; root-sign-in alarms | Achieved |
| B2.d | Identity and Access Management (IdAM) | mixed | Joiner and leaver through Identity Center (SEC-02); tenant lifecycles under IDE-22 and SCIM; quarterly access review; least privilege per function (ADM-18) | Access-review exports; IAM policy test results | Achieved |
| B3.a | Understanding Data | technical | Five data classes, a PII class per fact type, `data_class` tags and residency zones (SEC-08, ADM-02) | `fact-types.md`; tags; lint results | Achieved |
| B3.b | Data in Transit | technical | TLS 1.2 minimum with 1.3 offered, HSTS preload, CAA, AWS-managed replication encryption (SEC-08) | TLS policy snapshots; HSTS headers; ACM configuration | Achieved |
| B3.c | Stored Data | technical | Per-subject and tenant keys under a zone MRK (FLS-16, ADR-022), SSE-KMS second layer, encrypted logs and queues, ciphertext-only backups (ADM-10), locked logs (SEC-03); tenant separation in pooled tables (SEC-12) | KMS key policies; Config encryption rules; PITR settings | Achieved |
| B3.d | Mobile Data | mixed | Instructor and admin replicas encrypted under a non-extractable session-bound key, purged on idle and sign-out, never holding exports (SEC-09); learner replicas are a stated accepted risk (ADR-006) | Client test results for encryption and purge; `sec.policy.v1`; privacy notice | Partially achieved: learner replicas sit on devices outside organisational control by design; instructor and admin replicas meet the indicators. Re-rate to Achieved if the assessing body accepts the learner scope exclusion |
| B3.e | Media Equipment Sanitisation | mixed | Storage media are AWS's responsibility; no Trellis-managed media; tenant data is never downloadable to an operator device (SEC-08) | AWS compliance reports via Artifact; organisation device policy | Achieved (inherited control) |
| B4.a | Secure by Design | technical | Pipeline gates and threat models (SEC-01); immutable facts (FLS-01), derived state (ADR-004), least privilege (ADM-18), no VPC or internal network (SEC-15), layered tenant isolation with a continuous probe (SEC-12) | `GateResult` per release; threat models | Achieved |
| B4.b | Secure Configuration | technical | `trellis-baseline` conformance pack, drift detection and auto-remediation (SEC-16); secrets handling (SEC-13) | Config compliance snapshots | Achieved |
| B4.c | Secure Management | technical | Every change through the signed pipeline (SEC-01); human writes denied except `operator.sre` under a ticket (SEC-16, SEC-02); break-glass for data (ADM-07) | CloudTrail; SCPs; drift alerts | Achieved |
| B4.d | Vulnerability Management | technical | Severity SLAs, SBOM rescans, Inspector, automated rebuilds, expiring exceptions (SEC-05) | `Finding` items; monthly SLA report; `exceptions.yaml` | Achieved |
| B5.a | Resilience Preparation | mixed | Quarterly game days with measured RPO and RTO (ADM-20), restore by re-union (ADM-10), on-demand capacity (ADM-15), security exercises (SEC-06) | Game-day audit facts | Achieved |
| B5.b | Design for Resilience | technical | Multi-region active-active zones (ADR-013), any-region sync (FLS-18), automatic failover (ADM-03), queued acceptance under throttling (FLS-13); the SAML bridge's single-region limit is stated (IDE-02) | Architecture ADRs; failover measurements | Achieved |
| B5.c | Backups | technical | PITR and monthly export with restore by re-union, drilled quarterly (ADM-10); Object Lock for logs and trail (SEC-03); registry PITR | Restore drill results; Config PITR rule | Achieved |
| B6.a | Cyber Security Culture | organisational | Runbooks, threat models and the disclosure policy (SEC-10) as material; nothing technical substitutes for culture | Organisation-supplied slot | Achieved by the organisation |
| B6.b | Cyber Security Training | organisational | Roles with access to security tooling are named (SEC-02); training material is in-tree | Training records (organisation-supplied slot) | Achieved by the organisation |
| C1.a | Monitoring Coverage | technical | GuardDuty, Security Hub, Config and the organisation trail in every region and the operator plane (SEC-04); application security events (SEC-03) | Coverage snapshot per region in the pack | Achieved |
| C1.b | Securing Logs | technical | Object Lock compliance mode, manifest hash chain, KMS, restricted readers, SCPs against disabling (SEC-03) | Chain-verification results; bucket and SCP configuration | Achieved |
| C1.c | Generating Alerts | technical | Triage with severities, deduplication, expiring suppressions and paging (SEC-04) | Alert statistics; suppression register | Achieved |
| C1.d | Identifying Security Incidents | mixed | Triage runbook declaration criteria (SEC-04) and incident severities (SEC-06); hunts feed alerts | Runbook; incident records | Achieved |
| C1.e | Monitoring Tools and Skills | mixed | Tools: Security Hub, Athena hunts, dashboards (ADM-08); skills are the organisation's | Tool inventory; skills records (organisation-supplied slot) | Achieved (organisation supplies skills evidence) |
| C2.a | System Abnormalities for Attack Detection | technical | Indicators over sync volume, over-broad pulls, mass export and cross-tenant attempts against tenant baselines (SEC-04); zero-tolerance isolation alerts (SEC-12) and abuse velocity signals (SEC-14); staleness telemetry (MVA-14); client-mark mismatch metric (DRV-14) | Hunt baselines and results | Achieved |
| C2.b | Proactive Attack Discovery | technical | Versioned hunting queries run weekly and on demand (SEC-04); annual pentest (SEC-10) | Hunt run records | Achieved |
| D1.a | Response Plan | mixed | Plan with roles, playbooks, communications and UK GDPR notification (SEC-06) | `security/incident-response.md` | Achieved |
| D1.b | Response and Recovery Capability | mixed | Pre-authorised playbooks (SEC-06), restore (ADM-10), failover (ADM-03), kill switches (ADM-05) | Game-day and exercise measurements | Achieved |
| D1.c | Testing and Exercising | mixed | At least one security game day a year inside the ADM-20 quarterly cycle (SEC-06) | `audit.v1 {action: game_day}` facts; exercise reports | Achieved |
| D2.a | Incident Root Cause Analysis | organisational | Immutable log and provenance (SEC-03, DRV-15); review template within 10 working days (SEC-06) | Post-incident reviews (organisation-supplied slot) | Achieved by the organisation |
| D2.b | Using Incidents to Drive Improvements | organisational | Actions become change proposals under `openspec/changes/` citing the incident (SEC-06) | Change proposals with incident ids (organisation-supplied slot) | Achieved by the organisation |

Cyber Essentials Plus is a subset of objective B (B2, B3.b, B4.b–d) and is
obtained annually under SEC-10; it does not assess the operated service and
does not substitute for any row above.
