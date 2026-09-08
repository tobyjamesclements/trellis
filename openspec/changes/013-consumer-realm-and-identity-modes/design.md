## Context

IDE-19 to IDE-24, ADM-22, ADM-23, CRD-16; ADR-015, ADR-021, ADR-026. The
realm is a tenant that is also an OpenID Provider; soft organisations hold
aliases; strict organisations own identities.

## Goals / Non-Goals

Goals: a consumer can sign up, learn, create or join an organisation, and
leave with their credentials in minutes, in any region; organisations get
exactly the powers their mode grants; nothing in the realm needs global
coordination.

Non-goals: a marketplace or payments; federation between zones.

## Decisions

- **Realm as tenant.** Provisioned by the operator workflow once per zone
  with `identity_mode = consumer`; it uses the same facts, views and
  services as any tenant; its courses are open courses; personal groups are
  cohorts.
- **OP.** Authorization code with PKCE; codes single-use per region with
  issuing-region routing (IDE Tension 5); `id_token` claims: pairwise `sub`,
  `name`, optional `email`; consent recorded as a `consent.v1` fact with the
  organisation as purpose. Organisations are registered as OP clients
  automatically at creation (client id deterministic from the tenant id).
- **Organisation creation.** From the realm: registry item under the
  wildcard host, tier `soft`, zone and home region inherited, creator as
  admin, default policies; limits per consumer and per day; verified email
  required; slugs deterministic with a short hash.
- **Join and leave.** Join links and codes are derived invitation items
  with uses and expiry (region-local CAS on uses; over-use is reconciled,
  never a race the learner loses); joining appends `identity.v1`,
  `enrol.v1`, `role.v1` in the organisation; leaving appends `unenrol.v1`
  and `role.v1 {revoke}` and offers portability.
- **Guests.** Strict tenants with `external_guests = allow(roles)` reuse
  the join flow with role restrictions and a directory flag.
- **Portability.** Credential transfer copies signed blobs into the realm
  prefix and writes backpack facts; data export runs FLS-20 scoped to the
  subject and delivers a manifest to the realm; strict organisations
  without a realm link issue a signed single-use token by email.
- **Realm dashboard.** Aggregates only what the person transferred or
  exported; organisation links list where they are a member.

## Risks / Trade-offs

- Self-service tenants multiply registry items and stream fan-out targets;
  soft organisations are observed in aggregate to keep costs flat.
- Pairwise subjects prevent cross-organisation aggregation by design.
- Abuse of self-service sign-up needs the SEC-04 abuse detection job from
  the start.

## Migration Plan

Greenfield. Tests: sign-up and organisation creation in two regions
concurrently (slug convergence); join through a link across regions;
leave with credential transfer; strict guest policy deny/allow.

## Open Questions

- Whether consumers may hold more than one realm identity (default: one
  per verified email, merges otherwise).
