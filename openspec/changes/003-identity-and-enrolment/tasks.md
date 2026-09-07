## 1. Authentication
- [ ] 1.1 OIDC RP: discovery cache, PKCE, state with region, callback redirect, claim → principal
- [ ] 1.2 Magic link: request (SES direct), verify, single-use, region routing
- [ ] 1.3 Token issue/refresh/revoke; JWKS endpoint; `kid` rotation runbook
- [ ] 1.4 Cognito SAML bridge provisioning step and OIDC wiring
- [ ] 1.5 Guest sessions

## 2. Authorisation
- [ ] 2.1 `authz` library: role and membership resolution, 60 s cache, capability checks
- [ ] 2.2 Wire `authz` into `sync-api` (FLS-10/11) and all APIs

## 3. Indexes
- [ ] 3.1 Identity indexer (IDX, email index, duplicate detection → merge)
- [ ] 3.2 Profile fold (per-field LWW)
- [ ] 3.3 Enrolment indexer (E, M, COUNT, RL, CAP, `cap.exceeded`)
- [ ] 3.4 Revocation cache
- [ ] 3.5 Directory index
- [ ] 3.6 Index rebuild workflow (Distributed Map)

## 4. Enrolment and roles
- [ ] 4.1 Enrolment API (manual, self with key, windows advisory) and unenrol
- [ ] 4.2 Role grant/revoke API and built-in role definitions
- [ ] 4.3 Cohort API (create, cap, policy, split, merge) and sub-cohort placement
- [ ] 4.4 Tenant cohorts and `cohort-sync` job
- [ ] 4.5 Observer links

## 5. Reconciliation
- [ ] 5.1 `cap-reconcile` Step Functions workflow with task-token wait and apology notifications
- [ ] 5.2 Instructor decision UI (raise / confirm) and learner waitlist view

## 6. Account management
- [ ] 6.1 Device and session list; sign-out everywhere / device
- [ ] 6.2 Consent prompt and `consent.v1`
- [ ] 6.3 Merge notice and reversal (admin)

## 7. Tests
- [ ] 7.1 Concurrent first-login tests (federated and magic link)
- [ ] 7.2 Cap reconciliation scenarios from IDE-06 including protection rule and timeout
- [ ] 7.3 Region outage: OIDC and magic link succeed in the surviving region; SAML fails with status link
