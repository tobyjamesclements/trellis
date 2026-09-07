# Trade-off Register

What was given up, what the user sees, and what the mitigation or apology
path is. Entries reference the owning spec and, where the trade is large,
the section of `known-tensions.md` (KT §n). Severity: **H** the user will
notice regularly; **M** noticed occasionally; **L** rare or invisible.

| # | Given up | User-visible symptom | Mitigation / apology path | Owner | Sev |
|---|---|---|---|---|---|
| T-01 | Authoritative, settled grades | A grade can change after it was shown, exported or written back | Provenance and explain (DRV-15); stability windows before egress (MVA-08); re-post with later timestamp (LTI-11, DIO-06); reconciliation views (DIO-17, LTI-19) | DRV, LTI, DIO | H (KT §1) |
| T-02 | Read-your-writes across regions | A tool or SIS reading through another region sees the old value for seconds | DNS affinity; epoch header; region-local strongly consistent reads (LTI-09, MVA-16) | LTI, DIO, MVA | M (KT §1) |
| T-03 | A complete cohort view | Instructor sees work "missing" that is in transit or offline | Freshness block, in-transit markers, dominance check, confirmation before punitive actions (MVA-02, MVA-05) | MVA | H (KT §2) |
| T-04 | Enforced enrolment caps | Over-cap admissions; possible later waitlisting | Soft cap default; hard-cap reconciliation with protection rule, 24 h instructor window, apology with alternatives (IDE-06) | IDE | M (KT §3) |
| T-05 | Enforced slot and seat limits (choice, appointments, group caps) | Two learners hold one slot | Same workflow shape as T-04 (ACT-09) | ACT | M (KT §3) |
| T-06 | Hidden answer keys by default | Learners can read keys from bundles | Visibility policies; only `time_locked` and `server_only` are barriers (CAC-09); server-derived statistics (DRV-14) | CAC, DRV | H (KT §4) |
| T-07 | Enforced time limits and attempt caps | Over-time and over-limit attempts exist | Flag `elapsed_ms`, policy `highest_n`, instructor view; LTI to proctored tools where enforcement is required (ACT-06) | ACT | M (KT §9) |
| T-08 | One submission per item | Duplicate attempt numbers from two devices | Deterministic ordering and attempt policy (DRV-06); `duplicate_attempts` shown | DRV | L (KT §9) |
| T-09 | Physical deletion for erasure | Pseudonymous metadata trace remains after erasure | Crypto-shredding + supplementary sweep; privacy notice (ADM-11, ADR-007) | ADM | M (KT §5) |
| T-10 | Per-course data retention | "Delete this course's learner data" cannot remove inline bodies until subject keys expire | Void + blob deletion for course scope; per-subject retention (ADM retention) | ADM | L (KT §5) |
| T-11 | Recallable notifications | An at-risk email or completion notice can be wrong after a late fact | Stability windows (MVA-08); cool-down (MVA-09); follow-up notification | MVA, COM | M (KT §6) |
| T-12 | Un-issuable credentials | A badge may be awarded then invalidated | 24 h window; revocation via status list; learner-facing explanation (CRD-06, CRD-09) | CRD | M (KT §6) |
| T-13 | Exactly-once side effects | Duplicate email / score post / Caliper envelope during home-region flip | Deterministic ids; sent ledger; ≤ 90 s window (ADM-03, ADR-012) | ADM, COM, LTI, DIO | L (KT §7) |
| T-14 | Egress during home-region outage | No emails, score posts, SIS pushes until failover completes | Failover workflow (minutes); queued intents drain after flip | ADM | M (KT §7) |
| T-15 | Unique emails and single principal per person | Transient duplicate accounts; "we merged your records" | Deterministic ids for federated identities; auto-merge for verified emails; reversible (IDE-01, IDE-11) | IDE | L (KT §8) |
| T-16 | Immediate role revocation | A revoked role works elsewhere for seconds | Flag `writer_unauthorised_at_fold`; void (IDE-09) | IDE | L (KT §12) |
| T-17 | Global single-use nonces and magic links | Replay within lifetime creates a second session | Route callbacks to issuing region; accept residual (LTI-07, IDE-02) | LTI, IDE | L (KT §11) |
| T-18 | SAML login availability in all regions | SAML tenants cannot log in during a home-region outage; sessions continue | Status page; per-region Cognito pools on request; OIDC preferred (IDE-02) | IDE | M |
| T-19 | Concurrent editing without loss | A concurrent edit to the same property is superseded (kept in history) | Visible conflict notice; restore from history (CAC-12) | CAC | L (KT §10) |
| T-20 | Publish atomicity across regions | Two publishes both stand; the later wins | Losing editor notified; both versions retained (CAC-12) | CAC | L (KT §10) |
| T-21 | Sticky completion | A void can un-complete an activity | Client shows the transition and reason; completion notifications gated (DRV-11, COM-07) | DRV | L |
| T-22 | Immediate durability acknowledgement under throttling | "Received, confirming" instead of "saved" during bursts | SQS overflow; roster confirmation on next sync (FLS-13) | FLS | L |
| T-23 | Envelope agreement across regions | Same fact `late` in one region, not in the other, for seconds near a deadline | `grace(24h)` default; envelope never authoritative (FLS Known Tension 1) | FLS | L |
| T-24 | Stream integrity against buggy clients | A device that reuses a seq with different content loses one fact to LWW | Hash chain detection; device re-push (FLS-03) | FLS | L |
| T-25 | Views that never admit holes | Abandoned device gaps show as `has_hole` | 30-day abandonment; hole closes if the device returns (FLS-09, MVA-17) | FLS, MVA | L |
| T-26 | Cross-region view agreement during partition | Different instructors see different numbers until replication heals | Freshness block; replication banner; anti-entropy (MVA-14, FLS-14) | MVA | M (KT §13) |
| T-27 | Delta-sync continuity across failover | SIS/tools must full-sync after an epoch bump | Documented; `409 epoch_changed` (DIO-16) | DIO | M (KT §1) |
| T-28 | Retracting Caliper events | Voids emit no retraction; a later GradeEvent follows | `trellis:voidedBy` extension; documented projection differences (DIO-08) | DIO | L |
| T-29 | Lossless Common Cartridge round-trip | QTI 3.0-only items degrade on CC 1.3 export | Export report; Trellis-native package for Trellis-to-Trellis copy (DIO-12) | DIO | L |
| T-30 | Full-text search everywhere | No cross-course or cross-tenant search; forum search is bounded | Prebuilt course indexes; per-forum indexes (ADR-016) | CAC, COM | M |
| T-31 | Warm, instant first response after idle | 300–900 ms cold start on the first sync or launch after idle | SnapStart; Rust for hot paths; rewrite rather than keep warm (ADR-001) | all | L |
| T-32 | Unbounded cohorts | Classes above 2,000 appear as sections | Sub-cohorts; course-level fold (ADR-019, IDE-07) | IDE, MVA | L |
| T-33 | Cross-zone identity | A learner in tenants in two zones has two identities | Documented; no federation across zones (ADR-013) | ADM | L |
| T-34 | Hosted video | Large media must be external | LTI/URL players; egress guidance (CAC) | CAC | M |
| T-35 | Idle cost of zero | Fixed floor per zone (~$60/month) | Kept small; documented (ADM-15) | ADM | L |
| T-36 | Restore without resurrection | A naive PITR re-import could resurrect erased or shredded facts | Re-import consults erasure/shred facts; sweep re-runs (ADM-10, KT §14) | ADM | L |
| T-37 | SIS as sole enrolment authority without surprises | SIS removes an active learner | Applied but flagged and reversible; facts retained (DIO-18) | DIO | L |
| T-38 | Immediate at-risk alerts | 5-minute delay; 24 h for credentials | Tenant policy; never zero (MVA-08) | MVA | L |
| T-39 | Locked forums that refuse posts | Posts from stale clients after lock are accepted and flagged | Moderator void (COM) | COM | L |
| T-40 | Hidden Q&A answers against a modified client | A modified client can request hidden answers | Server serves from derived state per policy; accepted residual (COM) | COM | L |
