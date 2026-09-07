# Change: 005 Derivation engine

## Why

Marks, grades, completion, availability and feedback are functions, and the
same function must run on the learner's device and on the server. This
change delivers the Rust engine, its WASM and native builds, the QTI 3.0
response and outcome processing subset, versioned key/rubric/policy
handling, lateness and penalty derivation, human marking resolution,
overrides, aggregation, epochs, provenance, and the golden-vector release
gate.

## What Changes

- `engine` crate: item model loader (QTI 3.0 XML → internal model),
  response processing interpreter for the profile subset, template
  processing, test-level outcome processing, decimal arithmetic, seeded
  randomness, lateness and penalties, attempt policies, marker policies,
  overrides, aggregation, completion and availability predicates,
  provenance.
- Builds: `wasm32` package for the PWA; native library linked by MVA
  functions; `derive-explain` Lambda.
- Golden-vector suite and conformance runner in CI and against deployed
  builds.

## Impact

- Consumed by 006 (device marking) and 007 (folds and recomputes).
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

001 (Rust toolchain), 004 (item, key, rubric and policy blob formats).
Can be developed in parallel with 003 and 004 against fixture blobs.

## Out of scope

The fold loop and generations (007), the device runtime (006).
