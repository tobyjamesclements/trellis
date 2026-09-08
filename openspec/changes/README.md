# Change sequence

The initial build is decomposed into fifteen sequenced changes. Numbers are
the execution order; the dependency graph below is the authority when a
change is inserted later (add it at the end and reference it here rather
than renumbering).

| # | Change | Delivers (prefixes) | Depends on |
|---|---|---|---|
| 001 | platform-foundation | ADM (substrate), SEC (substrate) | — |
| 002 | fact-log-and-sync | FLS | 001 |
| 003 | identity-and-enrolment | IDE (incl. identity modes, strict lifecycle) | 001, 002 |
| 004 | client-platform-and-accessibility | UIX | 001, 002, 003 |
| 005 | course-authoring-and-content | CAC | 002, 003, 004 |
| 006 | derivation-engine | DRV | 001, 004, 005 |
| 007 | activities-and-assessment | ACT | 002, 003, 004, 005, 006 |
| 008 | materialised-views-and-analytics | MVA, FLS-14 | 002, 003, 005, 006 |
| 009 | communication-and-forums | COM | 002, 003, 004, 005, 008 |
| 010 | lti-interop | LTI | 003, 005, 007, 008, 009 |
| 011 | data-interop | DIO (incl. SCIM) | 003, 005, 007, 008, 009, 010 |
| 012 | credentialing-and-competencies | CRD | 003, 005, 008, 009 |
| 013 | consumer-realm-and-identity-modes | IDE (realm, soft orgs, guests, portability), ADM-22/23 | 002, 003, 004, 009, 012 |
| 014 | security-and-assurance | SEC (detection, IR, assurance) | 001, 004, 013, interop changes |
| 015 | administration-and-compliance | ADM (failover, DR, erasure, retention, cost) | all previous |

Parallelism that the graph allows: 004 with 005 and 006; 010, 011 and 012
with each other; 013 with 010–012.

Each change directory holds `proposal.md`, `design.md`, `tasks.md` and
generated delta specs under `specs/` (see `openspec/tools/gen-deltas.py`).
