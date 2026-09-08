## 1. Forums
- [ ] 1.1 Forum activities and policy facts (types, lock/pin, subscriptions, anonymity, rate limits)
- [ ] 1.2 Post, reply, edit, void facts in the runtime; offline posting
- [ ] 1.3 `threads` FIFO routing in the stream router; thread view updater (tree, ordering, pending parents, labels)
- [ ] 1.4 Visibility projections (Q&A, anonymous, locked) on read; client mirror
- [ ] 1.5 Ratings fold and top-rated recompute; subscriptions derivation
- [ ] 1.6 Moderation: report facts, moderation queue view, moderator voids, word filters, takedown hand-off (ADM-12)
- [ ] 1.7 Per-(forum, cohort) trigram search index

## 2. Announcements and messaging
- [ ] 2.1 Announcement facts and fan-out to member inboxes
- [ ] 2.2 Direct and group messages, conversation facts, recipient inbox views
- [ ] 2.3 Read-through facts and unread counts
- [ ] 2.4 In-app notification inbox view

## 3. Notification emitter
- [ ] 3.1 Emitter with home-region check, idempotency keys, cross-region ledger read, SES and VAPID senders
- [ ] 3.2 Preferences, quiet hours, daily caps (defer, never drop); unsubscribe tokens and facts
- [ ] 3.3 Monotone trigger coalescing (60 s); intent-driven triggers from MVA-08
- [ ] 3.4 Delivery outcome facts from SES notifications and push responses; bounce/complaint handling
- [ ] 3.5 Push subscription facts and device registration

## 4. Digests
- [ ] 4.1 Digest workflow (daily/weekly) with vector coverage statement; observer digests (IDE-15)

## 5. Tests
- [ ] 5.1 Two-region concurrent posting convergence; reply-before-parent
- [ ] 5.2 Home-region flip: ≤ 1 duplicate per (trigger, channel, recipient)
- [ ] 5.3 Caps and quiet hours defer and eventually deliver
- [ ] 5.4 Q&A visibility against a modified client
