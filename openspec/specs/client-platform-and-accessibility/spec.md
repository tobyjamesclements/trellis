# Client Platform and Accessibility Specification

Capability ID prefix: **UIX**

## Purpose

This capability is the TypeScript and React client every persona uses:
learner, instructor, tutor, course designer, observer, consumer, creator,
organisation admin, tenant admin, platform operator and guest. It owns the
monorepo package set, the design system, the progressive web app shell that
hosts the learner runtime of ACT-02, ACT-03 and ACT-04, the Web Worker that
hosts the derivation engine (DRV-02), local replica protection,
internationalisation, performance budgets, client telemetry, the update and
hosting pipeline, content rendering security, and the accessibility
conformance that ADR-025 makes a release gate. It owns no facts and no
server items; its only server-side code is one telemetry ingest function
and the static hosting pipeline.

## Consistency boundary

The client is a replica, never an authority. Three kinds of state exist on
a device and are never confused:

1. **Facts.** The profile's own streams (dense `seq`, allocated in the same
   IndexedDB transaction that stores the fact, FLS-03) and read-only pulled
   streams (FLS-10). Facts leave the device only after the roster confirms
   them (ACT-03). Automerge changes are facts of this kind (FLS-21).
2. **Derived local views.** The engine worker's outputs over the profile's
   facts, bundles and released keys (marks, feedback, completion,
   availability, calendar, materialised documents) plus the last pulled
   region rows with their cursors; all recomputable, discarded on schema
   change. Which source a displayed value comes from is decided by
   version-vector dominance (ACT-17, MVA-05, MVA-10), never by a TTL or a
   wall-clock age.
3. **Presentation state.** Focus, open dialogs, scroll position, unsaved
   keystrokes. It never survives a reload and is never the only copy of
   anything a person did.

React state holds only the third kind; anything that must survive a reload
is a fact, a draft awaiting its fact (ACT-01), or a cache regenerable from
facts. The client tolerates any region (FLS-18), any staleness (MVA-02) and
any server engine version (FLS-15, DRV-14), and never withholds, rejects or
reorders learner work. Accessibility conformance is a property of a
release, proved per build; the per-tenant statement records what the tenant
adds (authored content, embedded tools) and what remains open.

## Domain model

### Packages (one npm workspace, TypeScript `strict`, React)

| Package | Contents | Runs in | Compressed budget | Shared with |
|---|---|---|---|---|
| `app` | PWA shell, routing, service worker, offline runtime host (ACT-02, ACT-03); learner, instructor, author, admin, consumer-realm and operator surfaces | Main thread and service worker | Learner shell ≤ 200 KB JS; route chunks ≤ 150 KB | — |
| `engine` | `@trellis/engine` (DRV-02): QTI response and outcome processing, attempt, lateness and aggregation policies, completion, availability, calendar | Web Worker (device); GraalJS in Java Lambdas (server) | ≤ 300 KB (DRV-17) | Server build consumes the identical artefact by content hash |
| `sync` | FLS device SDK: `seq` allocation, canonical CBOR and `fact_id` (FLS-01), push and pull (FLS-08), gap fill and refork (FLS-09), blob upload (FLS-12), any-region failover (FLS-18), device registration (FLS-19), telemetry flush (UIX-12) | Service worker; main-thread fallback | ≤ 60 KB | — |
| `automerge-docs` | Wrapper over `@automerge/automerge` (its core is a vendored native dependency: WASM in the browser, JNI on the JVM, SEC-07); `am.change.v1` mapping (FLS-21), materialisation, conflict and history model, editor bindings | Dedicated worker and main thread | ≤ 1.2 MB with the core; document routes only | Same core version as the server's Java binding |
| `design-system` | Primitives on React Aria Components, tokens, themes, live-region service, the single sanitising HTML sink (UIX-18), i18n runtime (UIX-10), per-component accessibility contracts | Main thread | Inside the shell budget | — |
| `qti-interactions` | One renderer per interaction in `derivation-engine/qti-profile.md`, catalog alternatives, the classification table below | Main thread | ≤ 120 KB, activity routes only | Classification version read by `publish-prepare` (CAC-08) |

### Device stores (IndexedDB, one database set per principal profile)

```
facts     own and pulled facts by (stream, seq); P-class bodies encrypted under the replica key
outbox    seqs not yet in an `accepted` sync response, per stream (ACT-03)
vectors   per (subject, scope): device vector and last roster (FLS-08, FLS-09)
rows      last LearnerRow / view header per (module, cohort) with cursors and freshness (MVA-02)
bundles   content-addressed blobs, LRU within the ACT-02 budget (CAC-14)
keys      released answer keys by key_version (ACT-05)
drafts    unsent per-item drafts (ACT-01); Automerge snapshots by heads (FLS-21)
profile   profile.v1 fields folded LWW, including a11y.* preferences (IDE-04)
keyring   wrapped replica key; wrapping key per the role's policy (UIX-09)
telemetry bounded buffer of scrubbed events awaiting a consented flush (UIX-12)
```

Derived local views: `LocalLearnerView` per module (engine outputs with
provenance and `source: device | region`), `LocalCalendar` (ACT-15),
`LocalInbox` (COM-17 page with its freshness block), `LocalDoc`
(materialised Automerge document with conflicts and history). Each is a
pure function of the stores above and the engine version.

### Accessibility model

```
A11yPrefs         profile.v1 fields a11y.theme ∈ {system, light, dark, high_contrast}, a11y.motion,
                  a11y.text_spacing, a11y.font_scale, a11y.catalog ⊆ {spoken, glossary, braille,
                  sign, simplified}                                                      (ACT-19)
ConformanceRecord per build_id: axe results per component and route, manual test-plan results per
                  assistive-technology pairing, known issues [{id, wcag_sc, severity, surfaces,
                  workaround, target_build}], reviewed_at; a content-addressed blob (CAC-03)
Statement         per tenant, from the ConformanceRecord plus tenant.v1.a11y_contact and the tenant's
                  registered LTI tools with their attestations; https://<tenant-host>/accessibility
Classification    per interaction: accessibility ∈ {ready, pending}, recorded per item in the bundle
                  manifest next to CAC-08's `marking`
```

### WCAG 2.2 success criteria the design targets explicitly

| Criterion | Level | Design response |
|---|---|---|
| 2.4.11 Focus Not Obscured (Minimum) | AA | Sticky headers, the sync status bar and banners set `scroll-padding` on every scroll container; toasts never take focus; dialogs trap focus |
| 2.4.13 Focus Appearance | AAA, adopted | Focus ring ≥ 2 CSS px perimeter at ≥ 3:1 against adjacent colours, in every theme and under forced colours |
| 2.5.7 Dragging Movements | AA | Every drag has a select-then-place single-pointer path and a keyboard path producing the identical `resp.v1` (UIX-05) |
| 2.5.8 Target Size (Minimum) | AA | Tokens enforce 24 × 24 CSS px minimum; 44 × 44 for primary controls on coarse pointers |
| 3.2.6 Consistent Help | AA | Help, accessibility statement, contact and sync status occupy the same position on every route |
| 3.3.7 Redundant Entry | AA | Sign-up, join and admin flows pre-fill previously entered data; assessment answers are exempt as essential |
| 3.3.8 Accessible Authentication (Minimum) | AA | Passwordless by construction (IDE-02); no cognitive function test, no puzzle CAPTCHA |
| 3.3.9 Accessible Authentication (Enhanced) | AAA, met by construction | No cognitive test of any kind exists in any sign-in path |
| 2.2.1 Timing Adjustable; 2.2.5 Re-authenticating | A; AAA (met) | Time limits are advisory and extendable per learner (`extension.v1`, ACT-06); nothing is lost across re-authentication because every saved answer is a durable fact |

### Interaction classification (qti-profile.md delivery interactions)

| Interaction | Accessible rendering (design-system pattern) | Non-drag path (2.5.7) | Status |
|---|---|---|---|
| `choiceInteraction` | Radio or checkbox group named by the stem | — | ready |
| `inlineChoiceInteraction` | Select-only combobox inside prose | — | ready |
| `textEntryInteraction` | Labelled text input, `inputmode` from the base type | — | ready |
| `extendedTextInteraction` | Multiline textbox or Automerge draft editor; character count in a live region | — | ready |
| `hottextInteraction` | Inline toggle buttons with `aria-pressed` | — | ready |
| `orderInteraction` | Listbox with keyboard reorder and position announcements | Select item, activate target position | ready |
| `associateInteraction` | Listbox plus "pair with" menu; pairs listed as a table | Select A, then B | ready |
| `matchInteraction` | Table of radios or checkboxes with row and column headers | — | ready |
| `gapMatchInteraction` | One combobox per gap listing the choices (ACT-19) | Select gap, then choice | ready |
| `sliderInteraction` | Slider with `aria-valuetext` and a paired numeric field | Numeric entry | ready |
| `hotspotInteraction` | Image with one named button per hotspot (SVG overlay); labels required (CAC-16) | Activate hotspot | ready |
| `uploadInteraction` | File input with progress and result announced | — | ready |
| `endAttemptInteraction` | Button | — | ready |
| `mediaInteraction` (delivery only) | Media element with captions and transcript from the catalog | — | ready |
| `graphicOrderInteraction` | Hotspot buttons plus an ordered list with keyboard reorder | Select, then place | pending |
| `graphicAssociateInteraction` | Hotspot buttons plus a pair list | Select, then select | pending |
| `graphicGapMatchInteraction` | Gap buttons on the image plus a combobox per gap | Select gap, then choice | pending |
| `selectPointInteraction` | Image with coordinate fields, arrow-key cursor with `aria-valuetext`, zoom | Coordinate entry | pending |

`pending` means the rendering is designed but not yet shipped and tested
under UIX-06; the status is versioned with the engine profile and flips to
`ready` only through a release that passes the gate.

### New fact types

None. The client writes only types registered to other capabilities
(`device.v1`, `noop.v1`, `void.v1`, `profile.v1`, `consent.v1`,
`push.sub.v1`, the ACT, COM, CAC and CRD types, and `am.change.v1` per
FLS-21) through `POST /sync/v1`. Client telemetry is not a fact (UIX-12).

---

## Requirements

### Requirement: The system SHALL deliver every user interface from one TypeScript and React monorepo of six packages, with state held as facts and derived local views and never in a second mutable store of truth [UIX-01]

The system SHALL deliver every user interface from one TypeScript and React monorepo of six packages, with state held as facts and derived local views and never in a second mutable store of truth.
The packages are `app`, `engine`, `sync`, `automerge-docs`, `design-system`
and `qti-interactions` as tabled above; TypeScript runs in `strict` mode,
React is the only UI framework, and the server's Maven build consumes the
`engine` artefact the client build produced, by content hash (ADR-001,
DRV-02). Data flows one way, facts → engine worker → derived local views →
React; component state may hold presentation state only, and a lint rule
fails any module that persists application state outside the `sync` stores
or reads a mutable global store.

#### Scenario: Submitted flag proposed as component state
- **WHEN** a pull request stores "submitted" as a boolean in a store that survives navigation
- **THEN** the lint rule fails the build, and the author derives it from the effective `attempt.submit.v1` (ACT-01) in the local view instead

#### Scenario: One engine artefact, two builds
- **WHEN** the release pipeline builds the client and the server for one release
- **THEN** both embed the `engine` bundle with the same content hash, and the `engine_version` in every `client_mark` equals the one the server records in provenance

### Requirement: The system SHALL build the design system on accessible primitives with colour, contrast, spacing and motion tokens, light, dark and high-contrast themes, and a documented keyboard and screen-reader contract per component [UIX-02]

The system SHALL build the design system on accessible primitives with colour, contrast, spacing and motion tokens, light, dark and high-contrast themes, and a documented keyboard and screen-reader contract per component.
Every interactive component composes React Aria Components rather than
restyling native controls (ADR-025). Colour exists only as token pairs whose
contrast is checked in CI (4.5:1 text, 3:1 components and graphics, 7:1 in
the high-contrast theme); spacing and type are `rem` tokens; motion tokens
collapse to zero under `prefers-reduced-motion` except progress indication.
Themes `light`, `dark` and `high_contrast` follow `a11y.theme` or the
system, and every component honours `forced-colors: active`. Each
component ships an accessibility contract (keyboard table, roles and
states, expected announcements, RTL, forced-colour and reduced-motion
behaviour, minimum target size) and an axe-tested story; a component
without one fails the build.

#### Scenario: Component without a contract
- **WHEN** a new `SplitButton` is added without an accessibility contract file
- **THEN** the design-system build fails naming the missing sections, and `app` cannot import the component

#### Scenario: Forced colours
- **WHEN** a learner uses Windows high-contrast mode
- **THEN** focus rings, late and pending markers and the sync status stay visible in system colours, and nothing conveyed in the default theme is lost

### Requirement: The system SHALL treat WCAG 2.2 Level AA conformance of every user interface as a release gate, with EN 301 549 and the UK Public Sector Bodies Accessibility Regulations 2018 as the procurement and legal references [UIX-03]

The system SHALL treat WCAG 2.2 Level AA conformance of every user interface as a release gate, with EN 301 549 and the UK Public Sector Bodies Accessibility Regulations 2018 as the procurement and legal references.
The gate covers the learner, instructor, author, admin, consumer-realm and
operator surfaces and the native wrappers (UIX-14): a release ships only
when the UIX-06 results for the build show no open accessibility defect,
which is severity-1 by definition (ADR-025). The design targets the
2.2-specific criteria tabled in the Domain model (2.4.11, 2.5.7, 2.5.8,
3.2.6, 3.3.7, 3.3.8) and adopts 2.4.13 and 3.3.9 although they are Level
AAA. EN 301 549 clauses 9, 11 and 12 structure the per-release conformance
report for procurement, and a public-sector tenant's duty under the 2018
Regulations is met with the UIX-07 statement.

#### Scenario: Open defect at release
- **WHEN** the manual pass records that VoiceOver on iOS does not announce the gap-match choices
- **THEN** the release is blocked until the defect is fixed and re-tested; no "known issue" path exists for a defect found before release

#### Scenario: Sticky bar obscures focus at 400% zoom
- **WHEN** the sync status bar covers a focused button at 400% zoom
- **THEN** the finding is logged against 2.4.11 at severity-1, and the fix sets the scroll container's `scroll-padding` to the bar's height

### Requirement: The system SHALL be keyboard-operable with visible focus, screen-reader semantics per WAI-ARIA 1.2, reflow at 400% zoom, text-spacing and reduced-motion support, colour-independent status markers and live regions for sync and freshness changes [UIX-04]

The system SHALL be keyboard-operable with visible focus, screen-reader semantics per WAI-ARIA 1.2, reflow at 400% zoom, text-spacing and reduced-motion support, colour-independent status markers and live regions for sync and freshness changes.
Every function is reachable by keyboard without traps or positive
`tabindex`; focus order follows reading order behind skip links and
landmarks; names, roles and states follow the ARIA Authoring Practices
patterns with accessible names containing the visible label. Layouts reflow
at 320 CSS px with no two-dimensional scrolling except data tables and
images, survive the 1.4.12 text-spacing overrides, and drop non-essential
animation under `prefers-reduced-motion`. Every status (late, in transit,
hole, provisional, over time, override, device versus region source) is icon
plus text, never colour alone. Sync state and MVA-02 freshness changes are
announced through one polite `status` region, coalesced to one
announcement per 5 s per kind and phrased as the freshness block
("includes work synced up to ⟨time⟩; ⟨n⟩ devices have work in transit");
errors use an `alert` region; a value changing source from device to region
is announced and focus never moves.

#### Scenario: Freshness changes while a screen-reader user reads the gradebook
- **WHEN** a pull folds two more streams into the instructor's view
- **THEN** the status region announces the new freshness block once, the focused cell is unchanged, and the two rows gain an "updated" text marker

#### Scenario: Late marker without colour
- **WHEN** a learner with monochrome display settings views their submission list
- **THEN** each late item shows an icon and the word "late", and its accessible name carries the ACT-14 label ("submitted on time, synced late — counted as on time")

### Requirement: The system SHALL render every supported QTI 3.0 interaction keyboard-operable and screen-reader-usable with single-pointer alternatives to dragging, render catalog alternatives, and classify interactions without an accessible rendering as `accessibility = pending` so authoring hides them [UIX-05]

The system SHALL render every supported QTI 3.0 interaction keyboard-operable and screen-reader-usable with single-pointer alternatives to dragging, render catalog alternatives, and classify interactions without an accessible rendering as `accessibility = pending` so authoring hides them.
`qti-interactions` renders each interaction in `qti-profile.md` through the
pattern in the classification table; dragging is an enhancement over the
select-then-place model, and the `resp.v1` produced is identical whichever
modality produced it, so the engine marks it identically (ACT-19). Catalog
alternatives (`qti-catalog-info` referenced by `data-catalog-idref`: spoken
audio, glossary, braille text, sign-language video, simplified language)
render according to `a11y.catalog`, and item `xml:lang` and `dir` reach the
DOM (UIX-10). At publish, `publish-prepare` records `accessibility = ready |
pending` per item from the classification version exactly as CAC-08 records
`marking`; `pending` interactions are absent from the authoring palette,
listed in the prepare report for imported items, excluded from delivery,
and shown on the device as an accessible placeholder naming the reason.

#### Scenario: Order interaction by keyboard
- **WHEN** a screen-reader user selects the third item with Space and presses the up arrow twice
- **THEN** the announcements read "moved to position 1 of 5", and the saved `resp.v1` equals the one a pointer drag would have produced

#### Scenario: Imported item with a pending interaction
- **WHEN** a Common Cartridge import (DIO-11) brings an item using `selectPointInteraction`
- **THEN** publishing classifies it `accessibility = pending`, the prepare report lists it, the item is not delivered, and the editor is offered a replacement interaction

### Requirement: The system SHALL test accessibility automatically on every component and route in CI and manually per release with the named assistive-technology pairings, run user research with disabled learners at least twice a year, and treat accessibility defects as severity-1 for release [UIX-06]

The system SHALL test accessibility automatically on every component and route in CI and manually per release with the named assistive-technology pairings, run user research with disabled learners at least twice a year, and treat accessibility defects as severity-1 for release.
axe-core runs on every design-system story and every application route in
Chromium, Firefox and WebKit on each pull request with zero violations
required to merge; no rule is disabled globally, and a per-instance
exemption needs a linked defect and expires at the next release. The
per-release manual plan covers NVDA with Firefox, JAWS with Chrome,
VoiceOver with Safari on macOS and iOS, TalkBack with Chrome on Android, a
keyboard-only pass, a 400% zoom pass and a forced-colours pass over
scripted tasks per persona, recorded in the ConformanceRecord. Research
sessions with disabled learners and instructors run at least twice a year
across visual, motor, cognitive and hearing needs; findings enter the
tracker at severity-1.

#### Scenario: Unlabelled icon button
- **WHEN** a pull request adds a toolbar button whose only content is an icon
- **THEN** axe reports `button-name` on the story and the route, and the pull request cannot merge

#### Scenario: Research finding between releases
- **WHEN** a session shows the marking-queue filters confuse a participant using a screen magnifier
- **THEN** a severity-1 defect is opened, every tenant's statement lists it with its target build (UIX-07), and the next release cannot ship with it open

### Requirement: The system SHALL publish an accessibility statement per tenant at a stable URL, generated from the current conformance record and updated per release [UIX-07]

The system SHALL publish an accessibility statement per tenant at a stable URL, generated from the current conformance record and updated per release.
`app-release` renders `https://<tenant-host>/accessibility` for every
tenant from the build's ConformanceRecord and the tenant's `tenant.v1`
fields, in the structure of the UK model accessibility statement:
compliance status, non-accessible content with WCAG criteria and target
builds, content outside scope, third-party content (the tenant's registered
LTI tools with any accessibility attestation on the registration, and
authored content checked by CAC-16), testing approach and dates, the contact
route (`tenant.v1.a11y_contact`) and the enforcement procedure for the
tenant's jurisdiction. An EN 301 549 conformance report for procurement is
generated from the same record per release. The page is linked from every
route's help position (3.2.6), regenerated on every release and on every
change to the tenant's fields, and every version is retained with its
`build_id` and `reviewed_at`.

#### Scenario: Release with a new known issue
- **WHEN** a release ships with a research finding open at severity-1 for the following release
- **THEN** every tenant's statement is regenerated within the release window, lists the issue with its criterion, workaround and target build, and the previous statement stays retrievable by `build_id`

#### Scenario: Tenant sets its contact route
- **WHEN** a tenant admin sets `a11y_contact` to a support address
- **THEN** the `tenant.v1` fact folds, the rule invokes `app-release` for that tenant, and the statement shows the new contact within minutes without a release

### Requirement: The system SHALL run the TypeScript derivation engine in a Web Worker off the main thread under the DRV-03 determinism subset, gate releases on the golden-vector suite in the browser matrix, and hold the engine to 300 KB compressed and 200 ms marking latency on a 2019-class mobile device [UIX-08]

The system SHALL run the TypeScript derivation engine in a Web Worker off the main thread under the DRV-03 determinism subset, gate releases on the golden-vector suite in the browser matrix, and hold the engine to 300 KB compressed and 200 ms marking latency on a 2019-class mobile device.
The shell posts derivation requests (the facts for a `(subject, scope)`,
item, key, rubric and policy blobs by hash, the seed inputs) to a module
worker running `@trellis/engine` and receives outputs with provenance
(DRV-15); the worker imports no DOM, `Intl` or `Date` API and the DRV-03
lint runs on the package in CI. The golden-vector suite (DRV-02) runs
against the built worker bundle in Chromium, Firefox and WebKit, and the
same vectors run under GraalJS in the server build; any difference fails
the release. The bundle is capped at 300 KB compressed and the DRV-17
workload must mark within 200 ms on the reference device (UIX-14), measured
per release on real devices. The shell waits at most 500 ms for a
`client_mark` before writing the `resp.v1` without one (ACT-04), so a slow
or crashed worker delays feedback but never delays or loses the fact.

#### Scenario: WebKit differs on a golden vector
- **WHEN** a `roundTo` vector produces a different score in WebKit than in Chromium and GraalJS
- **THEN** the release pipeline fails before any bundle is uploaded, and the vector joins the DRV-03 lint corpus

#### Scenario: Worker crashes mid-mark
- **WHEN** the engine worker terminates while marking a saved response
- **THEN** the `resp.v1` is already durable without `client_mark`, the worker restarts, the local view derives the mark and feedback, and the server derives independently on sync (DRV-14)

### Requirement: The system SHALL keep one IndexedDB replica per principal profile, request persistent storage, encrypt instructor and admin replicas under a non-extractable session-bound WebCrypto key purged after idle, accept the learner replica as the learner's own data, and apply the ACT-02 storage budget and eviction rules [UIX-09]

The system SHALL keep one IndexedDB replica per principal profile, request persistent storage, encrypt instructor and admin replicas under a non-extractable session-bound WebCrypto key purged after idle, accept the learner replica as the learner's own data, and apply the ACT-02 storage budget and eviction rules.
Each profile owns its databases and `device_id` (FLS-19); first run calls
`navigator.storage.persist()` and shows the outcome; bundles evict LRU
within 60% of quota or 2 GB, released keys next, facts, vectors and drafts
never (ACT-02). P-class bodies, drafts, documents and pulled rows are
encrypted with AES-GCM under a per-profile replica key generated
non-extractable in WebCrypto and stored wrapped in `keyring`. For learner
and consumer profiles the wrapping key persists with the profile so offline
work continues indefinitely; the replica is the learner's own data and its
confidentiality on a lost device rests on the device lock, the accepted
risk SEC-09 records. For instructor, tutor, admin and operator profiles the
wrapping key is bound to the session (IDE-03): created at sign-in and
destroyed, together with every pulled fact, row and bundle of other
subjects, on sign-out, on an IDE-12 revocation, on refresh failure, or
after `tenant.v1.idle_purge_after` without interaction (default 12 h for
instructor and tutor, 1 h for admin and operator); the profile's own
unpushed facts stay in the outbox under the replica key until the roster
confirms them (ACT-03). Switching profile closes the database and drops
every key from memory.

#### Scenario: Instructor tablet idle overnight
- **WHEN** an instructor's tablet with 6 unpushed `mark.v1` facts and a pulled cohort replica is idle for 13 h
- **THEN** on the next wake the service worker purges the pulled facts, rows, bundles and the wrapping key, the 6 marks remain in the outbox, and after sign-in they push and the cohort is re-pulled (FLS-10)

#### Scenario: Persistent storage refused
- **WHEN** the browser denies `persist()` for a learner profile
- **THEN** the app shows a persistent, dismissible notice that offline work may be cleared by the browser, halves the bundle budget, and syncs every minute while open

### Requirement: The system SHALL internationalise the interface with ICU message format, locale negotiation and right-to-left layout, format dates and numbers only at presentation, tag content language for assistive technology, and never let locale enter derivation [UIX-10]

The system SHALL internationalise the interface with ICU message format, locale negotiation and right-to-left layout, format dates and numbers only at presentation, tag content language for assistive technology, and never let locale enter derivation.
Interface strings are ICU MessageFormat bundles per locale loaded by route;
the effective locale is `profile.v1.locale`, else `tenant.v1.locale`, else
`navigator.languages`, and a pseudo-locale build exercises expansion and
bidi in CI. Layout uses CSS logical properties with `dir` on the root,
directional icons mirror, and user content is bidi-isolated. `Intl`
formatting and collation live only in presentation components, rendering
HLC physical times in the profile time zone with the offset visible
(ACT-15) and localised digits for display; `engine` and `sync` never import
`Intl` or receive a locale (DRV-03). Item, page and post language
(`xml:lang`, `lang`) propagates to the DOM so assistive technology switches
voice (3.1.1, 3.1.2).

#### Scenario: Locale switch
- **WHEN** a learner changes the interface locale from `en-GB` to `ar`
- **THEN** the shell re-renders right-to-left with Arabic strings and localised digits, and every derived score and seed is byte-identical to before (ACT-19)

#### Scenario: French item in an English course
- **WHEN** an item carries `xml:lang="fr"`
- **THEN** the item container renders with `lang="fr"`, the screen reader switches voice for the stem and choices, and the chrome stays in the interface locale

### Requirement: The system SHALL meet performance budgets on low-end devices, enforced in CI: a 200 KB compressed learner shell, LCP within 2.5 s on a low-end Android over 3G, 100 ms interaction latency, offline route loads with no network, and background sync that never blocks the interface [UIX-11]

The system SHALL meet performance budgets on low-end devices, enforced in CI: a 200 KB compressed learner shell, LCP within 2.5 s on a low-end Android over 3G, 100 ms interaction latency, offline route loads with no network, and background sync that never blocks the interface.
The learner shell's initial JavaScript is ≤ 200 KB compressed; the engine
worker (≤ 300 KB) loads after first paint, the document editor chunk
(≤ 1.2 MB) only on document routes, and each route chunk is ≤ 150 KB. On
the reference device (UIX-14) under Lighthouse mobile throttling (1.6 Mbps
down, 150 ms RTT, 4× CPU slowdown) learner routes reach LCP ≤ 2.5 s and
shell interactions respond visually within 100 ms; every route loads from
the service worker and IndexedDB with the network disabled, with a cold
offline start ≤ 3 s. Sync, blob upload and telemetry run in the service
worker (ACT-03); the main thread never awaits the network and IndexedDB
writes are batched off the interaction path. CI enforces size limits per
entry and chunk, Lighthouse assertions on learner routes and the UIX-08
worker benchmark; a regression blocks merge.

#### Scenario: Chart library added to the shell
- **WHEN** a pull request imports a 90 KB charting library into the learner shell entry
- **THEN** the size check fails with the delta, and the library moves to the instructor analytics route chunk

#### Scenario: Airplane mode launch
- **WHEN** a learner launches the installed app with no connectivity
- **THEN** the module last opened renders from cache within 3 s, marked "offline; 3 items to sync", and every cached route is navigable

### Requirement: The system SHALL collect privacy-preserving telemetry limited to client errors and performance metrics with pseudonymous identifiers, consent-gated, sampled, sent only to a Trellis endpoint and never to third parties [UIX-12]

The system SHALL collect privacy-preserving telemetry limited to client errors and performance metrics with pseudonymous identifiers, consent-gated, sampled, sent only to a Trellis endpoint and never to third parties.
Events carry only the error class and symbolication key with our own stack
frames, Web Vitals and the UIX-11 timings, sync and worker durations,
storage estimates, and coarse context (`build_id`, `engine_version`, route
template, device class, browser family and major, locale, `tenant_id`,
`hash(device_id, build_id)`); never a fact body, item text, response, name,
address or URL parameter, and a CI schema test fails any field admitting
free text. The client buffers events in IndexedDB and flushes them on the
sync cadence to `POST /telemetry/v1` on the tenant's regional API only when
its own folded `consent.v1` grants `analytics` (ADM-16); errors are sampled
at 100% capped at 20 per session, performance at 10% of sessions, and
guests (IDE-10) send nothing. No third-party script, beacon, font or CDN
loads on any Trellis origin (UIX-18). `telemetry-ingest` re-checks consent,
validates the schema and emits EMF metrics and sampled logs (ADM-08); it
writes no table item and keeps nothing per user.

#### Scenario: Consent withdrawn
- **WHEN** a learner withdraws the `analytics` purpose
- **THEN** the buffer is discarded, nothing further is sent once the fact is in the replica, and the ingest function drops any in-flight batch whose consent has folded as withdrawn

#### Scenario: Error message carries content
- **WHEN** an exception message includes a fragment of the learner's essay
- **THEN** the scrubber records only the error class and our frames, the fragment never leaves the device, and the schema test would have failed any event type able to carry it

### Requirement: The system SHALL ship immutable versioned builds through a service worker that activates updates only between attempts, migrates local stores forward-only, and pins the fact-type versions it emits to those the server has confirmed [UIX-13]

The system SHALL ship immutable versioned builds through a service worker that activates updates only between attempts, migrates local stores forward-only, and pins the fact-type versions it emits to those the server has confirmed.
Every build is uploaded under `/app/<build_id>/` with content-hashed file
names and `Cache-Control: public, max-age=31536000, immutable`; the entry
documents and `sw.js` are served `no-cache`, so a launch discovers a new
build, which the service worker precaches in the background and activates
only when no client has an open attempt or an editing session mid-change,
after an accessible "update ready" notice. IndexedDB migrations are
forward-only and run before activation; rollback re-points the entry
document at an earlier `build_id` and never mutates a bundle. The client
marks with its bundled engine and records `engine_version` (DRV-14); an
item whose manifest needs a newer engine profile than the client holds is
treated as `server_or_human` for display (CAC-08). The fact-type versions
the client emits are pinned to the registry version the server last
confirmed in the sync response's `advice.versions` (an FLS-08 advice entry
carrying the server `engine_version` and registry version), so a client
that ships `resp.v2` keeps emitting `resp.v1` until confirmation instead of
having its work stored uninterpreted (FLS-15).

#### Scenario: Update discovered mid-quiz
- **WHEN** a new build is discovered while a learner has an attempt open
- **THEN** the notice appears, nothing reloads, and the build activates after the attempt is submitted and the app is next launched

#### Scenario: Newer registry on the client
- **WHEN** a build introduces `resp.v2` and the last `advice.versions` names registry version 1
- **THEN** the client keeps writing `resp.v1`; after a later sync reports version 2 it switches, and facts already written are unaffected

### Requirement: The system SHALL support a published browser and device matrix with tiered testing, degrade to online-only mode where offline storage is unavailable, and treat native wrappers as packaging only [UIX-14]

The system SHALL support a published browser and device matrix with tiered testing, degrade to online-only mode where offline storage is unavailable, and treat native wrappers as packaging only.
Tier 1 (CI matrix and release gate): current and previous major versions
of Chromium-based Chrome and Edge on desktop and Android, Firefox current
and ESR, Safari current and previous major on macOS and iOS, Samsung
Internet current; minimum platforms Android 10, iOS 16, Windows 10, macOS
12 and ChromeOS. Tier 2 (manual per release): Firefox on Android and
enterprise-managed browsers. The reference low-end device for UIX-08 and
UIX-11 is a 2019-class Android phone (2 GB RAM, Cortex-A53-class cores).
Where a service worker or IndexedDB is unavailable (private browsing,
policy) the app runs online-only with a persistent notice, an ephemeral
`device_id` per page load and immediate push of every fact, stating that
unpushed facts do not survive a reload. Native wrappers (an Android Trusted
Web Activity, an iOS WKWebView shell) load the same served bundle from the
same origin, add only install, push and deep-link plumbing, hold no
business logic or separate storage, and pass the same gates with platform
assistive technology in the UIX-06 plan.

#### Scenario: Previous-major Safari defect
- **WHEN** a defect reproduces only in the previous major version of Safari on iOS
- **THEN** it is Tier 1 and blocks the release like any other severity-1 defect

#### Scenario: Private browsing
- **WHEN** a learner opens the app in a private window
- **THEN** it runs online-only, shows the notice, registers an ephemeral `device_id` (FLS-19), pushes each fact immediately, and marks locally without persisting a replica

### Requirement: The system SHALL provide the consumer realm interface for self-service sign-up, organisation creation, joining and leaving, and the strict-organisation administration interface for identity lifecycle, under the same accessibility gates [UIX-15]

The system SHALL provide the consumer realm interface for self-service sign-up, organisation creation, joining and leaving, and the strict-organisation administration interface for identity lifecycle, under the same accessibility gates.
The consumer realm (`identity_mode = consumer`, IDE-19, ADR-026) offers
sign-up and sign-in by magic link or social and institutional OIDC
(IDE-02), the OpenID Provider consent screen naming the organisation and
the claims released (IDE-20), personal profile and `a11y.*` preferences,
personal learning, the credential backpack (CRD-16), self-service creation
of a soft organisation under the zone's wildcard host with the creator as
first admin (ADM-22, ADM-23), joining by invitation link, code or email
invite (IDE-21) with plain statements of what the organisation can and
cannot see or do, and leaving with the portability options of IDE-24. The
soft-organisation admin surface manages membership and roles only and
explains why identity controls are absent (`409 identity_owned_by_realm`).
The strict-organisation admin surface (IDE-22) manages creation,
suspension, deprovisioning and erasure with provisioning-source status for
the console, SCIM 2.0 (DIO-20), OneRoster (DIO-02) and the IdP, the
external-guests policy (IDE-23), hostname and SSO; it never offers a
password reset (IDE-02), and every terminal action states what is derived
and what is destroyed (ADM-11).

#### Scenario: Tutor creates a study organisation and a learner joins
- **WHEN** a verified consumer creates "Riverside Tutoring" and shares its join link
- **THEN** the organisation resolves under the wildcard host with the consumer as admin, a joining learner passes the realm consent screen, and the directory lists the member with membership and role controls but no identity controls

#### Scenario: Strict organisation suspends a user
- **WHEN** an admin suspends a user
- **THEN** the interface states that sessions end in every region within replication lag (IDE-09, IDE-12) and enrolments are unchanged, and no "reset password" control exists anywhere

### Requirement: The system SHALL render every instructor-facing derived view with the MVA-02 freshness block, per-row in-transit and hole markers, dominance checks after the instructor's own writes, and staleness-naming confirmations before punitive or outbound actions [UIX-16]

The system SHALL render every instructor-facing derived view with the MVA-02 freshness block, per-row in-transit and hole markers, dominance checks after the instructor's own writes, and staleness-naming confirmations before punitive or outbound actions.
Gradebooks (MVA-06), marking queues (ACT-12), slot rosters (ACT-09),
enrolment views, at-risk flags (MVA-09), rankings (MVA-18) and analytics
(MVA-13) render the freshness block in its MVA-02 meaning, mark rows with
pending streams and holes (MVA-17), show the vector digest beside every
non-monotone value (MVA-07), and never a bare timestamp or an age. After
the instructor's own write (override, extension, mark, structure change)
the client polls `POST /views/{partition}/dominates` (MVA-05) until the
row cursor includes its stream's `seq`, showing "your change is not yet
reflected" meanwhile, then reads with `consistent=true` (MVA-16). Punitive
or outbound actions on a view with pending streams (mark as missing, send a
reminder, confirm a bump, manual score post via LTI-19, export) require a
confirmation naming the affected learners and their in-transit work
(known-tensions §2). `freshest=true` (MVA-11) is an explicit control
labelled with the serving region, and the MVA-14 "cross-region sync
delayed" banner is a status region.

#### Scenario: Override then refresh
- **WHEN** an instructor overrides a grade and the page refreshes within a second
- **THEN** the cell shows "your change is not yet reflected" until the dominance check passes, then the consistent read replaces it and the status region announces the update once

#### Scenario: Reminder with work in transit
- **WHEN** an instructor sends a reminder to the four learners without a submission while two of them have pending streams
- **THEN** the confirmation lists those two by name with "work in transit from 1 device", offers to exclude them, and proceeds only on explicit confirmation

### Requirement: The system SHALL edit Automerge document scopes through an accessible editor whose every change is a fact, and display preserved conflicts and history rather than resolving them silently [UIX-17]

The system SHALL edit Automerge document scopes through an accessible editor whose every change is a fact, and display preserved conflicts and history rather than resolving them silently.
`automerge-docs` presents page and book bodies and item and rubric text to
authors, and essay drafts (`_draft#<activity>`) and group workspaces to
learners (ADR-023). Each local change becomes one `am.change.v1` fact
through `sync` (actor = `device_id`, per-actor `seq` = stream `seq`, deps
in `refs`, FLS-21) on a 2 s idle or blur cadence, so a lost device loses at
most seconds of typing; the document is materialised in a dedicated worker
from the cached snapshot for its heads plus later changes. The editor is
the design-system multiline textbox with an APG toolbar, announcing marks
and structure. Concurrent values of one map key appear as a conflict chip
listing each value with author and sync time and are resolved by choosing,
which is a new change; duplicated list elements from concurrent moves are
de-duplicated with a history note; history lists every change by author,
device and `sync_hlc`, and co-editors are shown from recent changes'
actors rather than a presence protocol. Group members see each other's
changes on sync (ACT-10).

#### Scenario: Concurrent paragraph edits offline
- **WHEN** two authors edit the same paragraph offline and sync through different regions
- **THEN** both insertions are present in the merged text, the history lists a change per author, and nothing needs choosing

#### Scenario: Concurrent titles
- **WHEN** two authors set the page title concurrently
- **THEN** the title field shows a chip "2 titles: 'Cells' (Ana, 09:12) / 'Cell biology' (Ben, 09:13)", choosing one writes a change, and the other value stays in history

### Requirement: The system SHALL render authored content only through one sanitising sink under a strict Content Security Policy with no inline scripts, serve user content from a separate origin, and sandbox embedded LTI tools [UIX-18]

The system SHALL render authored content only through one sanitising sink under a strict Content Security Policy with no inline scripts, serve user content from a separate origin, and sandbox embedded LTI tools.
HTML from blobs and facts (page and book bodies, item stems, feedback,
posts) passes through the design-system sanitiser (allowlisted elements,
attributes and URL schemes; MathML allowed; SVG restricted; `style` limited
to a token allowlist; resources only from the content origin) before
insertion, enforced by a Trusted Types policy where supported and a lint
that bans any other HTML sink. The app origin's CSP is `default-src
'self'; script-src 'self' 'wasm-unsafe-eval'` (the Automerge core), with no
`'unsafe-inline'` or `'unsafe-eval'`, `connect-src` limited to the tenant's
API and content origins, `object-src 'none'`, `base-uri 'none'`,
`frame-ancestors 'none'` (tool-role launch pages served by the API set
per-registration `frame-ancestors`, LTI-05), and subresource integrity on
the entry scripts. Blobs and user files are served from the zone's content
distribution on a separate origin (CAC-03) with `nosniff` and
`Content-Disposition: attachment` for non-renderable types. LTI tools
(LTI-01, CAC-18) open in a new window by default with an "opens in a new
window" warning; a registration that asks for embedding gets an `iframe`
with `sandbox="allow-scripts allow-forms allow-same-origin allow-popups"`,
a minimal `allow` list and a `src` origin matching the registration, and
`postMessage` handlers validate the origin against the registration.

#### Scenario: Imported page with scripts
- **WHEN** a Common Cartridge page contains `<script>` and `onerror` attributes
- **THEN** the sanitiser strips them at render, the CSP would block them if they escaped, and the prepare report (CAC-16) lists what was removed

#### Scenario: Tool attempts top navigation
- **WHEN** an embedded LTI tool sets `top.location`
- **THEN** the sandbox blocks it, the launch continues inside the frame, and the learner's controls remain reachable around it

---

## DynamoDB access patterns

The client owns no item in `facts`, `derived` or `registry`. It appends
facts only through `POST /sync/v1` in the FLS layout (FLS-04, FLS-11) and
reads server state only through each owner's regional API; it never holds
table credentials. Items it reads, by reference:

| Item (owner) | Location | Reached through | Client use |
|---|---|---|---|
| Roster (FLS) | `derived` `T#t#R#<subject>#<scope>` / `HDR` | Sync response `roster` and `advice` (FLS-08, FLS-09) | Vectors, gap fill, refork, registration |
| DeliveryView (CAC) | `derived` `T#t#CS#<course>` / `DV#<cohort>` | `GET /courses/{c}/delivery`, sync `advice.bundles` (CAC-14) | `bundle_hash`, deadlines, time locks |
| ViewHeader, LearnerRow, NMRow (MVA) | `derived` `T#t#V#<module>#<cohort>` / `HDR`, `G#<gen>#L#<subject>`, `NM#<kind>` | `GET /views/*`, `POST /views/{partition}/dominates` (MVA-02, MVA-05, MVA-06) | Progress source decision, gradebook, ranks |
| MarkingQueue, SlotRoster, Calendar, KeyRelease (ACT) | `derived` `T#t#MQ#…`, `T#t#SL#…`, `T#t#CAL#<subject>`, `T#t#KR#<item>#<cohort>` | `activity-api`, `calendar-api`, `GET /keys/release` (ACT-05, ACT-09, ACT-12, ACT-15) | Queues, slots, calendar, released keys |
| Memberships, roles, profile, directory (IDE) | `derived` `T#t#E#<usr>`, `T#t#RL#<usr>`, `T#t#PR#<usr>`, `T#t#DIR` | Session `roles_hint`, `403` responses, profile and directory APIs (IDE-04, IDE-09, IDE-13) | Surface selection, profile, admin search |
| Consent, config, flags (ADM) | `derived` `T#t#CN#<subject>`, `T#t#CFG` | Own `consent.v1` facts; config endpoint (ADM-05, ADM-16) | Telemetry gate; flags hide surfaces only |
| Inbox, threads (COM) | `derived` COM items | Inbox and thread APIs (COM-04, COM-17) | Cached pages with freshness |

**Device-side sizing.** A learner replica holds ~2,400 facts a year (~3 MB
at 1.2 KB, FLS sizing), rows of ~4 KB per module and bundles up to the
ACT-02 budget. An instructor's cohort replica for one module at the cohort
bound is 2,000 learners × ~40 facts × 1.2 KB ≈ 96 MB, so `sync` pulls per
cohort with pagination and the instructor chooses which modules to take
offline. The telemetry buffer is capped at 200 events.

**Hot-partition risk.** None of its own. Client-driven server load is
bounded where it lands: one DeliveryView GetItem per session (CAC), `KR#`
reads at release (ACT), roster reads per sync (FLS). A synchronised launch
(2,000 devices at a school bell) is ~35 API requests/s per cohort, inside
FLS-13 and ADM-04 bounds; the static part lands on CloudFront, and the
client jitters background sync and prefetch by 0–30 s.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `telemetry-ingest` | HTTP API `POST /telemetry/v1` | Java 21 SnapStart, 512 MB | 15 ms | 350 / 800 ms | Session (IDE-03), consent (`T#t#CN#`), schema, scrub, EMF metrics and sampled log (ADM-08); no table write |
| `app-release` | CI pipeline after SEC-01 and UIX gates; EventBridge `fact.folded` for `tenant.v1` with `a11y_*` fields | Java 21 SnapStart, 512 MB | 0.5–5 s | 350 / 800 ms | Uploads the build under `/app/<build_id>/`, sets cache headers, invalidates entry paths, writes per-tenant statements and the conformance report to the zone bucket |
| Device (PWA) | Browser | TypeScript; engine and document workers; sync in the service worker | — | ~30 ms worker start; ≤ 3 s offline cold start | No server cost |

There are no other functions. Every API the client calls belongs to the
capability that owns the data.

## Propagation path

Device side, from an action to what a person sees:

1. A user action becomes a fact: `sync` allocates the next `seq` and stores
   the fact in one IndexedDB transaction (FLS-03); drafts stay in `drafts`
   until their fact is written (ACT-01); Automerge edits become
   `am.change.v1` facts on the idle cadence (UIX-17).
2. The engine worker folds the new fact into the profile's local view for
   its `(subject, scope)` (UIX-08); the document worker applies changes to
   `LocalDoc`. React re-renders from the derived view, labelled "computed on
   this device" (ACT-17).
3. The service-worker sync agent pushes the outbox in `seq` order, pulls by
   vector, applies roster advice, uploads blobs, and fetches bundles from
   CloudFront and released keys from `GET /keys/release` (ACT-03, CAC-14,
   ACT-05), never on the interaction path.
4. Pulled facts and rows fold into the stores; the dominance check decides
   row versus local derivation per value (MVA-05, ACT-17); the status live
   region announces the freshness change (UIX-04).
5. Scrubbed telemetry is buffered and, under consent, flushed on the sync
   cadence to `telemetry-ingest`, which emits metrics (UIX-12).

Server side: the CI pipeline → `app-release` → S3 `/app/<build_id>/` →
CloudFront → service-worker install and activation (UIX-13); `tenant.v1`
folds carrying `a11y_*` fields → EventBridge `fact.folded` → `app-release`
→ regenerated statement (UIX-07). No Streams, SQS or Step Functions are
used by this capability.

## Cost model

Prices marked † are not in project.md §6.1 and are assumptions.

| Component | L10k | 1M | Basis |
|---|---|---|---|
| App bundle delivery and entry checks | 15 k devices × 2 releases × ~2 MB changed = 60 GB, ~1.5 M requests; 300 k launches × 3 entry requests × 5 KB = 4.5 GB → **$0** (free tier) | ≈ $700 | 6.5 TB − 1 TB free × $0.085/GB ≈ $470; 240 M − 10 M free requests × $0.01 / 10 k † ≈ $230 |
| Build storage, invalidations, statements | 24 builds × 8 MB retained a year ≈ 2.3 GB × $0.023 + 12 k PUTs × $0.005/k; invalidations ≤ 1,000 paths free †; 2 statements × 200 KB → **$0.1** | $0.2 | 100 tenants at 1M |
| `telemetry-ingest` | 300 k sessions × 50% consent × (10% perf + 2% errors) ≈ 18 k requests × $1/M + 18 k × 0.1 s × 0.5 GB = 900 GB-s + 36 MB logs + 9 k RRU → **$0.1** | ≈ $5 | Consent read cached 60 s |
| Telemetry metrics † | ~70 EMF series (region × build × device class × 12 metrics) × $0.30 → **$21** | $21 | Bounded by design; route detail goes to sampled logs |
| `app-release` | 2 releases + ~50 tenant-field folds × 3 s × 0.5 GB → **$0** | $0.1 | |
| CI browser matrix † | ~200 merges × 45 min (Chromium, Firefox, WebKit; axe sweep; golden vectors; Lighthouse; size checks) = 9,000 min × $0.008 + device farm 2 releases × 4 devices × 30 min × $0.17 → **$113** | $113 | Independent of learner count |
| Assistive-technology licences † | JAWS and device-lab subscriptions → **$100** | $100 | People time for the manual plan and research is excluded |
| **Total** | **≈ $0.2 AWS; ≈ $235 with † lines** | ≈ $705 AWS; ≈ $940 with † | Bundle delivery is the only line that scales with learners |

## Standards conformance

| Standard | Role | Target | In scope | Out of scope and why | Eventual-consistency conflict and resolution |
|---|---|---|---|---|---|
| WCAG 2.2 | Conformance target for every UI | Level AA as a release gate; 2.4.13, 3.3.9 and 2.2.5 adopted from AAA | Learner, instructor, author, admin, consumer-realm and operator surfaces; native wrappers; QTI renderings | Other AAA criteria; third-party LTI tool UIs (disclosed, Tension 4); authored content beyond CAC-16's checks | Values change under the user as facts fold: announced through one coalesced status region, focus never moved (4.1.3, 3.2.1); staleness is text, never colour; time limits are advisory so 2.2.1 is met by `extension.v1` |
| EN 301 549 (v3.2.1) | Procurement reference | Clauses 9, 11 and 12 reported per release | The conformance report generated from the ConformanceRecord (UIX-07) | Hardware and two-way-voice clauses; not applicable | None |
| UK Public Sector Bodies (Websites and Mobile Applications) Accessibility Regulations 2018 | Legal reference for public-sector tenants | Statement in the model format per tenant, reviewed per release | Statement generation, known-issue disclosure, contact and enforcement text | The tenant's own organisational duties (complaint handling) | None |
| WAI-ARIA 1.2 and the ARIA Authoring Practices Guide | Semantics and interaction patterns | Every pattern used follows the APG; ARIA only where HTML lacks the semantics | Design-system primitives, QTI renderings, editor | Patterns without APG guidance are designed and tested case by case | None |
| QTI 3.0 accessibility (catalogs, APIP-derived alternatives; AfA PNP) | Delivery system rendering alternatives | Catalog alternatives rendered per profile preference | `qti-catalog-info`, `data-catalog-idref` for spoken, glossary, braille, sign and simplified alternatives | AfA 3.0 PNP import and export (roadmap; preferences are `profile.v1` fields today); PCI accessibility (PCI is roadmap in DRV-04) | Preferences are LWW profile facts and may lag a device by replication; the device applies its own replica's value |
| ECMAScript determinism subset (internal profile, DRV-03) | Engine and `sync` packages | Lint-enforced; golden vectors on V8, SpiderMonkey, JavaScriptCore and GraalJS | Arithmetic, ordering, seeded randomness, string handling | Everything presentation-side, which may use `Intl` freely | Divergence would show as a `client_mark` mismatch (DRV-14) before it showed in a view |

## Known Tensions

1. **Drag-and-drop QTI interactions versus 2.5.7.** Where it breaks: order,
   associate, gap match, graphic, hotspot, select-point and slider
   interactions are pointer-driven in most delivery engines, and 2.5.7
   requires a single-pointer alternative for every drag. Symptom: an author
   wants an interaction the palette does not offer. Options: (a) ship
   select-then-place and keyboard paths per interaction so the drag is an
   enhancement (the classification table); (b) hide interactions until their
   rendering ships (`accessibility = pending`); (c) mark such items
   `server_only` so the device never renders them, which changes nothing
   about the rendering and is rejected. Recommendation: (a) for every
   `ready` interaction, (b) for the four graphic and point interactions
   until a release passes the gate (known-tensions §21, T-48).
2. **GraalJS versus browser engine determinism.** Where it breaks: one
   TypeScript engine runs on four JavaScript engines; ECMAScript fixes
   number and string semantics, but `Math`, `Intl`, `Date` and
   regular-expression corners differ. Symptom: a device mark differs from
   the server mark for the same facts. Options: (a) the lint-enforced subset
   plus the golden-vector matrix on every release; (b) server-only marking
   for constructs that ever diverged; (c) the TeaVM fallback of ADR-001.
   Recommendation: (a); the residual is detected by DRV-14 and the device
   shows the server value on convergence (ACT-04).
3. **Offline data on shared devices.** Where it breaks: a classroom tablet
   holds several profiles in one browser origin, and a non-extractable
   WebCrypto key protects data at rest, not against a co-user with developer
   tools on the same origin. Symptom: a determined co-user could reach
   another profile's replica; an instructor's purged replica must be
   re-pulled after a day away (T-50). Options: (a) per-profile keys,
   session-bound keys and idle purge for instructors, accepted risk for
   learners (UIX-09, SEC-09); (b) a tenant `shared_device_mode` that purges
   learner replicas at sign-out and saves drafts as facts on every item
   navigation (ACT Known Tension 5); (c) OS-level user accounts per learner,
   outside the product's control. Recommendation: (a) with (b) as the tenant
   option for classroom devices, stated in the CAF mapping.
4. **Accessibility of third-party LTI tools in iframes.** Where it breaks:
   a tool's UI is the vendor's, cannot be gated, and inside an `iframe`
   inherits none of the design system. Symptom: a conformant LMS embeds a
   non-conformant activity. Options: (a) the statement discloses embedded
   tools and the registration carries the vendor's accessibility attestation
   shown to authors (known-tensions §21, T-49); (b) open tools in a new
   window by default so assistive technology treats them as separate pages
   (UIX-18); (c) a tenant flag refusing tools without an attestation.
   Recommendation: (a) and (b) always, (c) as an opt-in; the statement must
   say the guarantee cannot be given.
5. **Performance budgets versus Automerge and engine bundle sizes.** Where
   it breaks: the engine (300 KB) and the Automerge core (~0.7 MB
   compressed †) together exceed the 200 KB learner shell several times
   over. Symptom: slow first load on the reference device if either is in
   the critical path. Options: (a) load the engine after first paint and
   Automerge only on document routes, reading published pages from the
   materialised bundle blob rather than the document; (b) a lighter draft
   representation for single-device drafts, losing multi-device merge; (c)
   raise the shell budget. Recommendation: (a) with per-route budgets in CI
   (UIX-11); (b) and (c) rejected.
6. **400% zoom versus dense instructor grids.** Where it breaks: a
   2,000-row gradebook with hundreds of columns cannot reflow into 320 CSS
   px without two-dimensional scrolling, which 1.4.10 permits for data
   tables but which leaves the freshness block off-screen. Symptom: a
   magnifier user loses the staleness context the model relies on. Options:
   (a) a per-learner card list below 640 CSS px with the freshness block
   pinned first; (b) a virtualised grid with a sticky freshness column; (c)
   a zoom-specific summary view. Recommendation: (a) as the reflow layout
   and (b) for the grid, tested in the UIX-06 zoom pass.
