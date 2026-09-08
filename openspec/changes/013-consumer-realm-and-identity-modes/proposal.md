# Change: 013 Consumer realm and identity modes

## Why

Trellis must serve consumers as well as businesses, and businesses must be
able to form either from consumers' own identities (soft) or by creating
every user themselves (strict). Change 003 established identity modes and
the strict lifecycle; this change delivers the consumer realm as a tenant
and OpenID Provider, self-service soft organisations on wildcard hosting,
joining and leaving, external guests, and the portability of credentials
and learning data when a person leaves.

## What Changes

- Consumer realm tenant per zone: sign-up (magic link, social and
  institutional OIDC), personal profile and dashboard, personal groups,
  open-course enrolment, creator publishing.
- Realm OpenID Provider with pairwise subjects and consent; organisation
  federation.
- Soft organisation lifecycle: self-service creation with abuse controls,
  invitations and join links, leave flow, role management over members;
  external guests for strict organisations.
- Portability: credential transfer to the realm backpack (CRD-16) and
  subject-scoped learning-data export delivered to the realm.
- Wildcard hosting and slug minting; tenant tiers in the registry.

## Impact

- Adds realm-specific derived items (organisation links, invitations, OIDC
  codes) and the `realm-oidc-provider` and `org-membership` functions.
- Registry gains `identity_mode` and `tier`.

## Requirements delivered

- IDE-20
- IDE-21
- IDE-23
- IDE-24
- ADM-22
- ADM-23

## Dependencies

003 (identity modes, sessions), 004 (realm and organisation UIs), 009
(notifications for invitations and portability offers), 012 (credential
transfer CRD-16), 002 (subject-scoped export FLS-20).

## Out of scope

Billing and quotas for organisations; cross-zone identity.
