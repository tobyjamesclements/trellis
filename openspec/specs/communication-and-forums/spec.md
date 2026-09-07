# Communication and Forums Specification

Capability ID prefix: **COM**

## Purpose

This capability covers what Moodle files under forums and messaging: forums
(standard, Q&A, single simple discussion, blog-like), announcements, direct
messages and group conversations, ratings, subscriptions, moderation,
notifications over three channels (in-app, web push, email) and daily or
weekly digests. Every user action is a fact. Every thread, thread list,
inbox, feed, unread count, subscriber set, moderation queue and search index
is a region-owned derived view. Every email and push message is a gated side
effect emitted only by the tenant's home region and recorded in the sent
ledger. Nothing here is authority except the facts.

## Consistency boundary

Three consistency classes coexist and are never mixed in one item.

1. **Facts.** `post.v1`, `post.edit.v1`, `rating.v1`, `subscribe.v1`,
   `report.v1`, `forum.policy.v1`, `read.v1`, `msg.v1`, `conv.v1`,
   `announce.v1`, `notify.pref.v1`, `push.sub.v1`, `notify.unsub.v1`,
   `notify.delivery.v1` and `void.v1` are immutable, content-addressed items
   in `facts` under FLS-01 to FLS-04; union is the merge (FLS-02). A post
   exists in a region the moment it is written or replicated there, whether
   or not the thread it belongs to has arrived.
2. **Views.** Thread trees, thread lists, inboxes, mailboxes, feeds,
   subscriber sets, moderation queues, search indexes, preference and
   suppression state are derived per region (MVA-01), stamped with the
   vector they were folded at (MVA-02) and replaced wholesale on recompute
   (MVA-12). Two regions' views may differ; the difference is a freshness
   statement, never a conflict to resolve.
3. **Side effects.** Email and web push are emitted only by the home region
   (project.md §4.8), keyed by an idempotency key in the region-owned sent
   ledger, coalesced for monotone triggers and gated behind MVA-08 intents
   for non-monotone triggers. The in-app inbox is a view, not a side effect,
   and is therefore derived in every region.

Every rule Moodle enforces as a database constraint (one root post in a
single-discussion forum, no posts after lock, post-before-you-see in Q&A,
posting rate limits, daily notification caps, SES send quotas) is here a
visibility rule evaluated over derived state on read, a flag on an accepted
fact, or a queueing delay. None is a global invariant.

## Domain model

```
Forum        activity in the course structure (CAC-01 `struct.v1`, kind = forum);
             settings are the forum block of `policy.v1` (CAC-10):
             { type: standard|qna|single|blog, group_mode: none|separate|visible,
               subscription: optional|forced|auto|disabled, anonymity: off|optional|forced,
               rating: {scale, roles, aggregate: sum|count|mean|max, until?},
               qna_reveal_delay: 30m, word_filters: [{pattern, action: flag|hold}],
               post_rate: {n, per}, digest_default: none|daily|weekly, max_depth: 8 }
Partition    (tenant, `_forum#<id>`, cohort); cohort = `_all` when group_mode = none
Thread       a root `post.v1` (no parent) plus the tree of replies reachable by `refs`
ThreadNode   { fact_id, stream, seq, sync_hlc, device_hlc, author_ref, anonymous,
               current: {text | body_ref, attachments, edit_fact_id}, edits[],
               rating: {sum, count, max}, removed: null | {by_role, void_fact_id},
               flags[] ⊆ {after_lock, claimed_before_lock, rate, word_filter, held,
                          extra_root, cohort_mismatch, low_content, offline} }
Subscriber   derived per (forum, cohort): subject → immediate | digest | none
Inbox        per recipient: notification items (every region); mailbox items per conversation
Conversation subject `G#conv_<ULID>`; membership intervals derived from `conv.v1`
Outbox       home-region derived items per idempotency key: pending → claimed → sent | failed
SentLedger   region-owned immutable items in `facts` (FLS pattern 7), one per
             (trigger fact_id | intent_id | digest period, channel, recipient)
```

### Fact bodies

```
post.v1          { thread_root: fact_id|null, parent: fact_id|null, subject_line?, text | body_ref,
                   attachments: [sha256], anonymous: bool }         refs = [parent] or []
                   plaintext metadata: forum_id, cohort, thread_root, parent
post.edit.v1     { target: fact_id, text | body_ref, attachments, reason?, accepted_answer?: fact_id }
rating.v1        { target: fact_id, value: int }                      refs = [target]
subscribe.v1     { target: forum | thread:<fact_id>, mode: immediate | digest | none }
report.v1        { target: fact_id, reason: spam|abuse|off_topic|other, note }
forum.policy.v1  { target: forum | thread:<fact_id> | post:<fact_id>,
                   op: lock|unlock|pin|unpin|hold|release, note }
read.v1          { target: inbox | conv:<id> | forum:<id> | thread:<fact_id>, through_hlc: hlc16 }
msg.v1           { text | body_ref, attachments }   plaintext metadata: recipient | conversation
conv.v1          { op: create|add|remove|leave|rename, members: [usr], name? }
announce.v1      { title, text | body_ref, attachments, cohorts: all | [cohort] }
notify.pref.v1   { channels: {email, push, inapp}, kinds: {post, announcement, message,
                   at_risk, completion, deadline → {email, push}}, digest: none|daily|weekly,
                   quiet_hours: {from, to, tz}, daily_cap: {email, push} }   LWW by HLC per field
push.sub.v1      { endpoint, keys: {p256dh, auth}, expiration?, active: bool }
notify.unsub.v1  { channel | all, kinds | all, token_hash }
notify.delivery.v1 { channel: email|push, outcome: bounce_hard|bounce_soft|complaint|gone|failed,
                     provider_id, address_hash, detail }
```

Derivation rules shared by the views: the effective edit of a post, the
effective rating per `(rater, post)`, the effective subscription per
`(subject, target)`, the effective policy per `(target, attribute)` and the
read-through per `(reader, target)` are each the latest effective fact by
`(sync_hlc, fact_id)` (max-by-HLC, monotone). Text over 4 KB and every
attachment is a content-addressed blob (FLS-12, CAC-03). Forum-scope `refs`
carry `fact_id` only; clients never populate FLS `refs_ptr` for another
author's fact, and the thread view keeps its own `fact_id → (PK, SK)` map,
so no projection exposes an author's PK (this is what makes anonymity hold).

### New fact types (to be merged into fact-types.md)

| Type | Owner | Subject kind | Scope | Writer | PII | Purpose |
|---|---|---|---|---|---|---|
| `forum.policy.v1` | COM | C | `_forum#<id>` | instructor / tutor / `moderator` role (IDE-08) | T | Thread, post or forum moderation state: lock, unlock, pin, unpin, hold, release (max-by-HLC per target attribute) |
| `report.v1` | COM | L (reporter) | `_forum#<id>` | self | P | Report of a post for moderation |
| `read.v1` | COM | L (reader) | `_msg` / `_forum#<id>` | self | P | Read-through marker for a conversation, the notification inbox, a forum or a thread (max-by-HLC) |
| `conv.v1` | COM | G (conversation) | `_msg` | creator / member | P | Group conversation created; membership or name changed |
| `push.sub.v1` | COM | L | `_profile` | self (the subscribing device) | P | Web push (VAPID) subscription for one device |
| `notify.unsub.v1` | COM | L | `_profile` | region system device (home) via signed unsubscribe token | P | Channel or kind unsubscribed from an email link |
| `notify.delivery.v1` | COM | L (recipient) | `_profile` | region system device (home) | P | Delivery outcome from SES or a push service: bounce, complaint, gone, failed |

Registered types reused unchanged: `post.v1`, `post.edit.v1`, `rating.v1`,
`subscribe.v1`, `msg.v1`, `notify.pref.v1`, `announce.v1` (COM), `void.v1`
(FLS), `struct.v1` and `policy.v1` (CAC), `enrol.v1` and `role.v1` (IDE).

---

## Requirements

### Requirement: The system SHALL record every forum post, reply, edit and removal as facts under the author's own key and derive the current text from them [COM-01]

The system SHALL record every forum post, reply, edit and removal as facts
under the author's own key and derive the current text from them. A post is
a `post.v1` fact with `subject = author` and `scope = _forum#<id>`; a reply
names its parent in `refs`. An edit is a `post.edit.v1` superseding fact
targeting the post; the derived current text is the latest effective edit by
`(sync_hlc, fact_id)` and every earlier version stays visible as history.
Removal is a `void.v1` (FLS-07) by the author, a moderator or an admin: the
derived node renders "removed by ⟨actor_role⟩" with no text, its replies stay
attached, and the fact remains in the log, encrypted, until an ADM-12
takedown shreds its body. No API updates a post item in place.

#### Scenario: Reply and edit
- **WHEN** a learner replies to a post and later edits the reply twice
- **THEN** the thread view shows the reply with the second edit's text, `edited = 2` and a history link listing all three facts in HLC order
- **AND** all three facts sit in the learner's stream `(device, learner, _forum#<id>)` and none has been modified

#### Scenario: Moderator removes a post that has replies
- **WHEN** a tutor appends `void.v1 { target: post, actor_role: tutor }`
- **THEN** every view that folds the void shows the node as "removed by tutor" with its replies still in place
- **AND** the post fact is unchanged, still exported with the log (FLS-20), and only a `takedown.v1` (ADM-12) destroys its content

### Requirement: The system SHALL define forums as course-structure activities whose type and behaviour are versioned policy [COM-02]

The system SHALL define forums as course-structure activities whose type and
behaviour are versioned policy. A forum is created by a `struct.v1` operation
of kind `forum` (CAC-01) and configured by the forum block of `policy.v1`
(CAC-10): type (`standard`, `qna`, `single`, `blog`), group mode,
subscription mode, anonymity, rating scale and aggregate, word filters,
posting rate, digest default and maximum depth. A policy change re-derives
the affected views under a new generation (MVA-12); it never migrates them.
The thread view header carries the `policy_version` it was projected under.

#### Scenario: Forum type changed from standard to Q&A
- **WHEN** an editor publishes a policy that changes an existing forum to `qna`
- **THEN** the next generation of every (forum, cohort) view applies Q&A visibility under the new `policy_version` and no post fact changes

#### Scenario: Unknown forum type from a newer editor
- **WHEN** a policy names a forum type this engine version does not know
- **THEN** the view is projected as `standard` with `flags = [unknown_type]` until an engine that understands it is deployed (FLS-15)

### Requirement: The system SHALL assign every forum and message fact to a view partition from its plaintext metadata and never reject a mismatch [COM-03]

The system SHALL assign every forum and message fact to a view partition
from its plaintext metadata and never reject a mismatch. The stream router
(FLS-17) routes `_forum#<id>` facts to SQS FIFO `com-views` with group
`forum#cohort`, taking `cohort` from the fact's metadata (`_all` under
`group_mode = none`) and checking it against the author's membership in the
regional roster (IDE-05); a mismatch routes the fact to the author's actual
cohort with `flags = [cohort_mismatch]`. Course-subject facts
(`forum.policy.v1`, `announce.v1`) fan out to one message per cohort of the
course; `_msg` facts fan out to one message per recipient (group =
`recipient#_msg`); COM `_profile` facts route by subject.

#### Scenario: Learner moved between cohorts
- **WHEN** the `enrol.v1` moving a learner from cohort A to B has not replicated to the region that ingests their reply, whose metadata names A
- **THEN** the reply folds into A's view now, flagged, and into B's view when the roster catches up and B is recomputed; it is never rejected

#### Scenario: Announcement to a three-cohort course
- **WHEN** an instructor appends `announce.v1 { cohorts: all }`
- **THEN** the router enqueues three messages, one per cohort partition, and each cohort's feed and its members' inboxes fold it independently

### Requirement: The system SHALL materialise thread views per (forum, cohort) as region-owned derived items: a tree by refs, ordered by (sync_hlc, fact_id), with a freshness block [COM-04]

The system SHALL materialise thread views per (forum, cohort) as
region-owned derived items: a tree by `refs`, ordered by `(sync_hlc,
fact_id)`, with a freshness block. `thread-updater` folds forum facts with
the vector as cursor (MVA-03) into a thread list and one node per post;
siblings are ordered by `(sync_hlc, fact_id)` and stored under a
materialised path so a thread is one range query in display order, and
every response carries the MVA-02 freshness block. A post synced after other
posts in its thread is inserted at its `(sync_hlc, fact_id)` position and
marked "posted offline at ⟨device_hlc⟩, synced ⟨sync_hlc⟩" whenever
`sync_hlc − device_hlc` exceeds 5 minutes. A reply whose parent has not
folded is held as an orphan under a placeholder and re-parented when the
parent arrives. A shredded post (ADM-12) renders as "removed".

#### Scenario: Offline reply synced next morning
- **WHEN** a reply written at 22:10 offline is synced at 08:30
- **THEN** it appears among its siblings at the 08:30 position, marked "posted offline at 22:10, synced 08:30", and the thread's `last_activity_hlc` advances

#### Scenario: Reply arrives before its parent
- **WHEN** a reply replicates from region B before its parent, written on a device that has not yet synced, reaches region A
- **THEN** A's view shows it under "reply to a post not yet synced" and the freshness block names the pending stream
- **AND** when the parent folds, the reply is re-parented in the same batch and the placeholder disappears

#### Scenario: Learner checks that a post is reflected
- **WHEN** the device vector for the learner's forum stream is ahead of the view's cursor row
- **THEN** `POST /views/{partition}/dominates` (MVA-05) lists the stream as behind and the client shows "1 post not yet reflected"

### Requirement: The system SHALL apply forum-type visibility rules as projections over derived state, enforced on read by the server and mirrored by the client [COM-05]

The system SHALL apply forum-type visibility rules as projections over
derived state, enforced on read by the server and mirrored by the client.
In a `qna` forum, a thread's replies are projected to a reader as hidden
(count only, no body, no author) unless the reader is a moderator, the
thread's author, or has an effective `post.v1` in that thread folded in the
serving region's view with `sync_hlc` older than `qna_reveal_delay`. In a
`single` forum the earliest root by `(sync_hlc, fact_id)` is the discussion
and any later root is projected as a reply to it, flagged `extra_root`. In a
`blog` forum the thread list carries full root bodies. A modified client may
request the full thread or push a stub answer: the server serves only what
its derived state permits, and the stub is accepted, never rejected, visible
to moderators, and subject to the reveal delay.

#### Scenario: Learner asks before answering
- **WHEN** a learner without a post in a Q&A thread requests it
- **THEN** the response carries the question, "7 answers hidden until you post", and no reply body or author

#### Scenario: Answer posted in another region
- **WHEN** the learner's answer was ingested in region B and has not replicated to region A, which serves the view
- **THEN** A still hides the answers, and the client, comparing its vector with the freshness block, shows "your answer is not yet reflected here; answers appear once it is"

#### Scenario: Stub-and-peek from a modified client
- **WHEN** a modified client posts "." and immediately requests the thread
- **THEN** the stub is accepted and folded, the answers stay hidden for the reveal delay, and the stub is listed in the moderation queue as `low_content`

### Requirement: The system SHALL support anonymous posting by redacting the author in every projection while keeping the fact under the author's key [COM-06]

The system SHALL support anonymous posting by redacting the author in every
projection while keeping the fact under the author's key.
`post.v1.body.anonymous = true` (permitted by policy `anonymity = optional |
forced`) leaves the fact in the author's stream, but every projection to a
non-moderator (thread view, thread list, search results, notifications,
digests, the Caliper projection DIO-08) renders `author = anonymous` with no
subject identifier; moderators see the author with the marker "anonymous to
learners". Forum-scope `refs` carry `fact_id` only and the pointer map lives
in the view, so no projection exposes the author's PK.

#### Scenario: Reply to an anonymous post
- **WHEN** a learner replies to an anonymous post
- **THEN** the reply's `refs` names only the parent's `fact_id`; the replier's client never receives the parent author's PK
- **AND** the anonymous author learns of the reply through their own inbox view and, if subscribed, a notification that names neither party to the other

#### Scenario: Moderator view
- **WHEN** a tutor opens the thread
- **THEN** the anonymous post shows its author with the marker, and a `void.v1` by the tutor is authorised over that subject (FLS-11)

### Requirement: The system SHALL emit notifications only from the tenant's home region through a gated emitter keyed by (trigger, channel, recipient) [COM-07]

The system SHALL emit notifications only from the tenant's home region
through a gated emitter keyed by (trigger, channel, recipient).
`notify-emitter` runs in every region but proceeds only when the registry
`TN#` item (ADM-03, 60 s cache) names its region as the tenant's home. Every
send has idempotency key `(trigger fact_id or intent_id, channel,
recipient)`; before sending, the emitter reads the sent ledger for that key
under every region's ledger PK (FLS pattern 7) and then performs a
region-local conditional put of its own ledger item; a failed condition
means skip. Monotone triggers (a new post to a subscriber, an announcement,
a message, `publish.conflict` and `deadline.changed` from CAC-12, cap
reconciliation from IDE-06, `credential.issued` from CRD-06 keyed by
credential id, break-glass audits from ADM) are sent after a 60 s coalescing
delay, one send per (recipient, channel) covering everything that
accumulated. Non-monotone triggers (at-risk MVA-09, completion DRV-11,
deadline-approaching-and-not-submitted and release ACT-16, slot apologies
ACT-09) arrive only as MVA SideEffectIntents (MVA-08) after their stability
window. The emitter checks `comms` consent (ADM-16) and preferences (COM-08)
at emit time. Duplicate sends are possible during a home-region flip
(ADM-03) and are bounded by replication lag plus the 60 s cache TTL (target
≤ 90 s, ADR-012); they are not otherwise possible. Magic-link mail (IDE) is
the one exception: it is request-scoped, sent by the serving region, and
needs no ledger.

#### Scenario: Three replies in a minute
- **WHEN** three replies to a subscribed thread fold within 60 s
- **THEN** the subscriber receives one push and one email listing three replies, and three ledger items exist, one per trigger fact

#### Scenario: Home region flips mid-send
- **WHEN** the registry moves the home from region A to B while A's emitter still holds a cached assignment and B has not yet received A's ledger item for a trigger
- **THEN** both may send that trigger once; after at most replication lag plus 60 s every later trigger is sent once, from B, after B has consulted all regions' ledgers

#### Scenario: At-risk alert
- **WHEN** MVA-08 publishes `effect.ready { intent_id, kind: at_risk }` after its 5-minute window
- **THEN** the home-region emitter sends to the instructors named by the course policy with key `(intent_id, channel, recipient)`, and nothing about at-risk state is ever sent from the fold path

### Requirement: The system SHALL apply notification preferences, quiet hours and per-recipient daily caps by deferring, never dropping [COM-08]

The system SHALL apply notification preferences, quiet hours and
per-recipient daily caps by deferring, never dropping. `notify.pref.v1` is
LWW by HLC per field over tenant defaults; the emitter reads the derived
preference and suppression items (COM-18). The daily cap per channel
(default 20 email, 50 push) is a count over all regions' ledgers for the
day; a send beyond it, or inside quiet hours, is deferred to the recipient's
next digest or the end of quiet hours while the in-app item is written at
once. Every email carries RFC 8058 one-click `List-Unsubscribe` headers
whose signed token, when used, appends `notify.unsub.v1` for that channel
and kind.

#### Scenario: Cap reached
- **WHEN** a learner already has 20 email ledger items today and a 21st trigger fires
- **THEN** the in-app item is written, no email is sent, and the trigger is carried into the next digest marked "deferred: daily limit"

#### Scenario: One-click unsubscribe
- **WHEN** a mail client POSTs to the `List-Unsubscribe-Post` URL
- **THEN** `unsub-api` verifies the token and appends `notify.unsub.v1 { channel: email, kinds: [post] }` under the recipient by the region system device
- **AND** that kind is suppressed wherever the fact has replicated

### Requirement: The system SHALL generate daily and weekly digests in the home region from thread views and record the vector each digest covered [COM-09]

The system SHALL generate daily and weekly digests in the home region from
thread views and record the vector each digest covered. EventBridge
Scheduler fires each tenant's digest schedules in every region and only the
home region proceeds. A Step Functions Express `digest-run` maps over
(forum, cohort) views with digest subscribers (and observers a learner has
opted in, IDE-15), snapshots each view's cursor set to S3 (content-addressed,
CRR per ADR-017), selects the posts whose `(stream, seq)` lie outside the
recipient's previous coverage, composes one email per recipient and hands it
to the emitter with key `(digest#<recipient>#<period>, email, recipient)`.
The ledger item records per view `(vector_digest, max_sync_hlc,
cursor_ref)`, so the footer states "this digest covered posts synced before
⟨max_sync_hlc⟩ in ⟨region⟩", and a post that folds later is carried into
the next digest marked "synced after the previous digest". A budget throttle
(`throttle.digests`, ADM-15) delays a run; it never discards one.

#### Scenario: Daily digest
- **WHEN** the 06:00 schedule fires for a tenant whose home is eu-west-1
- **THEN** the eu-central-1 run exits at the home check, the eu-west-1 run composes digests, and every footer states the coverage time and region

#### Scenario: Post replicates after the run
- **WHEN** a post with `sync_hlc` earlier than the coverage time reaches the home region after the run
- **THEN** its `(stream, seq)` is outside the recorded coverage and it appears in the next digest with the marker, rather than being lost

### Requirement: The system SHALL express locking and pinning as policy facts and treat a lock as advisory [COM-10]

The system SHALL express locking and pinning as policy facts and treat a
lock as advisory. `forum.policy.v1 { target, op }` by an instructor, a tutor
or a `moderator` role grant (IDE-08) sets the state per `(target,
attribute)` as the latest by `(sync_hlc, fact_id)`; pinned threads sort
first. A post whose `sync_hlc` is after the effective lock's is accepted and
flagged `after_lock` (plus `claimed_before_lock` when its `device_hlc`
precedes the lock); it is visible, listed in the moderation queue, and a
moderator may void it. The client hides the reply control on a locked
thread; the server never rejects.

#### Scenario: Offline reply to a thread locked meanwhile
- **WHEN** a learner replies offline at 14:00, a tutor locks the thread at 15:00 and the reply syncs at 16:00
- **THEN** the reply folds with `after_lock` and `claimed_before_lock`, appears in the thread and in the moderation queue, and the tutor may void it or leave it

#### Scenario: Two moderators disagree
- **WHEN** one moderator locks and another unlocks within the same second in different regions
- **THEN** both facts fold everywhere and the state is the later by `(sync_hlc, fact_id)`, identical in every region once both have replicated

### Requirement: The system SHALL fold ratings monotonically per post and compute "top rated" as a non-monotone recompute [COM-11]

The system SHALL fold ratings monotonically per post and compute "top
rated" as a non-monotone recompute. `rating.v1 { target, value }` is a
register per `(rater, post)` whose effective value is the latest by
`(sync_hlc, fact_id)`; each node's `(sum, count, max)` is folded from the
effective registers and adjusted in place when a register advances. Scale,
eligible roles, aggregate and rating window are forum policy; a rating
outside the window is folded and flagged, not rejected. `NM#top_rated` per
(forum, cohort) is recomputed wholesale at a vector by `forum-nm-recompute`
(MVA-07). The per-author aggregate of ratings received is exposed for the
derivation engine to fold into a forum grade under `policy.v1` (DRV-10); no
grade is stored here.

#### Scenario: Rater changes their mind
- **WHEN** a tutor rates a post 5 and then 3
- **THEN** the node's `sum` moves from 5 to 3 with `count = 1`, both facts remain, and the top-rated row is recomputed at the next debounce

#### Scenario: Two regions, two vectors
- **WHEN** region A has folded 40 ratings and region B 38
- **THEN** their `NM#top_rated` rows may differ; each is served with its own `vector_digest` and neither is merged into the other

### Requirement: The system SHALL derive subscriptions from forum policy and subscribe.v1 facts [COM-12]

The system SHALL derive subscriptions from forum policy and `subscribe.v1`
facts. Policy sets the mode (`optional`, `forced`, `auto`, `disabled`);
`subscribe.v1 { target, mode }` is the learner's latest choice per forum or
thread, and posting auto-subscribes to the thread where policy says so. The
derived subscriber set per (forum, cohort) feeds the emitter and the digest
run; under `forced`, cohort membership is the subscription and no
per-learner fact is needed.

#### Scenario: Digest instead of immediate
- **WHEN** a learner appends `subscribe.v1 { target: forum, mode: digest }`
- **THEN** new posts in that forum produce in-app items but no immediate email or push, and are included in the next digest

#### Scenario: Forced subscription
- **WHEN** a cohort member has never touched subscription settings for a `forced` forum
- **THEN** the subscriber set lists them as `immediate` and a new thread reaches them through every channel their preferences allow

### Requirement: The system SHALL provide moderation through report facts, moderator voids, a derived moderation queue, and advisory word filters and rate limits with server-side flagging [COM-13]

The system SHALL provide moderation through report facts, moderator voids,
a derived moderation queue, and advisory word filters and rate limits with
server-side flagging. `report.v1 { target, reason }` places the post in the
(forum, cohort) moderation queue with its report count; the queue also
lists posts flagged `after_lock`, `rate`, `word_filter`, `extra_root`,
`cohort_mismatch` and `low_content`. Word filters and `post_rate { n, per }`
are `policy.v1` content that the client applies as warnings or delays and
the server never enforces: on fold, a matching post is flagged
`word_filter`, and a post beyond `n` effective posts by the same author
within `per` (by `sync_hlc`) is flagged `rate`. Under a filter with `action
= hold` the post is projected to non-moderators as "held for review" until
a `forum.policy.v1 { op: release }` or a void. Removal is `void.v1`
(COM-01); destruction is an ADM-12 takedown. Two reports of one post from
two devices are both accepted.

#### Scenario: Held post
- **WHEN** a post matches a `hold` filter
- **THEN** the author sees it marked "held for review", other learners do not see it, moderators see it in the queue, and the fact is unchanged

#### Scenario: Burst from a modified client
- **WHEN** a modified client pushes 30 posts in one minute against a policy of 5 per 10 minutes
- **THEN** all 30 are accepted and folded, 25 carry `rate`, and the queue shows the author with the burst

### Requirement: The system SHALL record announcements as course-subject facts fanned out to cohort members' inboxes [COM-14]

The system SHALL record announcements as course-subject facts fanned out to
cohort members' inboxes. `announce.v1` (subject = course, scope `_struct`,
writer instructor) is a read-only feed item, not a thread. The router fans
it out per cohort (COM-03); `inbox-updater` in every region writes the
cohort feed item and one inbox item per member (≤ 2,000 per cohort,
ADR-019); the home-region emitter treats it as a monotone trigger under
forced subscription with the 60 s coalescing delay. A member enrolled later
sees it in the feed with its original `sync_hlc` and receives no
notification for it.

#### Scenario: Announcement during a replication interruption
- **WHEN** replication to region B is interrupted and an instructor posts an announcement in A, the home region
- **THEN** A's members see it and are emailed once; B's members see it when replication resumes, with the freshness block showing the delay, and are not emailed again

#### Scenario: Late enrolment
- **WHEN** a learner joins the cohort a week after an announcement
- **THEN** the announcement is in their feed, dated by its `sync_hlc`, and no ledger item is written for them

### Requirement: The system SHALL record direct and group messages as sender-keyed facts and fan them out to recipient inbox views [COM-15]

The system SHALL record direct and group messages as sender-keyed facts and
fan them out to recipient inbox views. `msg.v1` is stored under the sender's
PK in scope `_msg` with the recipient or `conversation_id` in plaintext
metadata; the router emits one `com-views` message per recipient (group =
`recipient#_msg`) and `inbox-updater` writes the conversation item in each
recipient's mailbox, in every region. Group conversations are `conv.v1`
facts under a `G` subject; membership intervals are derived per region, a
message fans out to the members the folding region currently derives, and a
member added later sees only messages synced after their add. Conversations
are bounded at 200 members; cohort-wide communication is a forum or an
announcement. Bodies are encrypted under the sender's data key, so a
sender's erasure (ADM-11) removes their messages from every mailbox on
recompute (MVA-15).

#### Scenario: Message across regions
- **WHEN** a learner in region A messages a learner whose device syncs with region B
- **THEN** the fact replicates, B's `inbox-updater` writes the recipient's conversation item, and the recipient's next inbox read shows it with the freshness block

#### Scenario: Removal not yet replicated
- **WHEN** a member is removed from a conversation in region B and a message is sent in region A before the removal replicates
- **THEN** A fans the message out to the removed member; after the removal folds and the mailbox is recomputed, the item stays, marked "sent before your removal was reflected"; nothing is un-sent

### Requirement: The system SHALL record read state as read-through facts and derive unread counts without depending on the device clock [COM-16]

The system SHALL record read state as read-through facts and derive unread
counts without depending on the device clock. `read.v1 { target,
through_hlc }` is written by the reader's device for a conversation, the
notification inbox, a forum or a thread; the effective value per `(reader,
target)` is the maximum `through_hlc`. A node is unread if its `sync_hlc`
exceeds `through_hlc` or if the region folded it after the read fact's own
`sync_hlc`, so a post that folded into the past of a thread is still
surfaced as new. "Seen" indicators shown to a sender are projections of the
recipient's `read.v1` and may lag.

#### Scenario: Post arrives in the past
- **WHEN** a learner reads a thread through 10:04 and a post stamped 10:00 in another region replicates at 10:05
- **THEN** the next read reports "1 new post earlier in the thread", because the node folded after the read was recorded, and the client offers a jump to it

#### Scenario: Two devices
- **WHEN** the learner reads a conversation on a phone and then on a laptop
- **THEN** both devices converge on the maximum `through_hlc` once both read facts have synced

### Requirement: The system SHALL provide the in-app notification inbox as a derived view in every region, never as a side effect [COM-17]

The system SHALL provide the in-app notification inbox as a derived view in
every region, never as a side effect. `inbox-updater` writes one item per
(recipient, trigger) for replies to the reader's posts and immediate-mode
subscriptions, announcements, messages and moderation outcomes on the
reader's posts, all derived directly from facts. Non-monotone kinds
(at-risk, completion, reminders) enter the inbox only through the `inapp#`
ledger items the home-region emitter writes after an intent fires; every
region's `inbox-updater` folds those items from the `facts` stream, so the
in-app view shows exactly what was decided, once, everywhere. Inbox items
older than 180 days are removed by TTL as housekeeping; the facts remain and
the TTL is never a freshness signal.

#### Scenario: Offline reader
- **WHEN** a learner opens the app offline
- **THEN** the service worker shows the inbox page cached at its last freshness block, labelled with it, and read marks queue as `read.v1` facts for the next sync

#### Scenario: At-risk alert in both regions
- **WHEN** the home region fires an at-risk intent and writes `inapp#` and `email#` ledger items
- **THEN** the `inapp#` item replicates and both regions' inbox-updaters write the instructor's inbox item once, idempotent by key

### Requirement: The system SHALL deliver email through SES and web push through VAPID from the home region, record delivery outcomes as facts, and queue rather than drop under provider limits [COM-18]

The system SHALL deliver email through SES and web push through VAPID from
the home region, record delivery outcomes as facts, and queue rather than
drop under provider limits. A device appends `push.sub.v1` in its `_profile`
stream (one per device; a newer one supersedes, `active = false`
withdraws). `notify-sender` signs pushes with the tenant's VAPID key pair
(Secrets Manager, replicated within the zone) and sends email through an
SES configuration set whose EventBridge destination delivers bounce,
complaint and delivery events to `delivery-recorder`, which appends
`notify.delivery.v1` under the recipient; a push `404` or `410` appends
`outcome: gone`. A hard bounce, complaint or gone suppresses that address or
subscription in the derived suppression item wherever the fact replicates.
SES quota and rate are an account cap, not a domain invariant: on
throttling the outbox item stays `claimed`, the SQS message backs off, the
in-app item notes "email delayed", nothing is dropped, and `outbox-sweeper`
re-drives `claimed` items older than 10 minutes. Push payloads carry a
title, a kind and a deep link only; hidden or anonymous content is never
pushed.

#### Scenario: Hard bounce
- **WHEN** SES reports a permanent bounce for a learner's address
- **THEN** `notify.delivery.v1 { outcome: bounce_hard }` is appended, later emails to that address are deferred to in-app only, and every region's profile view shows "email undeliverable; update your address"

#### Scenario: Announcement to a large tenant
- **WHEN** an announcement fans out to 50,000 recipients against a 100/s SES rate
- **THEN** the outbox drains over about nine minutes, every ledger item is written before its send, and the feed shows "email delivery in progress" until the outbox for it is empty

### Requirement: The system SHALL maintain a bounded, vector-stamped trigram search index per (forum, cohort) in the regional derived table [COM-19]

The system SHALL maintain a bounded, vector-stamped trigram search index per
(forum, cohort) in the regional derived table. `thread-updater` appends each
folded post's trigrams to the open index segment (one item per 200 posts,
trigram → bitmap over the segment's posts, ~140 KB); the index header
carries the view's `vector_digest`. Bounds: ≤ 64 segments (about 12,800 most
recent posts, ≤ 9 MB) per view; older segments are evicted and older posts
are searchable only through the S3 export with Athena (ADR-016). A query
ANDs the bitmaps of its trigrams across segments in Lambda, verifies
candidates against node text, and passes results through the same visibility
projection as the thread view (Q&A hiding, held posts, anonymity); a
cross-forum search fans out to the reader's (forum, cohort) indexes, at most
50. Offline, the client searches its cached thread pages.

#### Scenario: Match only in hidden answers
- **WHEN** a learner searches for a term that appears only in Q&A answers they may not yet see
- **THEN** the result lists the thread with "matches in hidden answers" and no snippet

#### Scenario: Index write retried
- **WHEN** a segment write fails after the node write in the same batch and the batch is redelivered
- **THEN** the re-append is idempotent by `fact_id` position and the index header's `vector_digest` equals the view's after the retry

---

## DynamoDB access patterns

### `facts` (global table, one per residency zone)

| # | Access pattern | Key condition | Notes |
|---|---|---|---|
| 1 | Post, edit, rating, subscription, report and forum read facts | `PK = T#t#S#L#<author>`, `SK = F#_forum#<id>#<dev>#<seq10>`, `attribute_not_exists(PK)` | FLS pattern 1; 1 WRU/KB |
| 2 | Message and conversation read facts | `PK = T#t#S#L#<sender>`, `SK = F#_msg#<dev>#<seq10>` | as above |
| 3 | Conversation membership history | `PK = T#t#S#G#<conv>`, `SK begins_with F#_msg#` | One query per conversation recompute |
| 4 | Preference, push, unsubscribe and delivery facts | `PK = T#t#S#L#<usr>`, `SK = F#_profile#<dev>#<seq10>` | `dev_sys_<region>` writes unsub and delivery |
| 5 | Announcements | `PK = T#t#S#C#<course>`, `SK = F#_struct#<dev>#<seq10>` | Alongside CAC structure facts |
| 6 | Forum policy facts | `PK = T#t#S#C#<course>`, `SK begins_with F#_forum#<id>#` | Per-forum moderation history |
| 7 | Sent ledger write | `PK = T#t#LEDGER#<region>[#<shard>]`, `SK = <channel>#<idem_key>`, `attribute_not_exists(PK)` | channel ∈ email, push, inapp, digest; shard = hash(recipient) mod 16 above 100 k recipients |
| 8 | Sent ledger check | `GetItem` under each region's ledger PK, same SK | Own region strongly consistent; peers as replicated |
| 9 | Digest coverage | pattern 7 with `SK = digest#<recipient>#<period>` | Per view `(vector_digest, max_sync_hlc, cursor_ref)` |

### `derived` (regional)

| Item | PK | SK | Purpose |
|---|---|---|---|
| Thread view header | `T#t#TH#<forum>#<cohort>` | `HDR` | generation, vector_digest, fact_count, max_sync_hlc, holes, policy_version |
| Policy state | same | `POL` | effective lock, pin, hold per target |
| Thread list entry | same | `T#<pin>#<hlc_inv>#<root>` | pinned first, newest activity first (`hlc_inv` = bitwise complement) |
| Thread node | same | `P#<root>#<path>` | `path` = `/<sync_hlc>#<fact_id>` per ancestor, depth ≤ 8 |
| Author cursor | same | `C#<subject>` | streams → hwm, pending |
| Orphan | same | `O#<parent>#<child>` | reply before parent |
| Moderation queue | same | `MQ#<hlc_inv>#<fact_id>` | reports and flags |
| Top rated | same | `NM#top_rated` | replaced wholesale (MVA-07) |
| Subscriber set | same | `SUB` (+ `SUB#<n>` overflow) | subject → mode |
| Search index | `T#t#FS#<forum>#<cohort>` | `HDR` / `S#<segment10>` | trigram bitmaps, ≤ 64 segments |
| Announcement feed | `T#t#ANN#<course>#<cohort>` | `A#<hlc_inv>#<fact_id>` | read by late joiners |
| Notification inbox | `T#t#NI#<recipient>` | `HDR` / `N#<hlc_inv>#<key>` | every region; TTL 180 d housekeeping |
| Mailbox | `T#t#MB#<recipient>` | `X#<conv>` / `M#<conv>#<sync_hlc>#<fact_id>` | conversation summary; messages |
| Conversation | `T#t#CONV#<conv>` | `HDR` | members with join and leave intervals |
| Preferences, suppression, push | `T#t#NP#<recipient>` | `PREF` / `SUP#<channel>` / `PUSH#<dev>` | folded from `_profile` facts |
| Outbox (home region) | `T#t#NO#<recipient>` | `<channel>#<idem_key>` | pending → claimed → sent or failed; TTL 30 d |
| Daily cap counter | `T#t#NC#<recipient>` | `<channel>#<yyyy-mm-dd>` | folded from ledger items; TTL 3 d |
| Digest state | `T#t#DG#<recipient>` | `<cadence>` | last run and coverage ref |

No GSI. Every read is by an owner key: partition, recipient, conversation
or course. "Posts by author across forums" is FLS pattern 3 on the author's
PK; "threads I take part in" is written into the participant's inbox at fold
time rather than queried.

**Item collection sizing.** A (forum, cohort) view at the cohort bound with
2,000 members × 20 posts per term: 40,000 nodes × 1.5 KB = 60 MB, plus
2,000 cursor rows (0.6 MB) and 2,000 list entries (0.4 MB). A thread page
of 50 nodes is ~75 KB ≈ 10 eventually consistent RRU. The search index is
capped at ~9 MB per view. An inbox holds ≤ 180 days × ~3 items × 0.5 KB ≈
270 KB; a heavy mailbox of 10,000 messages ≈ 6 MB. A ledger PK grows ~30 MB
per month per channel at L10k (100 k items × 0.3 KB) and ~3 GB per month at
1M, which is why the shard suffix exists. No LSIs, so the 10 GB collection
limit does not apply.

**Hot-partition risk.** The thread header takes one write per fold batch; at
the cohort burst of 5 forum facts/s that is < 1 write/s. A post touches one
open index segment item per batch, not one item per trigram. An
announcement fan-out is 2,000 writes across 2,000 inbox PKs, serialised per
recipient by FIFO group. A 50,000-recipient announcement produces ~100
ledger writes/s at SES pace on one region PK, the ceiling FLS names, which
is why the 16-way shard suffix applies above 100 k recipients. Outbox and
mailbox PKs are per recipient and see < 1 write/s.

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `com-read-api` | HTTP API `GET /forums/*`, `/threads/*`, `/search`, `/inbox`, `/conversations/*` | Java 21 SnapStart, 512 MB | 25 ms | 300 / 700 ms | Visibility projection, 50-node pages, freshness block |
| `thread-updater` | SQS FIFO `com-views`, group `forum#cohort`, batch 10 | Rust `provided.al2023`, 1024 MB | 10 ms/fact | 20 / 60 ms | Tree fold, index segment append, flags, CAS on header; emits `view.updated`, `com.folded` |
| `inbox-updater` | SQS FIFO `com-views`, groups `recipient#_msg` and `subject#_profile`; stream filter for `inapp#` ledger items | Rust, 512 MB | 5 ms/item | 20 / 60 ms | Inbox, mailbox, feed, conversation, preference and suppression items |
| `forum-nm-recompute` | SQS delay 30 s from `view.updated` on `_forum` partitions | Rust, 1024 MB | 50–500 ms | 20 / 60 ms | `NM#top_rated` |
| `notify-emitter` | EventBridge `com.folded`, `publish.conflict`, `deadline.changed`, `cap.exceeded`, `credential.issued`, `effect.ready`; SQS delay 60 s (coalesce) | Java 21 SnapStart, 1024 MB | 40 ms | 350 / 800 ms | Home check, recipients, preferences, consent, caps, ledger check and conditional put, outbox |
| `notify-sender` | SQS standard `com-outbox`, batch 10 | Java 21 SnapStart, 1024 MB | 60 ms/msg | 350 / 800 ms | SES `SendEmail`; Web Push with VAPID; backoff on throttle |
| `delivery-recorder` | EventBridge (SES event destination); push outcomes from `notify-sender` | Java 21 SnapStart, 512 MB | 20 ms | 300 / 700 ms | Appends `notify.delivery.v1` |
| `unsub-api` | HTTP API `POST /unsub/{token}` | Java 21 SnapStart, 512 MB | 15 ms | 300 / 700 ms | KMS-signed token; appends `notify.unsub.v1` |
| `digest-plan`, `digest-compose` | Step Functions Express `digest-run` from EventBridge Scheduler | Java 21 SnapStart, 1024 MB | 50 ms; 80 ms per recipient | 350 / 800 ms | Cursor snapshot to S3; per-recipient selection |
| `outbox-sweeper` | EventBridge Scheduler every 10 min, home region | Java 21 SnapStart, 512 MB | 30 ms | 300 / 700 ms | Re-drives `claimed` items older than 10 min |

Posting and reading never wait on the emitter; the only user-visible cold
start is on `com-read-api`, kept under a second by SnapStart. No provisioned
concurrency anywhere.

## Propagation path

1. Device → `sync-api` (FLS-08): the fact is written with a region-local conditional put and the envelope is stamped (FLS-04, FLS-05).
2. `facts` stream (every zone region) → `stream-router` (FLS-17) with the COM route table: `_forum#<id>` → SQS FIFO `com-views`, group `forum#cohort`; `_msg` → one message per recipient, group `recipient#_msg`; `announce.v1` and `forum.policy.v1` → one message per cohort; COM `_profile` types → group `subject#_profile`.
3. `thread-updater` folds the partition (CAS on `HDR.generation`), writes nodes, list entries, cursors, orphans, queue and index segment, then publishes `view.updated { partition, vector_digest }` and `com.folded { fact_id, kind, partition }` on the regional bus.
4. `inbox-updater` writes inbox, feed, mailbox, conversation, preference and suppression items in every region.
5. `notify-emitter` (every region) receives `com.folded` and the other monotone events, exits unless its region is the home, resolves recipients from the subscriber set, applies preferences, consent and caps, writes outbox `pending` items and enqueues one 60 s SQS delay message per (recipient, channel); on delivery it coalesces, checks all regions' ledgers, conditionally puts its ledger item, marks the outbox `claimed` and enqueues `com-outbox`.
6. `effect.ready { intent_id }` (MVA-08) reaches the same emitter; no coalescing delay is added to the window already served.
7. `notify-sender` sends through SES or the push service and marks the outbox `sent` with the provider id; SES events return through EventBridge to `delivery-recorder`, which appends `notify.delivery.v1`, re-entering step 2 and updating suppression everywhere.
8. Digests: EventBridge Scheduler (every region, home check) → Step Functions Express `digest-run` → cursor snapshots to S3 → per-recipient composition → step 5's ledger path with `digest#` keys.
9. `forum-nm-recompute` runs 30 s after the last `view.updated` for the partition and replaces `NM#top_rated`; anti-entropy (FLS-14) covers `_forum` and `_msg` partitions like any other.

A reply is visible in the ingest region's thread view in p50 < 2 s and in
the peer region within replication lag; a subscriber's email leaves the home
region 60–90 s after the fold.

## Cost model

COM's own fact writes (~150 k forum and message facts per month at L10k)
are part of the 2.5 M facts costed in FLS and are not repeated here.

| Component | L10k | 1M | Basis |
|---|---|---|---|
| Thread and inbox folds | 150 k facts × ~6 WRU (node, list entry, cursor, header share, queue, feed) × 2 regions = 1.8 M WRU ≈ $1.1; 0.3 M RRU ≈ $0.04; Rust 150 k × 10 ms × 1 GB ≈ $0.03 → **$1.2** | $120 | $0.625 / M WRU |
| Search index segments | 150 k posts / 10 per batch = 15 k segment writes × ~140 KB = 2.1 M WRU × 2 regions → **$2.6** | $260 | 1 WRU per KB |
| Announcement and message fan-out | 500 announcements × 200 members + 100 k messages = 0.2 M items × 2 regions = 0.4 M WRU → **$0.25** | $25 | |
| Read API | 1.5 M forum and inbox reads: API GW $1.5; Lambda 1.5 M × 50 ms × 0.5 GB ≈ $0.6 + $0.3; 12 M RRU ≈ $1.5 → **$3.9** | $390 | ~8 RRU per page |
| Emitter, ledger, outbox | 300 k sends: ledger 0.3 M rWRU × 2 regions ≈ $0.6; checks 0.9 M RRU ≈ $0.1; outbox 0.6 M WRU ≈ $0.4; Lambda 0.3 M × 100 ms × 1 GB ≈ $0.5 + $0.06; SQS 0.06 M batched ≈ $0.03; EventBridge 0.3 M ≈ $0.3 → **$2.0** | $200 | |
| SES email | 100 k emails (immediate and digests; magic links costed in IDE) × $0.10 / k → **$10** | $1,000 | linear in emails |
| Web push | 200 k pushes × 200 ms × 0.5 GB = 20 k GB-s → **$0.35** | $35 | |
| Digests | 30 daily + 4 weekly runs: Express 3 k child executions ≈ $0.003 plus ~90 k GB-s duration ≈ $1.5; Lambda 180 k candidates × 50 ms × 1 GB ≈ $0.15; 1.8 M RRU ≈ $0.23; S3 15 k PUTs ≈ $0.08 → **$2.0** | $200 | |
| Delivery events | 100 k SES events × $1 / M ≈ $0.1; ~2 k delivery facts → **$0.1** | $10 | |
| Derived storage | ~5 GB per region steady state (views, index, inbox under TTL) × 2 × $0.25 → **$2.5** | $250 | no PITR |
| **Total** | **≈ $25 / month** | ≈ $2,500 | |

SES is the dominant line and is linear in emails sent; digests and the
daily cap are the levers. Nothing here has an idle cost: schedules fire,
check the home region, and exit.

## Standards conformance

| Standard | Role | Target conformance level | In scope | Out of scope and why | Where the eventually-consistent model conflicts and how it is resolved |
|---|---|---|---|---|---|
| Caliper Analytics 1.2, Forum profile | Sensor (event producer); the projection itself is owned by DIO-08 | Forum profile: `Forum`, `Thread`, `Message` entities; `ForumEvent` (Subscribed, Unsubscribed), `ThreadEvent` (Posted), `MessageEvent` (Posted, Modified, MarkedAsRead), `FeedbackEvent` (Ranked), per `data-interop/caliper-mapping.md` | Posts, replies, edits, subscriptions, ratings, thread read markers (`read.v1` → MarkedAsRead) | Endpoint role (Trellis is not an LRS); direct messages and announcements (no Caliper profile covers them; a `trellis:` extension is a later change); anonymous posts carry a pseudonymous actor and no `creators` | `eventTime` is `sync_hlc`, so a late-synced post yields an event whose `eventTime` precedes events already emitted; ADR-018 resolves this with monotone emission from the home region, the `trellis:offlineSynced` and `trellis:vector` extensions, and the instruction to consumers to order by `eventTime`, not arrival. A void emits no retraction event; the next event for the thread carries `trellis:voidedBy` |

## Known Tensions

1. **Duplicate notifications during a home-region flip.** Where the model
   breaks: the home assignment is read through a 60 s cache and the sent
   ledger replicates with lag, so for up to ~90 s two regions can both
   believe they own emission and neither sees the other's ledger item.
   Symptom: a subscriber receives the same "new reply" email or push twice;
   a digest can be sent twice for one period. Options: (A) accept, with a
   deterministic `Message-ID` so mail clients that thread by it collapse
   the pair; (B) pause emission for one replication interval after a flip,
   delaying every notification by that interval; (C) hold the outgoing
   home's outbox and re-check all ledgers before draining it once the new
   home is confirmed. Recommendation: A plus B (ADM-03 already waits for
   catch-up before confirming a flip); flips are rare and a duplicate
   notification is harmless next to a lost one.

2. **Offline posts appearing in the past, and replies before parents.**
   Where the model breaks: siblings are ordered by `sync_hlc`, so a post
   ingested in one region and replicated late is inserted above posts a
   reader has already seen, and a reply can fold before its parent when the
   parent's device has not synced. Symptom: "new" posts appear mid-thread; a
   "reply to a post not yet synced" placeholder sits in the tree; the same
   thread reads in a different order in two regions until they converge.
   Options: (A) order by `device_hlc` so posts appear where they were
   written, trusting device clocks; (B) order by `sync_hlc` with an "arrived
   since your last read" marker and a jump link (COM-16); (C) order by fold
   time, which differs per region and is not reproducible. Recommendation:
   B; `device_hlc` is shown as advisory text and may be offered as a
   client-side sort, never as the derived order.

3. **Q&A and anonymity against a modified client.** Where the model breaks:
   the server enforces visibility only over the derived state it holds, and
   "contribute before you see" cannot tell a real answer from a stub.
   Symptom: a modified client posts "." and, after the reveal delay, reads
   everyone's answers. A modified client cannot unmask an anonymous author,
   because no projection carries the author's PK and learners cannot pull
   other learners' raw forum streams (FLS-10, IDE-09). Options: (A) reject
   stubs by minimum length, which rejects learner work and is trivially
   gamed; (B) accept, flag `low_content`, let moderators void, and let the
   reveal delay be the price of gaming; (C) require moderator approval of
   answers before reveal, turning every Q&A thread into a moderation queue.
   Recommendation: B; the residual is a learner who sees answers early,
   which in a formative setting is a pedagogical rather than an integrity
   failure.

4. **Moderation against a grow-only log.** Where the model breaks: a
   moderator's void hides a post in every view, but the fact, its
   attachments and its metadata persist, encrypted, in every region and in
   exports. Symptom: "deleted" content is still on disk; a legal removal or
   a safeguarding case needs more than a void. Options: (A) void only, and
   treat encryption at rest as sufficient; (B) `takedown.v1` (ADM-12),
   which shreds the body and blob in every region while leaving `fact_id`
   and metadata so vectors and Merkle summaries are unaffected; (C) delete
   the item, breaking the hash chain and the summaries. Recommendation: A by
   default, B on request or order, C never. The "removed by ⟨role⟩" marker
   makes the difference visible to the author.

5. **Digest coverage against replication lag.** Where the model breaks: a
   digest is composed in the home region from that region's views; a post
   ingested elsewhere and not yet replicated is outside the coverage even
   though its `sync_hlc` precedes the run. Symptom: a learner comparing the
   digest with the thread sees a post "from before the digest" that the
   digest omitted. Options: (A) delay the run by a fixed margin, which helps
   only while lag is under the margin; (B) record the covered vector per
   view and carry any post outside it into the next digest, marked "synced
   after the previous digest" (COM-09); (C) run digests in every region and
   dedupe, which reintroduces the duplicate problem at scale.
   Recommendation: B; "covered posts synced before ⟨t⟩ in ⟨region⟩" is the
   honest statement and vectors as cursors make it exact.

6. **SES sending limits are a cap, not a domain invariant.** Where the model
   breaks: a 50,000-recipient announcement or a deadline-day reminder wave
   exceeds the account's send rate and daily quota, and the fact model has
   no notion of "too many emails". Symptom: the last recipients get an email
   hours after the first, and a reminder may arrive after the deadline it
   warns about. Options: (A) drop what exceeds the quota, silently losing
   notifications; (B) queue in the outbox, drain at the permitted rate,
   never drop, and show "email delivery in progress" on the feed and "email
   delayed" in the inbox while the ledger records each send before it
   leaves; (C) request a higher quota per tenant and shard sending across
   configuration sets. Recommendation: B, with C as capacity planning;
   reminders carry their deadline and the in-app item is immediate, so the
   delay is visible rather than harmful.

7. **Sender-keyed encryption of messages.** Where the model breaks: a
   message body is encrypted under the sender's data key, so the sender's
   erasure (ADM-11) makes it undecryptable in every recipient's mailbox on
   recompute. Symptom: received messages vanish from a conversation when the
   other party is erased, which Moodle users do not expect. Options: (A)
   accept, as the privacy-first reading of erasure; (B) have the region
   system device write a recipient-keyed copy on delivery, doubling writes
   and making erasure incomplete; (C) keep plaintext in derived items until
   recompute, which is A with a delay. Recommendation: A, with a "[message
   from an erased account]" placeholder and a tenant policy switch for B
   where retention obligations require it.
