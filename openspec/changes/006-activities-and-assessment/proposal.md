# Change: 006 Activities and assessment

## Why

This is the learner's product: the offline-capable runtime that records
attempts as facts, marks on the device with the shared engine, shows
feedback under the key-visibility policy, and syncs when it can, plus the
Moodle-baseline activity types (quiz, assignment, workshop, choice,
feedback/survey, lesson-style branching), completion and availability as
advisory predicates, the marking workflow, calendar, and reminders.

## What Changes

- PWA runtime: IndexedDB replica, service worker, storage budget and
  eviction, per-profile stores, sync agent behaviour, source and freshness
  labelling.
- Attempt lifecycle facts, on-device marking with WASM, time-lock key
  fetch, advisory time and attempt limits, quiz behaviours, branching.
- Assignments (files, text, resubmission, groups), marking workflow states,
  allocation, anonymous marking, extensions, overrides, feedback release.
- Choice and slot activities with the `slot-reconcile` apology workflow.
- Peer assessment allocation and marking.
- Feedback/survey activities with anonymity thresholds.
- Calendar derivation and ICS export; reminder intents via COM-07.
- Accessibility and localisation of the runtime.

## Impact

- Adds `slot.v1` to the fact registry; extends subject kinds of attempt and
  response facts to groups (`G`).
- Produces the facts that 007 folds and 009/010 project.

## Requirements delivered

- ACT-01
- ACT-02
- ACT-03
- ACT-04
- ACT-05
- ACT-06
- ACT-07
- ACT-08
- ACT-09
- ACT-10
- ACT-11
- ACT-12
- ACT-13
- ACT-14
- ACT-15
- ACT-16
- ACT-17
- ACT-18
- ACT-19

## Dependencies

002 (device SDK and sync), 003 (sessions, roles, groups), 004 (bundles,
keys, policies, deadlines), 005 (engine WASM). Instructor-facing marking
queues read views from 007; until then the marking UI works from the
instructor device's own pull of cohort facts (FLS-10).

## Out of scope

Forum and messaging activities (008); LTI-launched activities (009).
