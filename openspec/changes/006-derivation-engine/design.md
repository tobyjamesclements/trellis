## Context

DRV spec and `qti-profile.md`; ADR-001, ADR-005, ADR-006. One TypeScript
implementation, two hosts, byte-identical outputs.

## Goals / Non-Goals

Goals: deterministic outputs across V8, SpiderMonkey, JavaScriptCore and
GraalJS; the operator subset; ≤ 300 KB compressed bundle; ≤ 200 ms on a
2019-class mobile device and ≤ 2 s interpreted on the server per
(subject, module) with 1,000 facts; provenance for every output.

Non-goals: adaptive items, PCI, model-based marking, `customOperator`.

## Decisions

- **Numeric model.** A pure-TypeScript decimal library (128-bit
  significand) for all scores; rationals where QTI defines float outcomes
  with rounding declared by the item; rounding only at presentation via a
  tenant policy passed as input. IEEE-754 doubles never carry a score.
- **Item model.** QTI 3.0 XML parsed at publish time (CAC) into a compact
  canonical JSON model stored as a blob; the engine loads the model, not
  XML, on both hosts. The model's hash is part of `key_version`.
- **Interpreter.** Tree-walking evaluator over the operator subset; each
  operator has a pure implementation and a golden test. Unsupported
  operators fail closed at publish-time classification (CAC-08); at
  runtime an unexpected operator yields `Unmarkable` rather than a score.
- **Seeds.** `seed = SHA-256(subject ‖ item ‖ attempt_n ‖ key_version)`;
  ChaCha20-based RNG implemented in the engine; shuffles and template values
  derive from it.
- **Deterministic subset.** ESLint rules ban `Math` transcendental and
  rounding functions, `Intl`, `Date`, `Array.prototype.sort` without a
  comparator, `Map`/`Set` iteration over non-string keys, and locale-
  sensitive string methods; CI fails on any use.
- **Hosts.** Client: a Web Worker with a message protocol (`derive`,
  `fold`, `explain`). Server: a Java library that creates one GraalJS
  polyglot context at initialisation, loads the engine bundle, exposes the
  same protocol to Java callers, and is snapshotted by SnapStart; a build
  flag enables the Graal compiler through JVMCI for engine-hosting
  functions.
- **Fact folding contract.** `derive(subject_scope_facts, versions, policy)
  → outputs` and an incremental `fold(state, fact) → state` for monotone
  aggregates; MVA uses `fold` for ordinary facts and `derive` for local
  recompute after voids and for generations.
- **Provenance.** Every output carries `fact_ids_used` (capped at 500 with
  a digest beyond that), versions and the policy branch taken.
- **Golden vectors.** ≥ 500 items across all interactions, plus lateness,
  penalties, attempt policies, overrides, aggregation and epochs; CI runs
  them under Playwright on Chromium, Firefox and WebKit and under GraalJS
  on the JVM, and diffs the four outputs.

## Risks / Trade-offs

- GraalJS interpreter speed: fold work is small per fact; recomputes
  parallelise; the JVMCI compiler is the first lever and the TeaVM
  fallback (ADR-001) the last.
- Bundle size with the decimal library and the interpreter is estimated at
  180–250 KB compressed; the 300 KB gate has margin.
- QTI 3.0 test-level `outcomeProcessing` with `testVariables` needs all
  item outcomes of a test; the engine takes the attempt's facts for the
  whole test as input.

## Migration Plan

Greenfield. Engine versions are semver; a minor version change triggers
partition recompute (008) only when the tenant policy `recompute_on_engine
= minor|major` says so (default `major`).

## Open Questions

- Whether to expose `derive` as a public API for third-party verification
  of marks (candidate later change).
