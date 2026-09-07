## Context

ACT spec; ADR-006, ADR-008, ADR-009. The device is a replica; the server
never rejects; limits are advisory; caps reconcile.

## Goals / Non-Goals

Goals: a learner can complete a module fully offline and see marks and
feedback immediately (except time-locked and server-only items); facts are
never lost once saved on the device; every derived value the learner sees
is labelled with its source and freshness.

Non-goals: proctoring, lockdown, certainty-based marking, SCORM/H5P native
runtimes.

## Decisions

- **Local store.** IndexedDB object stores: `facts` (by stream and seq),
  `vectors`, `bundles` (by hash), `keys` (released), `drafts`, `derived`
  (local view cache). Facts and counters share one transaction on write.
  `navigator.storage.persist()` requested at first use; eviction policy
  removes bundles then released keys, never facts or drafts.
- **Marking on device.** The WASM engine instantiates once per session;
  `resp.v1` bodies carry `client_mark` from it; feedback rendering follows
  CAC-09; `time_locked` items call `GET /keys/release/{item}/{cohort}` after
  reveal; `server_only` items show "marked after sync".
- **Attempts.** `attempt.start.v1` claims `attempt_n = local max + 1`;
  duplicates across devices are accepted and displayed per ACT-14. Attempt
  and time limits are client-enforced; `attempt.submit.v1` carries
  `elapsed_ms` and the server flags `over_time`/`over_limit` in the row.
- **Assignments.** Files via presigned uploads (FLS-12); submissions
  reference blob hashes; group submissions use subject kind `G` with the
  group's membership at submission time recorded in the fact body so
  attribution is stable.
- **Marking workflow.** States derived from facts by the engine; release by
  `policy.v1` grade visibility or per-learner `feedback.v1 {release}`;
  allocation facts for markers; anonymous marking as a view flag that hides
  identity in the marking UI (presentational, ACT Known Tension).
- **Slot reconciliation.** Same workflow shape as IDE-06 with `slot.v1`
  outcomes; protection rule: a learner who has acted on the choice (viewed
  the slot's resource, attended, submitted) is never bumped.
- **Peer allocation.** Region system device computes allocation from the
  union at a vector with a seeded deterministic algorithm; duplicates across
  regions are both kept; deficits filled in the next pass; reviewers pull
  submissions by allocation authority.
- **Calendar.** Derived per learner from deadline/extension/choice/
  allocation/release facts; ICS served by a signed per-learner URL with
  ETag from the vector digest.
- **Reminders.** Deadline-approaching-and-not-submitted is non-monotone
  (a submission cancels it): intents via MVA-08 with a 5-minute window.
- **Localisation.** ICU message bundles; locale never enters derivation
  (numbers formatted at presentation).

## Risks / Trade-offs

- Browser storage eviction on iOS remains a data-loss risk for unsynced
  facts; the runtime warns when persistence is not granted and syncs
  eagerly.
- Group membership changes after submission cannot re-attribute
  automatically; an instructor void-and-resubmit path exists.

## Migration Plan

Greenfield. Tests: full offline module completion then sync converges;
duplicate attempt from two devices; slot overbooking reconciliation
scenarios; time-lock key never available before reveal.

## Open Questions

- Whether `after_submit` should expose the key in the bundle or fetch it
  (bundle, per CAC-09; fetch would add a network dependency with no security
  gain).
