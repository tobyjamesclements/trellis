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

## 2. Targets
- [ ] 2.1 `wasm32` build with size gate (2 MB compressed) and JS bindings
- [ ] 2.2 Native library and `derive-explain` Lambda
- [ ] 2.3 `fold`/`derive` API used by MVA; benchmarks (50 ms native, 200 ms WASM)

## 3. Conformance
- [ ] 3.1 Golden-vector fixtures (≥ 500 items) and expected outputs
- [ ] 3.2 CI runner diffing native vs WASM; release gate
- [ ] 3.3 `engine-conformance` Lambda for deployed-build verification
- [ ] 3.4 Client-mark mismatch metric emission contract (DRV-14)
