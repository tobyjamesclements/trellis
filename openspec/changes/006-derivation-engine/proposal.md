# Change: 006 Derivation engine

## Why

Marks, grades, completion, availability and feedback are functions, and the
same function must run on the learner's device and on the server. This
change delivers the TypeScript engine, its Web Worker and GraalJS hosts, the
QTI 3.0 response and outcome processing subset, versioned key/rubric/policy
handling, lateness and penalty derivation, human marking resolution,
overrides, aggregation, epochs, provenance, and the golden-vector release
gate across four JavaScript engines.

## What Changes

- `@trellis/engine` package: item model loader (canonical model produced at
  publish), response processing interpreter for the profile subset,
  template processing, test-level outcome processing, decimal arithmetic,
  seeded randomness, lateness and penalties, attempt policies, marker
  policies, overrides, aggregation, completion and availability predicates,
  provenance; lint rules enforcing the deterministic ECMAScript subset.
- Hosts: Web Worker wrapper for the client (change 004); GraalJS embedding
  library for Java functions with a snapshot-friendly polyglot context and
  optional JVMCI compiler; `derive-explain` Lambda.
- Golden-vector suite and conformance runner in CI (Chromium, Firefox,
  WebKit, GraalJS) and against deployed builds.

## Impact

- Consumed by 007 (device marking) and 008 (folds and recomputes).
- Defines `engine_version` semantics and the `version.changed` event.

## Requirements delivered

- DRV-01
- DRV-02
- DRV-03
- DRV-04
- DRV-05
- DRV-06
- DRV-07
- DRV-08
- DRV-09
- DRV-10
- DRV-11
- DRV-12
- DRV-13
- DRV-14
- DRV-15
- DRV-16
- DRV-17

## Dependencies

001 (toolchains, GraalJS embedding harness), 004 (worker host), 005 (item,
key, rubric and policy blob formats). Can be developed in parallel with 003
against fixture blobs.

## Out of scope

The fold loop and generations (008), the device runtime (007).
