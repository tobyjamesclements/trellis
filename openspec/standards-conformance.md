# Standards Conformance Matrix

For each 1EdTech (and adjacent) standard: the roles Trellis plays, the
conformance level or certification targeted, what is out of scope and why,
and where the eventually consistent, derived-mark model conflicts with the
standard's assumptions and how the conflict is resolved. Detail lives in
the owning spec.

| Standard | Role(s) | Target | Out of scope (why) | Model conflict → resolution | Spec |
|---|---|---|---|---|---|
| **LTI 1.3 Core** | Platform; Tool | 1EdTech certification, both roles | LTI 1.1/2.0 (deprecated, OAuth 1.0a); `lti1p1` migration claim pass-through only | Nonce single-use is per region → callbacks routed to issuing region; identifiers made deterministic (client_id, deployment_id, course ids) so concurrent creation converges | lti-interop LTI-01…07, 14, 16, 17 |
| **LTI Advantage — Names and Role Provisioning 2.0** | Platform; Tool | Certification, both | Per-launch real-time pull as Tool (cost) | `differences` cursors are region- and epoch-scoped; full membership on mismatch | LTI-08 |
| **LTI Advantage — Assignment and Grade Services 2.0** | Platform; Tool | Certification, both | Reading results from the platform as Tool | **Write-back**: single home-region writer, 60 s stability window, ledger-continued monotone timestamps, epoch on failover; **Platform results**: region-local read-your-writes; older-timestamp scores stored not rejected | LTI-09…12, 18, 19; KT §1 |
| **LTI Advantage — Deep Linking 2.0** | Platform; Tool | Certification, both | Advanced presentation hints | None; content items become structure facts | LTI-13 |
| **LTI Dynamic Registration** | Platform; Tool | Certification, both | Auto-activation (security) | Deterministic `client_id` | LTI-15 |
| **LTI Submission Review** | Tool | Implemented | Platform role | None | LTI-20 |
| **LTI Course Groups / Platform Notification Service** | — | Roadmap | Cohort semantics and tool adoption | — | LTI |
| **1EdTech Security Framework 1.1** | Client and server | Conformant | — | JWKS lists every active key; rotation overlap ≥ replication lag + cache TTL; tokens stateless and verifiable in any region | IDE-03, LTI-03, DIO-19 |
| **OneRoster 1.2 — Rostering (REST)** | Consumer; Provider | Certification: Rostering Consumer (Core); Rostering Provider | Resources service (CC covers content); rostering write endpoints (SIS is the source) | Provider `dateLastModified` is region-relative → served from home region with epoch; SIS-first learners get deterministic ids | DIO-01, 03, 16 |
| **OneRoster 1.2 — Rostering (CSV)** | Consumer | Certification: CSV Consumer | CSV rostering export | Paced idempotent import | DIO-02 |
| **OneRoster 1.2 — Gradebook** | Provider (pull); Push to SIS; consumer of SIS writes | Certification: Gradebook Provider; Push/consumer where offered | External assessment lineitems beyond `results` | Results are derived and change after "fully graded" → deltas re-deliver, monotone modification time from ledger, SIS locks surface in reconciliation, `metadata.trellis.vector` | DIO-04…06, 17; KT §1 |
| **Caliper Analytics 1.2** | Sensor; Endpoint | Certification: Sensor (Basic, Session, ToolLaunch, ToolUse, Assessment, AssessmentItem, Assignable, Grading, Feedback, Forum, Reading, Navigation, Survey); Endpoint (Basic, Assessment, Session) | Annotation, Media, Search, Resource Management (no features to project) | **Projection, not the log**: deterministic event ids, `eventTime` = claimed device time with `trellis:syncTime`; GradeEvents only when stable and re-emitted on change; voids emit no retraction; home-region emission; duplicates deduplicable | DIO-07…10, `caliper-mapping.md` |
| **QTI 3.0** | Delivery (device and server); Authoring (item bank, import/export) | Core level delivery with template processing; Core authoring | Adaptive items, PCI/custom interactions, `customOperator` (non-deterministic), drawing/media marking | Response processing runs on device under an explicit operator subset; unsupported constructs classified `server_or_human` at publish; seeded randomness for reproducibility | DRV-04, `qti-profile.md`, CAC-05…08, ACT |
| **Common Cartridge 1.1/1.2/1.3** | Import; Export (1.3) | Certification: CC 1.3 import/export | CC 1.0; `cc:authorizations` (no DRM) | Idempotent import id; export at publish vector; QTI 3.0→1.2.1 lossy with report | DIO-11…13 |
| **Thin Common Cartridge 1.3** | Import; Export | Certification | — | — | DIO-11, 12 |
| **CASE 1.0** | Consumer | Certification: Consumer | Provider role (no product need to serve frameworks initially) | Mastery is non-monotone → recomputed over the union at a vector, never merged | CRD-02, 04 |
| **Open Badges 3.0** | Issuer (incl. OB 3.0 API) | Certification: Issuer | Host, Displayer (roadmap); OB 2.0 legacy export; endorsements | Issuance is a gated side effect (24 h window, home region, deterministic credential id); revocation status list eventually consistent across regions | CRD-06…09 |
| **CLR 2.0** | Issuer | Certification: Issuer | Host | As OB 3.0 | CRD |
| **Edu-API 1.0** | Provider (read) | Conformance to core read model; certification when offered | Write operations | As OneRoster provider (home region, epoch) | DIO-14 |
| **OpenID Connect Core / OAuth 2.0** | RP (login); OP for the consumer realm (soft organisations, external guests); AS for LTI services and OB3 API | Conformant; Basic OP profile with PKCE and pairwise subjects | General-purpose OP for third parties | Single-use state and codes per region; stateless tokens | IDE-02, 03, 20, 23; LTI-03 |
| **SCIM 2.0 (RFC 7643, RFC 7644)** | Service provider (strict organisations) | Core schema; Users, Groups, filter, PATCH, pagination; Entra ID and Okta interoperability | Bulk, `/Me` | Write-through identity index for read-your-writes; deactivation propagates with replication lag | DIO-20, IDE-22 |
| **SAML 2.0** | SP via Cognito bridge | Web Browser SSO through Cognito | Native SP on Lambda | Single-region bridge; documented outage behaviour | IDE-02 |
| **W3C Verifiable Credentials DM 2.0 / BitstringStatusList** | Issuer | As required by OB 3.0 | Data Integrity proofs (optional later; VC-JWT ES256 first) | Status list lag | CRD-06, 09 |
| **WCAG 2.2 Level AA** (with EN 301 549 and the UK Public Sector Bodies Accessibility Regulations 2018; WAI-ARIA 1.2 and the APG) | Every user interface; authored-content checks; accessibility statement per tenant | AA as a release gate (ADR-025) | AAA criteria except those adopted (2.4.13 Focus Appearance) | Embedded LTI tools cannot be guaranteed (disclosed); pointer-only QTI interactions hidden until accessible renderings exist | UIX-03…07, CAC-16, ACT-19 |
| **NCSC Cyber Assessment Framework** | Assurance framework for the operating organisation; the system supplies technical controls and evidence | Every technical contributing outcome at Achieved; organisational outcomes supported (ADR-024) | Ratings are claims the operating organisation substantiates | Sampled logs replaced by unsampled immutable security logging; untrusted devices stated as accepted risk (B3.d); eventually consistent authorisation stated (B2) | SEC, `security-and-assurance/caf-mapping.md` |
| **NCSC Cloud Security Principles** | Customer-facing statement of the service's security properties | All 14 principles addressed in the evidence pack | — | — | SEC-11 |
| **xAPI / LRS** | — | Out of scope | Caliper is the analytics surface; an xAPI projection is a candidate later change | — | DIO |
| **SCORM 1.2 / 2004** | — | Out of scope | Stateful runtime and mutable CMI model do not fit; deliver via external LTI player | — | project.md |

## Certification sequencing

1. LTI 1.3 Core + Advantage (Tool role first: the fastest route to market as
   a supplement inside existing LMSs), then Platform role.
2. OneRoster 1.2 Rostering Consumer (REST + CSV), then Gradebook Provider.
3. Caliper 1.2 Sensor, then Endpoint.
4. Common Cartridge 1.3 import, then export; Thin CC alongside.
5. QTI 3.0 delivery conformance testing with the engine profile.
6. CASE 1.0 Consumer; Open Badges 3.0 Issuer; CLR 2.0 Issuer.
7. Edu-API 1.0 provider.
