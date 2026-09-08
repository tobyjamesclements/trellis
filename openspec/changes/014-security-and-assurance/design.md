## Context

SEC spec and `caf-mapping.md`; ADR-020, ADR-022, ADR-024. Technical
contributing outcomes at Achieved; evidence generated, not assembled by
hand.

## Goals / Non-Goals

Goals: every security-relevant event visible in one immutable log; alerts
with owners and runbooks; a rehearsed incident plan; a penetration test
with tracked remediation; an evidence pack an assessor can read.

Non-goals: replacing the operating organisation's governance; a SOC
tooling stack beyond AWS-native services.

## Decisions

- **Detection stack.** CloudTrail organisation trail to the immutable
  bucket; GuardDuty in every region; Security Hub aggregating findings
  with CIS and AWS Foundational standards; Config rules for drift on the
  IaC-managed resources; Inspector for Lambda functions and layers.
- **Security log.** Application security events (SEC-03) and AWS service
  logs land in S3 with Object Lock (compliance mode, 12 months) through
  CloudWatch subscription filters; queries with Athena; integrity by
  Object Lock and CloudTrail digest files.
- **Alerting and triage.** EventBridge rules → SQS → `security-triage`
  function creating tracked alert items with severity, owner and runbook
  link; paging through the operating organisation's on-call tool.
- **Abuse detection.** Scheduled job over sync volumes, sign-up rates,
  export requests and cross-tenant authorisation denials; findings become
  alerts and, for the consumer realm, rate-limit facts.
- **Vulnerability management.** Dependabot-style updates with automated
  rebuild and canary; SLAs: critical 7 days, high 30 days, medium 90 days;
  exceptions recorded as audit facts with expiry.
- **Incident response.** Plan with roles, severity matrix, communications
  templates (customers, regulators where applicable), evidence
  preservation (Object Lock), and post-incident review producing lessons-
  learned records; exercised at least annually, combined with ADM-20 game
  days.
- **Supply chain.** Lockfiles pinned; artefacts verified by checksum at
  build; Automerge native library and WASM built from a pinned tag and
  verified; SBOM (CycloneDX) generated per release and available to
  customers.
- **Penetration testing.** Annual external test scoped to multi-tenancy
  isolation, interop endpoints, the consumer realm and the client;
  findings tracked to closure with retest.
- **Evidence pack.** A generator reads configuration (IaC state), Security
  Hub scores, test results, policies and audit facts and renders the
  per-outcome pack with rating claims; stored in the tenant's zone.
- **CAF re-baseline.** A task to map the current published CAF version's
  contributing outcomes onto `caf-mapping.md` before the first assessment.

## Risks / Trade-offs

- AWS-native detection tooling adds $30–60 per zone per month.
- Object Lock in compliance mode cannot be shortened; retention is a
  deliberate legal position (12 months) and the erasure residual in logs is
  documented.

## Migration Plan

Greenfield. Verification: tabletop exercise; alert path test from a
synthetic GuardDuty finding; evidence pack generated for the test tenant
and reviewed against the mapping.

## Open Questions

- Whether to run a public bug bounty (recommended after the first
  penetration test).
