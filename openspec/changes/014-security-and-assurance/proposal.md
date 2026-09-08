# Change: 014 Security and assurance

## Why

The product must meet the NCSC Cyber Assessment Framework. Change 001 laid
the security substrate (pipeline gates, operator identity, the unsampled
immutable security log, data classification). This change completes the
technical contributing outcomes: monitoring and proactive discovery,
vulnerability management, incident response and exercising, supply-chain
controls including the Automerge native artefacts, device data protection
policy, independent penetration testing, and the generated CAF evidence
pack, and it re-baselines the mapping against the latest published CAF
version before the first assessment.

## What Changes

- Detection: CloudTrail organisation trail, GuardDuty, Security Hub,
  Config rules, Inspector for Lambda, alert triage runbook, abuse-detection
  job for the consumer realm, threat-hunting queries.
- Vulnerability management with severity SLAs and automated rebuilds.
- Incident response plan, communications templates, exercising with the
  ADM-20 game days, lessons-learned records.
- Supply chain: pinned and checksum-verified dependencies, SBOM publication,
  Automerge JNI and WASM artefact verification.
- Device data protection policy applied through the client (UIX-09).
- Annual penetration test scope and remediation tracking.
- CAF evidence pack generator and the customer-facing Cloud Security
  Principles statement.
- Multi-tenancy isolation probe and threat controls (SEC-12), consumer-
  realm abuse controls including email abuse (SEC-14), and interop-surface
  hardening (SEC-15).

## Impact

- Adds security tooling cost to the zone floor (≈ $30–60 per month).
- Adds SEC-owned derived items (alert state, rate limits, evidence
  manifests) and Java functions for shipping, triage and evidence.

## Requirements delivered

- SEC-04
- SEC-05
- SEC-06
- SEC-07
- SEC-09
- SEC-10
- SEC-11
- SEC-12
- SEC-14
- SEC-15

## Dependencies

001 (substrate), 004 (replica protection mechanism), 013 (consumer-realm
abuse surface), all interop changes (endpoint scope for testing). Precedes
015 so that failover and DR runbooks are exercised under the incident
response plan.

## Out of scope

Organisational governance, staff training and board reporting, which the
operating organisation owns; the mapping states what the system supplies
toward them.
