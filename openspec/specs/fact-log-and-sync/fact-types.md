# Fact Type Registry

Every fact declares `type = <name>.v<n>`. This registry is the single list.
Each owning spec defines the body schema in detail; this file fixes names,
subject kinds, permitted writers, and PII class (`P` = body is personal data
and must be encrypted under the subject's data key; `T` = tenant/course data,
encrypted under the tenant key; `S` = system, tenant key).

| Type | Owner | Subject kind | Scope | Writer | PII | Purpose |
|---|---|---|---|---|---|---|
| `device.v1` | FLS | L | `_profile` | self | P | Device registration |
| `noop.v1` | FLS | any | any | self | S | Gap fill in a stream |
| `void.v1` | FLS | any | same as target | self / role over subject | P | Retraction of target fact |
| `sys.abandon.v1` | FLS | any | same as stream | region system device | S | Stream abandoned at seq |
| `export.v1` | FLS | T | `_admin` | admin | S | Export manifest reference |
| `profile.v1` | IDE | L | `_profile` | self / admin | P | Profile field set (LWW by HLC per field) |
| `identity.v1` | IDE | L | `_profile` | region system device | P | Federated identity claim (issuer, sub, email hash) |
| `merge.v1` | IDE | L | `_profile` | admin / self via proof | P | Account merge: this principal is an alias of another |
| `session.revoke.v1` | IDE | L | `_profile` | self / admin | S | Revoke sessions issued before HLC |
| `enrol.v1` | IDE | L | `_enrol` | self / instructor / admin / SIS import | P | Enrolment in course + cohort with role |
| `unenrol.v1` | IDE | L | `_enrol` | as enrol | P | Enrolment ended (superseding, not a void) |
| `role.v1` | IDE | L | `_enrol` | admin / instructor | P | Role grant/revoke in a context |
| `cohort.v1` | IDE | C | `_struct` | instructor / admin / system | T | Cohort created, capped, split, merged |
| `sys.reconcile.v1` | IDE | L or C | `_enrol` | region system device | P | Cap reconciliation decision (waitlist, bump, confirm) |
| `struct.v1` | CAC | C | `_struct` | editor | T | Course structure operation (add/move/set/remove) |
| `publish.v1` | CAC | C | `_struct` | editor | T | Publish snapshot of structure at vector |
| `catalogue.v1` | CAC | T | `_struct` | admin / course designer | T | Tenant category tree and course catalogue operation |
| `item.v1` | CAC | C | `_struct` | editor | T | QTI item version reference (blob hash) |
| `key.v1` | CAC | C | `_struct` | editor | T | Answer key / response processing version (`key_version`) |
| `rubric.v1` | CAC | C | `_struct` | editor | T | Rubric / marking guide version (`rubric_version`) |
| `policy.v1` | CAC | C | `_struct` | editor | T | Derivation policy settings (attempts, lateness, key change, aggregation) |
| `deadline.v1` | CAC | C | `_struct` | editor | T | Deadline set for an activity (per cohort) |
| `attempt.start.v1` | ACT | L or G | module | self / group member | P | Attempt opened (attempt_n claimed) |
| `resp.v1` | ACT | L or G | module | self / group member | P | Item response with key_version, client_mark |
| `attempt.submit.v1` | ACT | L or G | module | self / group member | P | Attempt/assignment submitted (refs responses) |
| `progress.v1` | ACT | L | module | self | P | Viewed/completed markers |
| `choice.v1` | ACT | L | module | self | P | Choice/slot selection |
| `mark.v1` | ACT | L or G | module | instructor / tutor / peer / self (self-assessment) | P | Human marking with rubric_version |
| `feedback.v1` | ACT | L | module | instructor / tutor | P | Feedback text/files |
| `override.v1` | ACT | L | module | instructor | P | Grade override (input to derivation, not authority over it) |
| `extension.v1` | ACT | L | module | instructor | P | Deadline extension |
| `allocation.v1` | ACT | L | module | region system device / instructor | P | Peer-review allocation |
| `slot.v1` | ACT | L | module | region system device / instructor | P | Slot reconciliation outcome (confirmed, bumped, waitlisted) with alternatives |
| `post.v1` | COM | L (author) | `_forum#<id>` | self | P | Forum post/reply |
| `post.edit.v1` | COM | L | `_forum#<id>` | self / moderator | P | Superseding edit |
| `rating.v1` | COM | L | `_forum#<id>` | self | P | Rating of a post |
| `subscribe.v1` | COM | L | `_forum#<id>` | self | P | Subscription preference |
| `msg.v1` | COM | L (sender) | `_msg` | self | P | Direct message |
| `notify.pref.v1` | COM | L | `_profile` | self | P | Notification preferences |
| `announce.v1` | COM | C | `_struct` | instructor | T | Announcement |
| `lti.reg.v1` | LTI | T | `_admin` | admin / dynamic registration | T | Tool or platform registration |
| `lti.deploy.v1` | LTI | T | `_admin` | admin | T | Deployment in a context |
| `lti.link.v1` | LTI | C | `_struct` | editor / deep linking | T | Resource link placement |
| `lti.launch.v1` | LTI | L | module | region system device on behalf of the launching principal | P | LTI launch record (either role) with service endpoints |
| `lti.lineitem.v1` | LTI | C | `_struct` | tool (AGS) / editor / region system device (tool role) | T | AGS lineitem (platform-held or platform-created) |
| `ext.score.v1` | LTI / DIO | L | module | tool (AGS) / SIS (OneRoster) | P | External score received |
| `ext.result.v1` | DIO | L | module | SIS | P | External result received (OneRoster) |
| `caliper.in.v1` | DIO | L | module or `_admin` | tool sensor | P | Inbound Caliper envelope |
| `sis.v1` | DIO | L / C | `_enrol` / `_struct` | SIS import | P/T | Raw OneRoster record snapshot with sourcedId |
| `cc.import.v1` | DIO | C | `_struct` | editor | T | Common Cartridge import manifest |
| `webhook.v1` | DIO | T | `_admin` | admin | S | Webhook subscription (url, secret ref, event kinds, status) |
| `align.v1` | CRD | C | `_struct` | editor | T | Item/activity ↔ CASE CFItem alignment |
| `evidence.v1` | CRD | L | module | self / instructor | P | Competency evidence |
| `award.v1` | CRD | L | `_profile` | region system device / instructor | P | Credential award decision (pre-issuance) |
| `issue.v1` | CRD | L | `_profile` | region system device (home) | P | Credential issued (id, hash of VC) |
| `revoke.v1` | CRD | L | `_profile` | admin / issuer / region system device (home, policy-driven) | P | Credential revoked |
| `framework.v1` | CRD | T | `_admin` | admin / CASE import (region system device) | T | CASE framework imported: sourcedId, source, package blob hash |
| `achievement.v1` | CRD | C or T | `_struct` / `_admin` | editor / admin | T | Achievement definition version (rule, validity, image, alignments, issuer) |
| `issuer.v1` | CRD | T | `_admin` | admin | T | Issuer profile: DID, name, url, image, key group |
| `plan.v1` | CRD | L | `_profile` | instructor / admin / self | P | Learning plan: framework, CFItems, target dates |
| `ob.client.v1` | CRD | T | `_admin` | dynamic registration (region system device) / admin | T | OB 3.0 / CLR 2.0 API client registration (RFC 7591) |
| `tenant.v1` | ADM | T | `_admin` | operator | S | Tenant configuration set |
| `flag.v1` | ADM | T | `_admin` | operator / admin | S | Feature flag |
| `consent.v1` | ADM | L | `_profile` | self / guardian (observer role) | P | Consent record per purpose |
| `erasure.v1` | ADM | L | `_profile` | admin | S | Erasure requested/executed |
| `retention.v1` | ADM | T | `_admin` | admin | S | Retention policy |
| `audit.v1` | ADM | T | `_admin` | region system device | S | Administrative action audit |
| `takedown.v1` | ADM | T | `_admin` | admin / moderator / operator | S | Takedown order naming a target fact; body shredded in every region (ADM-12) |

Rules:

- A type's body schema may only change by incrementing `v`. Old versions
  remain interpretable forever.
- The region system device is `dev_sys_<region>`; it writes only types marked
  as such, and its facts carry `writer_principal = usr_sys`.
- `P` bodies are encrypted under the subject's data key; `T` and `S` under
  the tenant key. Metadata (ids, seq, hlc, type, item_id, key_version,
  rubric_version, attempt_n) is plaintext.
