# Change: 011 Credentialing and competencies

## Why

Formative progress needs a vocabulary (competency frameworks) and a
portable outcome (credentials). This change delivers CASE 1.0 framework
import and alignment, mastery as a non-monotone derivation with learner
plans and evidence, Open Badges 3.0 issuance with deterministic ids from
the home region behind a 24-hour window, the OB 3.0 API issuer side, CLR
2.0, revocation through derived status lists, the learner backpack, and the
duplicate-issuance and award-reversal reconciliation paths.

## What Changes

- Issuer profiles, `did:web` documents and JWKS from the key registry.
- CASE import workflow and framework indexes; alignment facts in the
  authoring UI; mastery NMRows and competency reports; learning plans;
  evidence blobs.
- Award rules and manual awards; issuance workflow (Step Functions Standard
  with the 24 h wait); VC-JWT signing with the zone asymmetric key; baked
  images and certificates; verification endpoint; status lists.
- OB 3.0 API (OAuth 2.0 authorization code with PKCE, dynamic client
  registration, consent); backpack; share links; CLR issuance.
- Reconciliation of duplicate issuances; review flags for reversed awards;
  expiry and re-issuance.

## Impact

- Adds the CRD-defined fact types to the registry (see spec §Domain model).
- Consumes `effect.ready` kind `credential` (007).
- Uses ADM-19 key registry and ADM-03 epoch.

## Requirements delivered

- CRD-01
- CRD-02
- CRD-03
- CRD-04
- CRD-05
- CRD-06
- CRD-07
- CRD-08
- CRD-09
- CRD-10
- CRD-11
- CRD-12
- CRD-13
- CRD-14
- CRD-15
- CRD-16
- CRD-17
- CRD-18
- CRD-19

## Dependencies

003, 004, 007, 008. Standards certification for OB 3.0 requires the
Issuer API, which depends on 003's OAuth pieces.

## Out of scope

Host and Displayer roles, OB 2.0, endorsements, CASE Provider.
