## Context

COM spec; ADR-002, ADR-012, ADR-016. Posts and messages are facts under
the author's key; threads and inboxes are region-owned views; every send
is a gated side effect from the home region.

## Goals / Non-Goals

Goals: forums and messaging that work offline and converge; notifications
that are sent once from one region and can be explained; digests that say
what they covered; moderation that hides without deleting.

Non-goals: inbound email (reply-by-email), real-time chat presence,
cross-tenant messaging.

## Decisions

- **Routing.** The stream router sends `_forum#<id>` and `_msg` facts to
  the FIFO `threads` queue (group = forum#cohort or recipient inbox);
  announcements fan out from the course scope to member inboxes.
- **Thread views.** `TH#` items per thread with the tree derived from
  `refs`, ordered by `(sync_hlc, fact_id)`; a reply whose parent has not
  folded yet is held in a pending stash and attached when it arrives;
  offline posts carry the "posted offline, synced at" label from the
  envelope.
- **Edits and removal.** `post.edit.v1` supersedes by HLC; `void.v1` hides
  the body in projections ("removed by <role>"); takedown (ADM-12) shreds.
- **Visibility.** Q&A and anonymity rules are projections computed on
  read from derived state; the client mirrors them; a modified client that
  requests hidden content is served according to the same server-side
  projection, so the only bypass is reading the encrypted fact stream,
  which the sync authorisation (FLS-10) prevents for other authors'
  streams.
- **Notification emitter.** SQS consumer in every region; each message
  checks `home_region == self`; idempotency key `(trigger, channel,
  recipient)`; ledger read across regions before send; SES and VAPID
  sends; delivery outcomes recorded as facts; per-recipient caps and quiet
  hours defer, never drop.
- **Monotone versus intent-driven triggers.** New post, reply, message and
  announcement notifications coalesce for 60 s and send; at-risk,
  completion, deadline-approaching and digest triggers arrive only as
  MVA-08 intents.
- **Digests.** Scheduler → Step Functions Express in the home region; the
  digest lists the vector digest of each thread view it read.
- **Search.** Bounded trigram index per (forum, cohort) in `derived`,
  vector-stamped, rebuilt on demand.

## Risks / Trade-offs

- Double sends during a home-region flip (≤ 90 s window) are accepted and
  auditable through the ledger.
- SES sending limits are a cap that queues, never drops; a large tenant's
  announcement can take minutes to deliver.
- Reply-before-parent ordering and offline posts inserted in the past can
  surprise readers; the labels are the mitigation.

## Migration Plan

Greenfield. Tests: two-region concurrent posting converges to the same
thread tree; flip test asserts ≤ 1 duplicate notification per key; Q&A
visibility with a modified client; digest coverage statement.

## Open Questions

- Whether announcements should also post to an external channel (webhook
  kinds exist in DIO-15; not wired by default).
