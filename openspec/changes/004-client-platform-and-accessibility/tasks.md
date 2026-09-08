## 1. Shell and packages
- [ ] 1.1 Monorepo setup (TypeScript strict, Vite, React Router), package boundaries, CI
- [ ] 1.2 PWA shell: routing, offline route loading, service worker with versioned bundles and engine pinning
- [ ] 1.3 Sync SDK integration and local derived views
- [ ] 1.4 Engine Web Worker host and message protocol
- [ ] 1.5 Automerge worker and document editing components with conflict display
- [ ] 1.6 Static hosting pipeline (S3 + CloudFront, immutable paths, CSP headers)

## 2. Design system
- [ ] 2.1 Tokens, themes (light, dark, high contrast), motion and focus rules
- [ ] 2.2 Component library on React Aria Components with documented keyboard and screen-reader behaviour
- [ ] 2.3 Live regions for sync status and freshness changes; colour-independent status markers

## 3. Accessibility
- [ ] 3.1 axe-core gates on components and routes; zero-violation policy
- [ ] 3.2 Assistive-technology test matrix and per-release manual plan
- [ ] 3.3 QTI interaction renderers with keyboard and single-pointer alternatives; `accessibility` registry
- [ ] 3.4 Accessibility statement generator per tenant
- [ ] 3.5 User research programme with disabled learners (twice yearly)

## 4. Internationalisation and performance
- [ ] 4.1 ICU messages, locale negotiation, RTL layout, content language tagging
- [ ] 4.2 Performance budgets in CI (bundle sizes, Lighthouse throttled profile, interaction latency)

## 5. Protection and telemetry
- [ ] 5.1 Session-bound encryption and idle purge for instructor and admin replicas
- [ ] 5.2 Privacy-preserving telemetry client and `telemetry-ingest` Lambda, consent-gated

## 6. Verification
- [ ] 6.1 Offline learner journey end to end with network disabled
- [ ] 6.2 Accessibility audit sign-off before change 005 UIs are built on the shell
