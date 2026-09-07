## Context

DRV spec and `qti-profile.md`; ADR-001, ADR-005, ADR-006. One
implementation, two targets, byte-identical outputs.

## Goals / Non-Goals

Goals: deterministic outputs across targets; the operator subset; ≤ 2 MB
compressed WASM; ≤ 50 ms native per (subject, module) with 1,000 facts;
provenance for every output.

Non-goals: adaptive items, PCI, model-based marking, `customOperator`.

## Decisions

- **Numeric model.** `rust_decimal` (128-bit) for all scores; rationals
  where QTI defines float outcomes with rounding declared by the item;
  rounding only at presentation via a tenant policy passed as input.
- **Item model.** QTI 3.0 XML parsed at publish time (CAC) into a compact
  canonical binary model stored as a blob; the engine loads the model, not
  XML, on device and server. The model's hash is part of `key_version`.
- **Interpreter.** Tree-walking evaluator over the operator subset; each
  operator has a pure implementation and a golden test. Unsupported
  operators fail closed at publish-time classification (CAC-08); at
  runtime an unexpected operator yields `Unmarkable` rather than a score.
- **Seeds.** `seed = SHA-256(subject ‖ item ‖ attempt_n ‖ key_version)`;
  ChaCha20-based RNG; shuffles and template values derive from it.
- **Fact folding contract.** The engine exposes `derive(subject_scope_facts,
  versions, policy) → outputs` and an incremental `fold(state, fact) →
  state` for monotone aggregates; MVA uses `fold` for ordinary facts and
  `derive` for local recompute after voids and for generations.
- **Provenance.** Every output carries `fact_ids_used` (capped at 500 with
  a digest beyond that), versions and the policy branch taken.
- **Human marks.** Marker policies `latest | mean | designated`; rubric
  version mismatch flags rather than rescores.
- **Golden vectors.** ≥ 500 items across all interactions, plus lateness,
  penalties, attempt policies, overrides, aggregation and epochs; stored as
  fixtures with expected outputs; CI runs native and WASM (via a headless
  runner) and diffs.

## Risks / Trade-offs

- WASM size with XML parsing removed and decimal arithmetic included is
  estimated at 1.2–1.6 MB compressed; the 2 MB gate has margin.
- QTI 3.0 test-level `outcomeProcessing` with `testVariables` needs all
  item outcomes of a test; the engine takes the attempt's facts for the
  whole test as input.

## Migration Plan

Greenfield. Engine versions are semver; a minor version change triggers
partition recompute (007) only when the tenant policy `recompute_on_engine
= minor|major` says so (default `major`).

## Open Questions

- Whether to expose `derive` as a public API for third-party verification
  of marks (candidate later change).
