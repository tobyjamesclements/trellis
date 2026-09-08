## 1. Realm
- [ ] 1.1 Provision the realm tenant per zone; realm host routing; open-course catalogue; personal groups
- [ ] 1.2 Sign-up flows (magic link, social OIDC, institutional OIDC) and personal dashboard
- [ ] 1.3 Realm OpenID Provider (authorize, token, userinfo, jwks), pairwise subjects, consent, code single-use with region routing

## 2. Organisations
- [ ] 2.1 Self-service soft organisation creation (registry item, wildcard slug, abuse limits, verified email)
- [ ] 2.2 Invitations, join links and codes; membership facts; leave flow
- [ ] 2.3 Organisation admin console for membership and roles (no identity powers); recovery-email trigger
- [ ] 2.4 External guests for strict tenants (policy, roles, directory flag, export exclusion)

## 3. Portability
- [ ] 3.1 Credential transfer to the realm backpack (CRD-16) including strict-organisation portability tokens
- [ ] 3.2 Subject-scoped learning-data export delivered to the realm (FLS-20)
- [ ] 3.3 Policy handling (`credentials_always, data_on_request`) and user-facing explanations

## 4. Hosting and registry
- [ ] 4.1 Wildcard certificate and host routing for `learn.` and `*.orgs.`; custom hostnames remain strict-only
- [ ] 4.2 Registry `identity_mode` and `tier`; aggregate observability for soft tenants

## 5. Verification
- [ ] 5.1 Concurrent organisation creation in two regions converges on distinct slugs
- [ ] 5.2 Join, leave and transfer end to end; guest policy tests; abuse-limit tests
