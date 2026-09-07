# Known Tensions

Where the model genuinely breaks, or bends far enough that the user notices.
Each entry states the break plainly, the user-visible symptom, the options
considered, and a recommendation. Per-capability specs carry shorter
versions that point here. The trade-off register (`tradeoffs.md`) lists the
smaller, accepted trades in tabular form.

The three the brief predicted are §1 (gradebook write-back), §3 (enrolment
cap) and §4 (answer-key exposure). They are real. The rest were found while
designing inside the constraints.

---

## 1. AGS score write-back and OneRoster gradebook sync

**The break.** LTI Assignment and Grade Services and OneRoster Gradebook
both assume one authoritative gradebook that a single writer updates with
monotone timestamps, and both let the receiving system treat a grade as
settled. Trellis has none of that: marks are derived, they change when late
facts fold or keys and rubrics are corrected, every region derives
independently at a different vector, and no region can be elected as the
writer by coordination.

**Symptoms if unmitigated.** A platform gradebook showing a stale score
after a correction because the later wall-clock post came from the region
with the older vector. An SIS that missed a correction because its delta
cursor came from a different region. An SIS refusing a corrected grade after
its term lock. Two identical GradeEvents or two score posts during a
failover.

**Options.**

| Option | What it does | Cost | Residual |
|---|---|---|---|
| A. Home-region single writer, stability window, ledger-continued monotone timestamps, epoch on failover | LTI-11, LTI-12, DIO-04, DIO-06, DIO-16 | Write-back is unavailable while the home region is down and unflipped (minutes) | Double post within the flip window (≤ 90 s); stale score until the next post; consumers that ignore the epoch can miss changes across a failover |
| B. Vector digest in AGS `comment` / OneRoster `metadata` | Diagnostic | None | Platforms do not read it; insufficient alone |
| C. No write-back; platform pulls from Trellis (OneRoster, API) | Consistent by construction | Most platforms only support AGS push; adoption cost | Delayed by the consumer's pull cadence |
| D. Post only settled grades (end of term) | Removes churn | Formative feedback invisible in the platform gradebook | Same tension, later |

**Recommendation.** A, with B as a diagnostic in every payload, C offered as
a per-tenant option where the platform supports it, and D as a
per-connection policy (`push_mode = final_only`). Say in documentation and
in the UI that external gradebooks are delayed, eventually consistent
copies and that Trellis is the source of derivation. SIS rejections after a
lock are never retried blindly; they appear in the reconciliation view for
a human (DIO-17).

**What we give up.** Read-your-writes for tools across regions; timeliness
of write-back during a home-region outage; the ability to promise an
external system that a grade is final.

---

## 2. Instructor views can be stale, and staleness looks like missing work

**The break.** Views are region-owned and fold facts as they arrive; a
learner's submission made through region A is invisible in region B's view
for the replication lag, and invisible everywhere while the device is
offline. Nothing in the model can make a view "complete" in an absolute
sense; it can only prove what it includes.

**Symptom.** An instructor chases or penalises a learner whose work is in
transit.

**Options.** (a) Hide the view until "complete": impossible to define.
(b) Show the freshness block, per-row in-transit markers and a dominance
check against the learner's device vector (MVA-02, MVA-05), and require a
confirmation naming the staleness before any punitive action. (c) Read the
freshest of all regions on request (MVA-11).

**Recommendation.** (b) always, (c) on demand. The residual is human.

---

## 3. Enrolment caps, seat limits and slot limits

**The break.** A cap is a global count invariant. Two regions accepting
enrolments concurrently can exceed it; nothing short of a global lock
prevents this. The same holds for choice-activity slots, appointment slots,
group self-selection caps and peer-review allocation counts.

**Symptom.** "I enrolled, and a day later I was waitlisted." For slots: two
learners hold the same 10:00 appointment.

**Options.**

| Option | Behaviour | Trade |
|---|---|---|
| A. Soft cap (default): accept, notify the instructor, never bump | Instructor raises the cap or manually waitlists | Cap is advisory; fine for formative courses |
| B. Hard cap with reconciliation (IDE-06, ACT-09): order by `(sync_hlc, fact_id)`, protect learners who have acted, ask the instructor, wait ≤ 24 h, then waitlist newest unprotected with an apology and alternatives | Bumps are rare, late, explained, reversible | Someone is bumped after being admitted |
| C. Regional seat shares (`cap_shares`): each region admits only its share; no global count needed | No bumping if shares are honoured | Unused share in one region is unavailable in the other until rebalanced hourly |
| D. Home-region-only enrolment | A lock in disguise | Enrolment unavailable during outages, exactly when bursts happen |

**Recommendation.** A by default; B available per cohort; C for tenants
that need hard caps at scale. D is rejected. The protection rule (never bump
a learner who has since submitted work) and the 24-hour human window are
non-negotiable parts of B.

---

## 4. Answer-key exposure

**The break.** Immediate offline feedback requires marking on the device,
which requires the key on the device. The device is untrusted. A learner
can read the key from the bundle.

**Symptom.** A learner "scores 100%" on a formative quiz without learning.
Instructors who expect "answers hidden until the quiz closes" find the
default does not provide it.

**Options.**

| Policy (CAC-09) | Mechanism | Real barrier? | Offline marking? |
|---|---|---|---|
| `immediate` (default) | Key in the bundle | No | Yes |
| `after_submit` | Key delivered after a submit fact | No (modified client) | Yes, after submit |
| `time_locked` | Key encrypted under a per-(item, cohort) release key the server releases after the reveal HLC | Yes, until reveal | No; deferred until the device fetches the release key |
| `server_only` | Key never leaves the server; server-side derivation only | Yes | No |

Also considered and rejected: obfuscation of keys in the bundle (security
theatre), server-side marking by default (kills the product), proctoring or
lockdown clients (non-goal), homomorphic marking (not deliverable).

**Recommendation.** `immediate` by default with the four policies exposed
per item and activity, and plain UI copy stating that only `time_locked`
and `server_only` are barriers. Trellis is formative; the answer key is
part of the learning material. Item statistics are always computed from
server derivations (DRV-14), so tampering does not distort cohort
analytics beyond the tampering learner's own row.

---

## 5. Right to erasure versus a grow-only log

**The break.** Facts cannot be deleted without tombstone problems, and
backups keep them for 35 days regardless.

**Symptom.** A learner asks to be forgotten; the log still contains their
facts.

**Options.** (a) Physical deletion plus sweeps: leaves backups, races
replication. (b) Crypto-shredding: destroy per-subject data keys; bodies
become unreadable everywhere including backups; plaintext metadata remains
(ADM-11, ADR-007, ADR-022). (c) Both.

**Recommendation.** (c): shred keys immediately, recompute views, then
physically delete the subject's items and blobs as a supplementary sweep
after the replication window. The residual is a pseudonymous activity trace
(ids, item ids, timestamps) whose link to a person is itself destroyed.
State this in the privacy notice. Retention is per subject because keys are
per subject; per-course deletion voids and shreds blobs but cannot remove
inline bodies until the subject's key expires.

---

## 6. Non-monotone alerts cannot be un-sent

**The break.** At-risk flags, completion notifications and badge awards are
non-monotone: a late fact can reverse them. An email or a signed credential
cannot be recalled.

**Symptom.** "You are at risk" sent to a learner whose work was in transit.
A badge issued, then the qualifying submission voided.

**Options.** (a) Send immediately and apologise later. (b) Stability window
(MVA-08): fire only after the predicate has held for `W` at a dominating
vector with no new facts for the subject; 5 min for notifications, 24 h for
credentials. (c) Never automate; instructors send manually.

**Recommendation.** (b), with `W` exposed as tenant policy and never zero,
plus revocation (CRD-09) and a follow-up notification as the apology path
when a reversal still happens. (c) is available as a policy for tenants that
prefer it.

---

## 7. Duplicate side effects during home-region failover

**The break.** Only the home region emits; a failover flips it by a registry
fact that replicates asynchronously and is cached for up to 60 s. For that
window both regions may believe they are home.

**Symptom.** Two copies of an email; two AGS posts with the same score; two
Caliper envelopes with identical event ids.

**Options.** (a) Accept the window (≤ 90 s target). (b) Make the old home
region stop emitting before the flip when reachable (ADM-03 does this).
(c) Global ledger check before every send: still a race without cross-region
conditional writes.

**Recommendation.** (a) plus (b); deterministic ids let careful consumers
deduplicate; the ledger makes duplicates auditable.

---

## 8. Identity duplication and email non-uniqueness

**The break.** No global uniqueness for emails or principals.

**Symptom.** Two records for one person; two rows in a cohort view; an
account chooser at login.

**Options and recommendation.** Deterministic principal ids wherever an
external identifier exists (OIDC/SAML `sub`, SIS `sourcedId`, LTI `sub`)
remove the race for federated users (IDE-01). Email-only sign-ups can still
duplicate and are merged automatically by `merge.v1` when both claims are
verified (IDE-11), with a reversible path. Accept the transient double row.

---

## 9. Attempt numbers, one-submission-per-item and time limits

**The break.** Attempt numbering is claimed by the device; two offline
devices claim the same number. Time limits and attempt caps cannot be
enforced on an untrusted client.

**Symptom.** "It said 3 attempts and I have 4." A quiz with a 20-minute
limit answered over an hour.

**Recommendation.** Never reject (ADR-008). Derivation orders duplicates
deterministically and applies the attempt policy (`highest_n` reproduces a
cap). Over-time attempts are flagged (`elapsed_ms`) for the instructor, and
formative policy ignores them by default. Where a tenant needs real
enforcement, that activity belongs in an external proctored tool via LTI.

---

## 10. Concurrent authoring and publish conflicts

**The break.** Course structure is LWW per property by HLC; two editors
changing the same property concurrently keep the later one. Two publishes
in two regions both stand; the derived "current" is the later.

**Symptom.** "My change disappeared" (it is in history); "my publish was
replaced two seconds later."

**Recommendation.** Keep LWW per property with full history and a visible
conflict notice to the losing editor (CAC-12); defer a sequence CRDT for
collaborative editing to a later change because concurrent editing of the
same property is rare in course authoring and a CRDT would need to live as
op facts anyway.

---

## 11. Nonce, state and magic-link replay across regions

**The break.** Single-use tokens are enforced per region.

**Symptom.** A replayed launch or magic link within its lifetime creates a
second session for the same person.

**Recommendation.** Embed the issuing region in `state` and redirect
callbacks there (LTI-07, IDE Tension 5); accept the residual when that
region is unhealthy. The gain for an attacker is a session for a user who
already has one; there is no escalation.

---

## 12. Authorisation is eventually consistent

**The break.** Role revocation and unenrolment are facts that replicate
asynchronously; a region may honour a revoked role for seconds.

**Recommendation.** Accept; flag facts written by a writer who was
unauthorised at fold time (IDE-09) so an instructor can void them. Nothing
becomes readable that was not already readable moments earlier.

---

## 13. Replication interruption: regions diverge for as long as it lasts

**The break.** During a partition between regions, each region keeps
accepting facts and serving its own views. Instructors in different regions
see different truths; learners see their own work reflected only in the
region they synced to.

**Symptom.** "The dashboard in the office shows 40 submissions; my
colleague sees 38."

**Recommendation.** This is the availability choice. Show the freshness
block and the replication-lag banner (MVA-14); let anti-entropy repair the
fact sets when the partition heals (FLS-14); never merge views. Side effects
keep flowing only from the home region, so nothing is doubled.

---

## 14. Restore is a union, and that is a feature with a caveat

**The break.** Restoring a region's table from PITR produces a new table
outside the global table group; re-ingesting its facts into the live table
is a union (ADM-10). Facts that were legitimately shredded or erased between
the backup and the restore would be resurrected by a naive re-import.

**Recommendation.** The re-import step consults erasure and shred facts
(which are themselves in the live log) and skips subjects and facts they
name; the erasure sweep re-runs after any restore.

---

## 15. Cost is dominated by things the consistency model does not touch

**The observation.** At L10k the whole platform costs on the order of
$100–150 per month for two regions, and the biggest single lines are email
(SES), the fixed zone floor, and derived-table writes. Content egress is
free within CloudFront's 1 TB tier and becomes the dominant line above
~20,000 learners. None of this is a consistency tension, but it is worth
saying that the design's cost is not where intuition puts it (in the
multi-region database).

**Recommendation.** Keep video external, batch folds, sample logs, and
measure "cost per active learner" monthly (ADM-15).
