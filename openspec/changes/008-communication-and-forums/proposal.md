# Change: 008 Communication and forums

## Why

Forums, announcements and messaging are where a cohort becomes a class,
and notifications are the only way Trellis reaches a learner who is not
looking at it. Both must fit the model: posts and messages as facts under
the author's key, threads and inboxes as region-owned views with visible
freshness, and every send a gated side effect from the home region with an
idempotency key and a stability window when its trigger is non-monotone.

## What Changes

- Forum activities and policies (types, lock/pin, subscriptions,
  anonymity, moderation), post/reply/edit/void facts, thread view updater,
  visibility projections, ratings, per-forum search index.
- Announcements with inbox fan-out; direct and group messaging with
  recipient inbox views; read-through facts and unread counts; in-app
  notification inbox.
- The gated notification emitter (home region, ledger, SES, VAPID),
  preferences, quiet hours, caps, unsubscribe, delivery-outcome facts.
- Daily and weekly digests with vector coverage statements.

## Impact

- Adds the COM-defined fact types to the registry (see spec §Domain
  model).
- Adds the FIFO `threads` queue to the router (FLS-17).
- Provides the emitter every later change's notifications use (IDE cap
  reconciliation, ACT reminders, CRD issuance notices, DIO reconciliation).

## Requirements delivered

- COM-01
- COM-02
- COM-03
- COM-04
- COM-05
- COM-06
- COM-07
- COM-08
- COM-09
- COM-10
- COM-11
- COM-12
- COM-13
- COM-14
- COM-15
- COM-16
- COM-17
- COM-18
- COM-19

## Dependencies

002, 003, 004 (forum activities as structure nodes), 007 (intents for
non-monotone triggers). Changes 003 and 006 use a minimal sender until this
change replaces it; the sent ledger format is shared from 003 onwards.

## Out of scope

Reply-by-email, real-time presence, cross-tenant messaging.
