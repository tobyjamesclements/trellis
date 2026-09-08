## Context

UIX spec; ADR-001, ADR-023, ADR-025. One client, one design system,
accessibility as a gate, the engine and Automerge as workers.

## Goals / Non-Goals

Goals: zero axe violations on every route; keyboard and screen-reader
operability of every component and interaction; offline-first shell; engine
marking off the main thread; budgets enforced in CI.

Non-goals: a second front-end framework; server-side rendering (the PWA is
static and offline-first).

## Decisions

- **Stack.** TypeScript strict, React, Vite, React Router; React Aria
  Components for primitives; CSS with design tokens; Workbox service
  worker; IndexedDB through a thin typed wrapper; Playwright for browser
  matrices; axe-core for automated checks; FormatJS for ICU messages.
- **State.** Facts and derived local views are the only state; UI state is
  ephemeral. No global mutable store of truth.
- **Engine worker.** `@trellis/engine` runs in a dedicated Web Worker;
  the UI never awaits marking on the main thread; results carry
  `engine_version`.
- **Automerge.** `@automerge/automerge` in a worker for document editing;
  changes are handed to the sync SDK as `am.change.v1` facts; conflicts
  rendered inline with "keep this / keep that".
- **Accessibility gates.** axe-core on component stories and route
  snapshots blocks merges; a per-release manual plan (NVDA+Firefox,
  JAWS+Chrome, VoiceOver+Safari macOS/iOS, TalkBack+Chrome, keyboard-only,
  400% zoom); accessibility defects are severity-1.
- **QTI interactions.** Each renderer ships with keyboard and single-
  pointer alternatives and a documented screen-reader script; interactions
  are registered with `accessibility = ready|pending`; authoring reads the
  registry.
- **Local replica protection.** Learner stores are the learner's own data;
  instructor and admin stores are encrypted with a non-extractable AES-GCM
  key bound to the session and purged after idle (SEC-09).
- **Security of rendering.** Sanitised HTML from blobs, strict CSP with no
  inline scripts, LTI iframes sandboxed, no third-party scripts.
- **Performance budgets.** Learner shell ≤ 200 KB compressed JS initial;
  engine ≤ 300 KB; Automerge worker lazy-loaded; budgets checked in CI with
  Lighthouse on a throttled profile.
- **Statement.** Generated from the conformance record per tenant and
  release; known issues listed with dates.

## Risks / Trade-offs

- Automerge's WASM adds ~600 KB compressed when loaded; it is loaded only
  on editing routes.
- Some QTI interactions will lag behind authoring demand until their
  accessible renderings are approved.
- Safari's storage eviction remains the main risk for unsynced facts; the
  runtime requests persistence and syncs eagerly.

## Migration Plan

Greenfield. Verification: axe zero-violation on all routes; manual plan
executed; Lighthouse budgets met on the throttled profile; offline route
load with network disabled.

## Open Questions

- Whether to adopt a native wrapper for iOS to gain persistent storage
  guarantees (packaging decision, later).
