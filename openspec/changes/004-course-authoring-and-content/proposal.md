# Change: 004 Course authoring and content

## Why

Learners need content to learn from and items to practise on before any
derivation matters. This change delivers course structure as an operation
log with LWW-per-property folding and visible history, content-addressed
blobs with replication and failover delivery, the QTI 3.0 item bank with
key and rubric versioning, publish-time marking classification and key
visibility policies, policy and deadline facts, two-phase publishing with
conflict surfacing, offline bundles, prebuilt search indexes, accessibility
checks, templates and copy, and the catalogue.

## What Changes

- `struct-updater` (Rust) consuming the FIFO `struct` queue; snapshot,
  skeleton index, node and history items; DeliveryView per cohort; the
  deadline index used by FLS-06; `version.changed`, `publish.current`,
  `publish.conflict` events.
- Authoring API and editor UI; catalogue and item bank UIs.
- `publish-prepare` (Rust) building snapshots, key documents, marking
  classification, time-lock encryption, bundles, search index and
  accessibility report; `key-release` and `delivery-api`; content access
  sessions (CloudFront signed cookies).
- Course copy and template workflow (paced).

## Impact

- Adds `catalogue.v1` to the fact registry; defines bodies for the CAC
  types.
- Adds the FIFO `struct` queue to the router (FLS-17 amended).
- Provides the blobs and versions 005 and 006 consume.

## Requirements delivered

- CAC-01
- CAC-02
- CAC-03
- CAC-04
- CAC-05
- CAC-06
- CAC-07
- CAC-08
- CAC-09
- CAC-10
- CAC-11
- CAC-12
- CAC-13
- CAC-14
- CAC-15
- CAC-16
- CAC-17
- CAC-18
- CAC-19
- CAC-20
- CAC-21

## Dependencies

002 (sync and blobs), 003 (editor roles). Marking classification (CAC-08)
uses the engine profile from 005; until 005 ships, classification runs
against the static profile document.

## Out of scope

Common Cartridge import/export (010); LTI deep-linking flows (009); CASE
framework import (011).
