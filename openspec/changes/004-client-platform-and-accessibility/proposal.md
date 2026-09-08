# Change: 004 Client platform and accessibility

## Why

Every persona meets Trellis through one TypeScript and React client: the
offline learner runtime, the instructor's cohort views, the author's
editors, the organisation admin console and the consumer realm. Building
that shell, its design system, its engine and Automerge hosts and its
accessibility gates before the feature changes means every later user
interface inherits WCAG 2.2 AA conformance, offline behaviour and
performance budgets instead of retrofitting them.

## What Changes

- Monorepo packages: `app` (PWA shell, routing, offline), `engine` host
  (Web Worker), `sync` (device SDK from 002), `automerge-docs`,
  `design-system` on React Aria Components, `qti-interactions`.
- Themes (light, dark, high contrast), tokens, focus and motion rules,
  live-region announcements for sync and freshness.
- Accessibility pipeline: axe-core gates, browser and assistive-technology
  test matrix, manual test plan, accessibility statement generator.
- Internationalisation, RTL, performance budgets enforced in CI.
- Local replica protection (session-bound encryption for instructor and
  admin replicas), privacy-preserving telemetry ingest.
- Static hosting of versioned bundles on S3 and CloudFront; service-worker
  update strategy with engine version pinning (UIX-13) and the published
  browser and device matrix (UIX-14).
- The consumer-realm and organisation admin interfaces (UIX-15), the
  instructor freshness rendering contract (UIX-16), the accessible
  Automerge editor (UIX-17) and the sanitising content sink under a strict
  Content Security Policy (UIX-18).

## Impact

- Provides the shell and components that changes 005 to 015 build their
  user interfaces in.
- Adds one Lambda (`telemetry-ingest`) and the static hosting pipeline.

## Requirements delivered

- UIX-01
- UIX-02
- UIX-03
- UIX-04
- UIX-05
- UIX-06
- UIX-07
- UIX-08
- UIX-09
- UIX-10
- UIX-11
- UIX-12
- UIX-13
- UIX-14
- UIX-15
- UIX-16
- UIX-17
- UIX-18

## Dependencies

001 (hosting, pipeline), 002 (device SDK), 003 (authentication UI). The
QTI interaction renderers ship progressively as their accessible designs
are approved (UIX-05); authoring hides interactions without one.

## Out of scope

Native wrappers beyond packaging; wiki and glossary editors (later change
on the Automerge mechanism).
