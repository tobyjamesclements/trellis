## 1. Engine core
- [ ] 1.1 Canonical item model and loader; `key_version` hashing agreed with CAC
- [ ] 1.2 Response processing interpreter for the operator subset; standard templates
- [ ] 1.3 Template processing with seeded RNG
- [ ] 1.4 Test model: parts, sections, selection/ordering, preconditions, branch rules, outcome processing
- [ ] 1.5 Decimal arithmetic and presentation rounding policy
- [ ] 1.6 Lateness and penalty derivation with extensions
- [ ] 1.7 Attempt policies incl. duplicate attempt_n ordering
- [ ] 1.8 Human marking resolution and rubric-version flags
- [ ] 1.9 Overrides, aggregation (categories, weights, drop-lowest, scales, letters), epochs
- [ ] 1.10 Completion and availability predicates
- [ ] 1.11 Feedback derivation
- [ ] 1.12 Provenance structures and explain rendering
- [ ] 1.13 Deterministic-subset lint rules

## 2. Hosts
- [ ] 2.1 Web Worker wrapper and message protocol; bundle size gate (300 KB compressed)
- [ ] 2.2 GraalJS embedding library for Java: snapshot-friendly context, JVMCI compiler flag, `derive-explain` Lambda
- [ ] 2.3 `fold`/`derive` API used by MVA; benchmarks (200 ms worker, 2 s interpreted, 300 ms JIT)

## 3. Conformance
- [ ] 3.1 Golden-vector fixtures (≥ 500 items) and expected outputs
- [ ] 3.2 CI matrix: Chromium, Firefox, WebKit (Playwright) and GraalJS; release gate on any diff
- [ ] 3.3 `engine-conformance` Lambda for deployed-build verification
- [ ] 3.4 Client-mark mismatch metric emission contract (DRV-14)
