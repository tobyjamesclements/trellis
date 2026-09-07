# Trellis OpenSpec tree

Start with `project.md`. It holds the product context, the principles in
priority order, the non-negotiable constraints, the canonical definitions of
the consistency model, the load profile and unit prices every cost model
uses, and the glossary.

Then read the specs in this order; each builds on the previous:

1. `specs/fact-log-and-sync/` — the system of record and the sync protocol
   (plus `fact-types.md`, the registry of every fact type).
2. `specs/derivation-engine/` — marks, grades, completion as pure functions
   (plus `qti-profile.md`).
3. `specs/materialised-views-and-analytics/` — region-owned views, version
   vectors, staleness, non-monotone predicates, stability windows.
4. `specs/identity-and-enrolment/`, `specs/course-authoring-and-content/`,
   `specs/activities-and-assessment/`, `specs/communication-and-forums/`.
5. `specs/lti-interop/`, `specs/data-interop/` (plus `caliper-mapping.md`),
   `specs/credentialing-and-competencies/`.
6. `specs/administration-and-tenancy/`.

Cross-cutting documents:

- `adr/` — the load-bearing decisions, ADR-001 to ADR-022.
- `known-tensions.md` — where the model breaks, with options and a
  recommendation for each.
- `tradeoffs.md` — the consolidated register of what was given up, the
  symptom, and the mitigation or apology path.
- `standards-conformance.md` — the 1EdTech conformance matrix.
- `cost-summary.md` — the roll-up of every capability's cost model.

The initial build is decomposed into sequenced changes under `changes/`,
each with `proposal.md`, `design.md`, `tasks.md`, and generated delta specs
under `specs/`.

## Validating

```
npm install -g @fission-ai/openspec
openspec validate --all --strict
python3 openspec/tools/gen-deltas.py --check   # every requirement delivered exactly once
python3 openspec/tools/gen-deltas.py           # regenerate change deltas after editing specs
```

Delta specs under `changes/*/specs/` are generated from the canonical specs
and must not be edited by hand (see `project.md` §7).
