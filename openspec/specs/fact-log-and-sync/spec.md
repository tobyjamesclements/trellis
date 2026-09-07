# Fact Log and Sync Protocol Specification

Capability ID prefix: **FLS**

## Purpose

This capability is the system of record. It defines the immutable fact, the
grow-only fact set whose merge is union, the sequencing discipline that makes
version vectors a proof, the sync protocol between an untrusted device replica
and any region in the tenant's zone, HLC stamping, retraction by void, and
cross-region anti-entropy. Every other capability either appends facts through
this one or derives from the facts it holds.

## Consistency boundary

The fact set is a state-based CRDT (a grow-only set of content-addressed
elements). Convergence needs no coordination: two replicas that have exchanged
all facts are identical. DynamoDB Global Tables' last-writer-wins never
adjudicates between two different meanings because:

1. every fact is its own item, keyed by `(subject, scope, writer_device, seq)`,
   which only that writer can produce;
2. the plaintext content of a fact never changes after creation;
3. the only mutable attributes on a fact item are the ingest envelope
   (`sync_hlc`, `ingest_region`, `late`, `claimed_on_time`, `skew_ms`) and the
   encryption IV, both of which are advisory and bounded in divergence.

Everything with a different consistency class (rosters, Merkle summaries,
views) is region-owned derived state in the regional `derived` table.

## Domain model

### Fact

```
Fact {
  -- identity (content-addressed over everything except `envelope`)
  fact_id        : "f_" + base32(SHA-256(canonical_cbor(fields below)))[0:26]
  tenant_id      : t_<ULID>
  subject        : { kind: L|C|T|G, id }        -- learner, course, tenant, group
  scope          : mod_<ULID> | _enrol | _profile | _struct | _forum#<id> | _msg | _admin
  writer_device  : dev_<ULID>
  writer_principal : usr_<ULID>                 -- authenticated principal at time of writing
  seq            : uint32                       -- dense per (writer_device, subject, scope)
  prev           : fact_id | null               -- hash chain within the stream
  type           : "<name>.v<n>"                -- e.g. resp.v1, void.v1, enrol.v1
  device_hlc     : hlc16                        -- claimed
  refs           : [fact_id]                    -- causal references (void target, attempt start, reply-to)
  body           : map                          -- type-specific; encrypted at rest
  -- ingest envelope (server-added, NOT part of fact_id)
  envelope {
    sync_hlc       : hlc16
    ingest_region  : aws-region
    late           : bool                       -- sync_hlc.phys > effective deadline at ingest
    claimed_on_time: bool                       -- device_hlc.phys <= effective deadline at ingest
    skew_ms        : int64                      -- device_hlc.phys - sync_hlc.phys
    dk_id          : dk_<ULID>                  -- data key used to encrypt body
    body_ref       : s3://…/<sha256> | null     -- when body > 4 KB
  }
}
```

### Stream

`stream = (writer_device, subject, scope)`. `seq` starts at 1 and is dense.
The device allocates `seq` and stores the fact in one local transaction. A
gap in a stream is therefore a transport artefact, never an authoring
artefact, and the writer can always fill it (FLS-09).

### Roster (derived, region-owned)

Per `(tenant, subject, scope)` per region: for each stream, the high-water
mark (`hwm`, highest contiguous seq folded), the set of pending seqs above it,
the last fact_id at `hwm` (for chain verification), and an additive set
digest over all facts for the `(subject, scope)`.

### Merkle summary (derived, region-owned)

Per partition `(tenant, module, cohort)` per region: a 3-level, 16-ary
hash-prefix trie over `fact_id`. Node digest = LtHash-style additive digest
(sum of 16 × 16-bit lanes of SHA-256(fact_id), mod 2^16 per lane; 32 bytes).
Leaves also hold the member list `[(fact_id, PK, SK)]` so repair can fetch
without an index.

### Fact type registry

Types are namespaced and versioned (`resp.v1`). The registry lives in
`openspec/specs/fact-log-and-sync/fact-types.md` and is owned jointly by the
capabilities that define each type. Unknown types are stored and ignored by
derivation until an engine version understands them.

---

## Requirements

### Requirement: The system SHALL store every learner and authoring action as an immutable, content-addressed fact [FLS-01]

The system SHALL store every learner and authoring action as an immutable, content-addressed fact.
A fact's `fact_id` is the SHA-256 of its canonical CBOR encoding (excluding
the ingest envelope), truncated to 130 bits and base32-encoded. The server
recomputes the hash on ingest and treats a mismatch as a malformed request,
not as learner work. No API updates or deletes a fact item's content; the
only writes to an existing fact item are idempotent re-puts of identical
plaintext (anti-entropy repair) and terminal erasure (ADM).

#### Scenario: Ingest recomputes the hash
- **WHEN** a device pushes a fact whose declared `fact_id` does not equal the hash of its canonical encoding
- **THEN** the sync response lists the fact under `rejected` with reason `malformed`
- **AND** no item is written and no side effect fires

#### Scenario: Identical fact from two regions
- **WHEN** the same fact (same `fact_id`) is ingested in region A and, on retry, in region B before replication completes
- **THEN** both regions hold an item with identical plaintext content
- **AND** last-writer-wins resolves only the ingest envelope and IV, and the roster in every region records exactly one fact at that `seq`

### Requirement: The system SHALL treat the fact set as grow-only with set union as the only merge [FLS-02]

The system SHALL treat the fact set as grow-only with set union as the only merge.
No capability may depend on a fact being absent. Removal of meaning is
expressed by a superseding fact (FLS-07). The fact set for a tenant is the
union of every replica's facts; replicas converge with no coordination.

#### Scenario: Divergent replicas converge by union
- **WHEN** region A holds facts {x, y} and region B holds {y, z} after a replication interruption
- **THEN** after replication and anti-entropy both regions hold {x, y, z}
- **AND** no fact is lost or altered by the merge

#### Scenario: No delete API
- **WHEN** any caller attempts to delete or mutate a fact item through the API
- **THEN** the request is refused with `405 fact_immutable`
- **AND** the caller is directed to append a `void.v1` fact instead

### Requirement: The system SHALL require writers to assign dense, monotone, durably allocated sequence numbers per stream [FLS-03]

The system SHALL require writers to assign dense, monotone, durably allocated sequence numbers per stream.
Each `(writer_device, subject, scope)` stream begins at `seq = 1`. The device
allocates the next seq and persists the fact in one local transaction, so a
crash cannot skip a number. Each fact carries `prev`, the `fact_id` at
`seq − 1` in the same stream (null at `seq = 1`), forming a hash chain.

#### Scenario: Dense allocation survives a crash
- **WHEN** the device process is killed after computing `seq = 12` but before the local transaction commits
- **THEN** on restart the next fact in that stream is allocated `seq = 12`
- **AND** no stream ever contains a permanently unused seq that the writer cannot fill

#### Scenario: Chain verification detects a forked stream
- **WHEN** a region folds a fact at `seq = n` whose `prev` differs from the `fact_id` it holds at `seq = n − 1`
- **THEN** the roster marks the stream `forked_at = n`
- **AND** the next sync response to that device carries `advice.refork = [{subject, scope, from_seq: n}]` asking it to re-push its local log from `n`

### Requirement: The system SHALL ingest facts idempotently using region-local conditional writes only [FLS-04]

The system SHALL ingest facts idempotently using region-local conditional writes only.
Ingest performs `PutItem` with `attribute_not_exists(PK)` on `(PK, SK)`. A
conditional failure where the existing item has the same `fact_id` is a
duplicate and reported as `accepted` with `status = duplicate`. A conditional
failure with a different `fact_id` is reported as `rejected` with
`seq_conflict` and does not overwrite. No cross-region conditional write or
transaction is ever attempted.

#### Scenario: Retried push is a no-op
- **WHEN** a device re-sends a batch after a network timeout
- **THEN** every fact already stored is returned as `accepted` with `status = duplicate`
- **AND** exactly one item exists per fact in the ingest region

#### Scenario: Seq conflict from a buggy device
- **WHEN** a device pushes a fact at `seq = 9` with a different `fact_id` from the one already stored at `seq = 9`
- **THEN** the response lists it as `rejected` with reason `seq_conflict` and the stored `fact_id`
- **AND** the device re-emits the content as a new fact at its next free seq

### Requirement: The system SHALL stamp every fact at ingest with a hybrid logical clock that a device cannot advance [FLS-05]

The system SHALL stamp every fact at ingest with a hybrid logical clock that a device cannot advance.
`sync_hlc = max(now_ms << 16, last_issued + 1)` within the execution
environment. The device's `device_hlc` is stored verbatim and `skew_ms` is
recorded. A device HLC never feeds into `sync_hlc`. Ordering for derivation
is by `(sync_hlc, fact_id)` unless a policy explicitly asks for claimed time.

#### Scenario: Far-future device clock
- **WHEN** a device with a clock set 3 years ahead pushes a fact
- **THEN** the fact is accepted with `sync_hlc` from the server clock and `skew_ms ≈ +9.5e10`
- **AND** the server's HLC is unaffected and later facts from correct devices sort after it by `sync_hlc`

#### Scenario: Two facts in one millisecond
- **WHEN** one execution environment ingests two facts in the same physical millisecond
- **THEN** their `sync_hlc` values differ in the logical counter and are strictly ordered

### Requirement: The system SHALL flag late arrival against advisory deadlines and never reject on lateness [FLS-06]

The system SHALL flag late arrival against advisory deadlines and never reject on lateness.
At ingest the region resolves the effective deadline for `(subject, scope,
item)` from the derived deadline index (published deadline plus any
`extension.v1` facts it has folded) and stamps `late` and `claimed_on_time`.
The stamp is advisory; the derivation engine recomputes lateness from the
fact set and policy (DRV-07).

#### Scenario: Submission after the deadline
- **WHEN** a fact arrives with `sync_hlc` after the deadline and `device_hlc` before it
- **THEN** the fact is stored with `late = true`, `claimed_on_time = true`
- **AND** the sync response `accepted` entry shows both flags so the device can display "submitted on time, synced late"

#### Scenario: Deadline index is stale in the ingest region
- **WHEN** an extension fact for the learner has not yet replicated to the ingest region
- **THEN** the fact may be stamped `late = true` at ingest
- **AND** the derived view recomputes lateness once the extension is folded, and the envelope flag is never used as authority

### Requirement: The system SHALL express retraction only as a superseding void fact [FLS-07]

The system SHALL express retraction only as a superseding void fact.
`void.v1 { target: fact_id, reason, actor_role }` makes its target
ineffective. A void may itself be voided, which re-enables the target. A
fact is effective iff the number of effective voids targeting it is zero.
Voids are subject to the same authorisation as the target's mutation would
have been (the writer's principal, or an instructor/admin over the subject).

#### Scenario: Learner withdraws an accidental submission
- **WHEN** a learner's device appends `void.v1` targeting its own `resp.v1`
- **THEN** every derived view that folds the void excludes the response from marks and attempt counts
- **AND** both facts remain in the log and are exported with the log

#### Scenario: Instructor reverses a void
- **WHEN** an instructor appends a `void.v1` whose target is the learner's `void.v1`
- **THEN** the original response is effective again in every view that has folded all three facts

### Requirement: The system SHALL provide a sync endpoint that accepts pushed facts and returns pulled facts, rosters and advice in one round trip [FLS-08]

The system SHALL provide a sync endpoint that accepts pushed facts and returns pulled facts, rosters and advice in one round trip.
`POST /sync/v1` accepts at most 100 facts and 1 MiB per call, any number of
`pull` requests each carrying the device's vector for a `(subject, scope)`,
and a continuation `cursor`. The response contains `accepted`, `rejected`,
`facts` (pulled), `roster` (server HWMs and pending seqs per stream),
`server_hlc`, `cursor`, and `advice`. Facts are pulled only up to each
stream's HWM in the serving region.

#### Scenario: First sync of a second device
- **WHEN** a learner's new device syncs with an empty vector for `(self, mod_x)`
- **THEN** the response returns that learner's facts for `mod_x` from all streams up to their HWMs, paginated by `cursor`
- **AND** the roster shows each stream's `hwm` so the device can set its vector

#### Scenario: Push and pull in one call
- **WHEN** a device pushes 4 facts and pulls with a vector that is behind the roster on one instructor stream
- **THEN** the response carries 4 `accepted` entries and the instructor's newer facts for that subject and scope

### Requirement: The system SHALL maintain a per-stream high-water mark with pending gaps and provide a writer-driven gap repair [FLS-09]

The system SHALL maintain a per-stream high-water mark with pending gaps and provide a writer-driven gap repair.
The roster updater advances `hwm` only through contiguous seqs. Facts above
a gap are held as `pending`. Each sync response reports pending seqs; a
device that lacks a listed missing seq in its own log emits a `noop.v1` fact
at that seq to close the gap. A stream whose gap has persisted for 30 days
with no sync from the writer is marked `abandoned_at_seq` by a region-written
`sys.abandon.v1` fact, after which views fold past the gap and record the
hole.

#### Scenario: Out-of-order replication
- **WHEN** region B receives `seq = 7` via replication before `seq = 6`
- **THEN** B's roster shows `hwm = 5, pending = [7]` until 6 arrives, then `hwm = 7, pending = []`

#### Scenario: Writer fills a gap
- **WHEN** a device sees `pending = [7]` and `hwm = 5` for its own stream and its local log has 6
- **THEN** it re-pushes 6 and the roster advances to 7 on the next fold

#### Scenario: Dead device
- **WHEN** a stream shows a gap for more than 30 days and the writer device has not synced
- **THEN** the region appends `sys.abandon.v1 { stream, at_seq }` and views advance past the gap, marking affected derivations `has_hole = true`

### Requirement: The system SHALL let any device of a principal pull the facts of all streams about that principal within its authorised scopes [FLS-10]

The system SHALL let any device of a principal pull the facts of all streams about that principal within its authorised scopes.
A device may pull `(subject, scope)` if the session principal is the subject,
or holds a role over the subject's cohort permitting read of that scope
(IDE-09). Instructor devices may pull by cohort:
`pull: [{ cohort, scope, vectors: {subject: {stream: seq}} }]`.

#### Scenario: Instructor marks offline
- **WHEN** an instructor's device pulls `(cohort c, mod_x)` before going offline
- **THEN** it receives every member's facts for `mod_x` up to HWM, with per-subject rosters, paginated
- **AND** marking facts it creates offline are pushed on reconnect as its own streams with `subject = learner`

#### Scenario: Unauthorised pull
- **WHEN** a learner device pulls another learner's `(subject, scope)`
- **THEN** the response contains no facts for that request and an `advice.denied` entry naming it

### Requirement: The system SHALL bind writer identity to the authenticated session and check subject authority per fact [FLS-11]

The system SHALL bind writer identity to the authenticated session and check subject authority per fact.
`writer_principal` must equal the session principal. `subject` must be the
principal, or a subject the principal's role permits writing for
(`mark.v1`, `extension.v1`, `override.v1`, `void.v1` over cohort members;
`_struct` for course editors). Failing facts are `rejected` with
`unauthorised_subject`; the rest of the batch is processed.

#### Scenario: Spoofed subject
- **WHEN** a learner device pushes a `mark.v1` fact with another learner as subject
- **THEN** that fact is rejected with `unauthorised_subject`
- **AND** the remaining facts in the batch are ingested normally

### Requirement: The system SHALL offload fact bodies over 4 KB to S3 by content hash, with integrity enforced at upload [FLS-12]

The system SHALL offload fact bodies over 4 KB to S3 by content hash, with integrity enforced at upload.
The device requests presigned PUT URLs for `sha256` values; the URL carries
`x-amz-checksum-sha256`, so S3 rejects a mismatched upload. The fact's
`body_ref` names the blob. A fact may arrive before its blob; derivation
reports `blob_pending` until the blob exists in the reading region or its
replica.

#### Scenario: Essay submission
- **WHEN** a learner submits a 40 KB essay
- **THEN** the device uploads the body to S3 under its hash, then pushes a `resp.v1` fact with `body_ref`
- **AND** the fact is accepted regardless of whether the blob has finished uploading

#### Scenario: Corrupted upload
- **WHEN** the uploaded bytes do not hash to the presigned key
- **THEN** S3 rejects the PUT and the device retries the upload; the fact remains valid and `blob_pending`

### Requirement: The system SHALL degrade to queued acceptance under DynamoDB throttling rather than refusing work [FLS-13]

The system SHALL degrade to queued acceptance under DynamoDB throttling rather than refusing work.
If `PutItem` is throttled, the sync Lambda enqueues the fact (with its
stamped envelope) to a regional SQS standard queue and returns `accepted`
with `status = queued`. A drain Lambda writes it later with the same
conditional put. Only when the queue itself is unavailable does the endpoint
return `429` with `Retry-After`.

#### Scenario: Deadline burst on a cold on-demand table
- **WHEN** a cohort's submissions exceed the table's instantaneous on-demand capacity
- **THEN** throttled facts are queued and acknowledged as `queued`
- **AND** the device shows "received, confirming" and learns durability from the roster on a later sync

### Requirement: The system SHALL run cross-region anti-entropy over per-partition Merkle summaries and repair by pulling missing facts [FLS-14]

The system SHALL run cross-region anti-entropy over per-partition Merkle summaries and repair by pulling missing facts.
Hourly per active partition (and on demand), a region compares its root
digest with each peer region's root, descends on mismatch, and for each
differing leaf fetches the peer's member list, then reads the missing facts
from the peer table by `(PK, SK)` and puts them locally with an unconditional
identical-content write. Repair never deletes.

#### Scenario: Lost replication write
- **WHEN** a fact exists in region A but never arrived in region B
- **THEN** the next anti-entropy run in B finds a differing leaf, pulls the fact from A, and B's roster and views fold it
- **AND** the run emits a `fact.repaired` metric with the partition and count

#### Scenario: Equal roots
- **WHEN** both regions' roots for a partition are equal
- **THEN** no further reads are performed for that partition in that run

### Requirement: The system SHALL register fact types with versioned schemas and store unknown types without interpreting them [FLS-15]

The system SHALL register fact types with versioned schemas and store unknown types without interpreting them.
Every fact declares `type = <name>.v<n>`. The registry defines each type's
body schema, subject kinds, allowed writers, and PII class. Ingest validates
known types against their schema; unknown types (from a newer client) are
stored and skipped by derivation until the engine understands them.

#### Scenario: Newer client, older server
- **WHEN** a client pushes `resp.v2` before the server engine supports it
- **THEN** the fact is stored and reported `accepted` with `status = stored_uninterpreted`
- **AND** views fold it once an engine version that understands `resp.v2` is deployed, with no re-push

### Requirement: The system SHALL encrypt fact bodies at rest under per-subject data keys so that erasure is possible by key destruction [FLS-16]

The system SHALL encrypt fact bodies at rest under per-subject data keys so that erasure is possible by key destruction.
Bodies are encrypted with AES-256-GCM under a data key generated by a KMS
multi-Region key. Data keys are immutable items `DK#<subject>#<dk_id>`;
several may exist for one subject (concurrent creation in two regions is
allowed) and each fact records the `dk_id` used. Metadata used for keys,
routing and ordering is plaintext. Erasure (ADM-11) destroys all of a
subject's data keys.

#### Scenario: Concurrent key creation
- **WHEN** two regions create a data key for a new learner at the same time
- **THEN** both `DK#` items exist, facts record which one they used, and both decrypt correctly everywhere after replication

#### Scenario: Cache miss on decrypt
- **WHEN** a view updater needs a data key not in its memory cache
- **THEN** it calls KMS Decrypt once and caches the plaintext key for at most 5 minutes

### Requirement: The system SHALL deliver every fact to every region's derivation pipeline at least once and require consumers to be idempotent [FLS-17]

The system SHALL deliver every fact to every region's derivation pipeline at least once and require consumers to be idempotent.
The per-region stream router filters `INSERT` and `MODIFY` events for items
whose `SK` begins with `F#`, deduplicates within a batch by `fact_id`, and
enqueues to SQS FIFO with group `(subject, scope)` for the roster and group
`partition` for views; facts with `scope = _struct` (subject kind C or T)
go instead to the FIFO `struct` queue consumed by the structure updater
(CAC-01), and facts with scope `_forum#…` or `_msg` to the `threads` queue
(COM-04). Consumers treat a fact already at or below the stream HWM as a
no-op.

#### Scenario: Stream retry after consumer error
- **WHEN** the roster updater fails mid-batch and the batch is redelivered
- **THEN** facts already folded are skipped by HWM comparison and the batch completes without double-counting

### Requirement: The system SHALL allow a device to sync with any region in its tenant's zone without resynchronising [FLS-18]

The system SHALL allow a device to sync with any region in its tenant's zone without resynchronising.
Cursors are per-stream seqs, not per-region positions. A device that fails
over to another region sends the same vector and receives only what that
region holds beyond it. It may receive fewer facts (the region is behind) but
never wrong ones.

#### Scenario: Regional failover mid-session
- **WHEN** Route 53 health checks fail region A and the device's next sync lands in region B
- **THEN** the push is accepted in B and the pull returns B's view of the requested streams with B's rosters
- **AND** no local state on the device is discarded

### Requirement: The system SHALL register devices as facts and bind a device to one principal at a time [FLS-19]

The system SHALL register devices as facts and bind a device to one principal at a time.
`device.v1 { device_id, platform, app_version, public_key? }` is the first
fact in a device's `_profile` stream. A shared physical device holds one
`device_id` per principal profile. Sync requests from an unknown `device_id`
are accepted with `advice.register = true` and the device appends its
`device.v1` on the next push.

#### Scenario: Shared classroom tablet
- **WHEN** two learners use the same tablet with separate profiles
- **THEN** each profile holds its own `device_id` and streams, and neither can read the other's local replica

### Requirement: The system SHALL export the fact log per tenant to S3 in a documented columnar format [FLS-20]

The system SHALL export the fact log per tenant to S3 in a documented columnar format.
Monthly and on demand, a Step Functions Express workflow drives a DynamoDB
export to S3 (incremental where supported), transforms it to Parquet
partitioned by `tenant/scope/month`, and writes a manifest with the vector
summary of each partition at export time. Exports carry ciphertext bodies
unless the tenant admin requests a decrypted export (ADM-13).

#### Scenario: Research data request
- **WHEN** a tenant admin requests a decrypted export for one course
- **THEN** the workflow filters by scope, decrypts with the tenant's keys, writes Parquet to the tenant's export prefix, and records an `export.v1` fact naming the manifest

---

## DynamoDB access patterns

### `facts` (global table, one per residency zone)

| # | Access pattern | Key condition | Notes |
|---|---|---|---|
| 1 | Idempotent fact put | `PK = T#t#S#L#usr`, `SK = F#scope#dev#seq10`, `attribute_not_exists(PK)` | Region-local condition; 1 WRU/KB |
| 2 | Pull a stream range | `PK = …`, `SK BETWEEN F#scope#dev#seq(a) AND F#scope#dev#seq(b)` | Sync-down, gap fill |
| 3 | All facts for (subject, scope) | `PK = …`, `SK begins_with F#scope#` | Local re-derivation, offline instructor pull |
| 4 | All facts for subject | `PK = …`, `SK begins_with F#` | Export, erasure sweep |
| 5 | Fetch fact by pointer | `GetItem(PK, SK)` | Anti-entropy repair, void target check |
| 6 | Data key lookup | `PK = T#t#S#L#usr`, `SK begins_with DK#` | Cached in memory 5 min |
| 7 | Sent ledger check | `PK = T#t#LEDGER#<region>`, `SK = <channel>#<idem_key>` | Region-owned; read from any region |
| 8 | Key registry (signing, JWKS) | `PK = T#t#KEYS`, `SK = K#<kid>` | Immutable per kid; rotation adds items |

No GSI in the initial build. The candidate `GSI-FactId` (`fact_id` → pointer)
is deferred because every consumer that needs a fact already holds its
pointer (Merkle leaves, void refs carry `(PK, SK)` in `refs_ptr`).

**Item collection sizing.** A learner accrues ~2,400 facts/year at L10k
(200/month); at 1.2 KB average that is ~3 MB/year, ~15 MB over a five-year
programme. Course `_struct` collections: ~10 MB for a heavily edited course.
No LSIs, so the 10 GB item-collection limit does not apply.

**Hot-partition risk.** Fact writes are keyed by subject, so a deadline burst
spreads across learners; a single learner cannot exceed ~10 writes/s. Course
structure imports (Common Cartridge) can write thousands of `_struct` facts
to one PK; the import workflow paces at ≤ 500 facts/s per course, below the
1,000 WCU/s per-partition ceiling. Sent ledgers are keyed by region and
sharded by channel to keep any one PK under ~100 writes/s.

### `derived` (regional) — items owned by this capability

| Item | PK | SK | Purpose |
|---|---|---|---|
| Roster | `T#t#R#<subject>#<scope>` | `HDR` | streams → {hwm, pending[], last_fact_id, forked_at?}, set digest |
| Roster stream detail (overflow) | `T#t#R#<subject>#<scope>` | `S#<dev>` | used only when > 20 streams |
| Merkle node | `T#t#MK#<module>#<cohort>` | `N#<prefix>` (`""`, `a`, `ab`, `abc`) | digest, child digests, leaf members |
| Ingest queue shadow | `T#t#Q#<region>` | `<sync_hlc>#<fact_id>` | TTL 7 d; diagnostics for queued facts |
| Deadline index | `T#t#DL#<scope>` | `I#<item>` and `X#<subject>#<item>` | published deadlines and extensions, for the `late` stamp |

Roster items are read on every sync (1 RRU) and written on every fold with a
region-local conditional `version = :expected`. The Merkle root node for a
partition receives one write per view-updater batch, not per fact.

---

## Lambda invocation shape and cold-start profile

| Function | Trigger | Runtime / memory | Warm p50 | Cold p50 / p99 | Notes |
|---|---|---|---|---|---|
| `sync-api` | API Gateway HTTP API `POST /sync/v1` | Java 21 SnapStart, 1024 MB | 35 ms | 350 / 800 ms | Hash verify, schema check, encrypt, conditional put ×N, roster read, range queries |
| `blob-presign` | HTTP API `POST /blobs/presign` | Java 21 SnapStart, 512 MB | 15 ms | 300 / 700 ms | Presigned PUT with SHA-256 checksum |
| `ingest-drain` | SQS standard (throttle overflow) | Java 21, 512 MB | 20 ms/msg | 400 / 900 ms | Batch 10, retries with jitter |
| `stream-router` | DynamoDB Streams, batch 100, window 1 s, parallelization 4, filter `SK begins_with F#` | Java 21, 512 MB | 60 ms/batch | 400 / 900 ms | Two SQS FIFO sends per fact, batched |
| `roster-updater` | SQS FIFO, group `(subject, scope)`, batch 10 | Java 21, 512 MB | 25 ms/batch | 400 / 900 ms | CAS on roster version |
| `anti-entropy` | EventBridge Scheduler, hourly per active partition, plus on-demand | Rust `provided.al2023`, 256 MB | 80 ms | 20 / 60 ms | Cross-region reads via peer endpoint |
| `fact-export` | Step Functions Express (monthly / on demand) | Java 21, 2048 MB | — | — | DynamoDB export → Parquet |

Cold starts on `sync-api` are visible to learners only as sync latency; the
device never blocks on sync. Provisioned concurrency is not used; SnapStart
keeps p99 under one second.

---

## Propagation path

1. Device → `sync-api` (regional). Facts written with conditional put; envelope stamped.
2. `facts` stream (in every region of the zone, including replicated writes) → `stream-router`.
3. `stream-router` → SQS FIFO `roster` (group = subject#scope) and SQS FIFO `views` (group = partition, consumed by MVA).
4. `roster-updater` → `derived.Roster` (CAS) → EventBridge `fact.folded` (regional) for capabilities that watch specific types (COM notifications, LTI inbound).
5. Anti-entropy runs hourly per partition; repairs are ordinary puts and re-enter step 2.

End-to-end from device push to roster visibility in the ingest region: p50
< 2 s. To a peer region: p50 < 3 s, bounded above only by replication lag,
which is why views display it.

---

## Cost model

| Component | L10k (10,000 learners, 2 regions) | 1M learners (100×) | Basis |
|---|---|---|---|
| Fact writes | 2.5 M × 1.2 rWRU × 2 regions = 6 M rWRU ≈ **$5.6** | $560 | $0.9375 / M rWRU |
| Data keys, ledgers, registry | ≈ **$1** | $60 | small item writes |
| Fact storage (incremental per month) | 3 GB × 2 × ($0.25 + $0.20 PITR) ≈ **$2.7 / month, cumulative** | $270 / month cumulative | grows linearly |
| Sync API | 600 k × $1/M + Lambda 600 k × 0.15 s × 1 GB ≈ **$2.3** | $230 | |
| Sync reads (roster + ranges) | ~2 M RRU ≈ **$0.3** | $30 | |
| Stream router | 5 M records / 100 × 0.3 s × 0.5 GB ≈ **$0.2**; SQS 1 M req ≈ $0.5 | $70 | stream reads free |
| Roster updater | 5 M facts: writes 5 M WRU ≈ $3.1; Lambda ≈ $0.5 | $360 | regional WRU |
| Anti-entropy | 1,000 partitions × 24 × 30 × (Lambda + ~4 RRU) ≈ **$2** | $150 (partitions scale with cohorts) | |
| Blob upload/storage (facts > 4 KB) | 50 k blobs, 2 GB, CRR ≈ **$1** | $100 | |
| **Total** | **≈ $19 / month** (+ $2.7 / month cumulative storage) | ≈ $1,800 | |

The dominant term at scale is the replicated fact write; it is linear and
already the cheapest durable multi-region write available. Nothing in this
capability has an idle cost above Route 53 and KMS key rental (ADM).

---

## Standards conformance

This capability has no direct standard. It provides the log that DIO projects
to Caliper 1.2 and the timestamps LTI AGS and OneRoster gradebook use. The
`sync_hlc` physical component is the timestamp those projections carry.

---

## Known Tensions

1. **Envelope divergence.** The same fact ingested in two regions may carry
   two `sync_hlc` values; LWW keeps one. Any derivation that uses `sync_hlc`
   for ordering can, in principle, differ across regions until the envelope
   converges. Bound: the retry window (seconds). Mitigation: ordering ties
   are broken by `fact_id`, and lateness policy defaults to `grace(24h)`,
   which is insensitive to second-level envelope differences. Residual:
   a fact within seconds of a deadline can be `late` in one region and not
   in another until replication settles. Recommendation: accept; display the
   envelope as "synced at" and never as an adjudication.

2. **Seq reuse across regions.** A device that writes different content at
   the same seq to two regions (bug plus region switch) loses one fact to
   LWW. The hash chain (`prev`) makes this detectable and the device's local
   log makes it repairable (FLS-03), but it is not preventable without a
   cross-region conditional write. Recommendation: accept; treat as a client
   defect class with telemetry.

3. **Queued acceptance is not durability.** `status = queued` means the
   region has the fact in SQS, not in the table. Loss window: an SQS outage
   coinciding with a DynamoDB throttle. The device keeps its copy until the
   roster confirms, so the loss is a delay, not data loss. Recommendation:
   accept; surface as "confirming" in the UI.

4. **Encryption versus content addressing.** The hash is over plaintext, so
   the server sees plaintext on ingest and the item's ciphertext differs per
   region. Anti-entropy compares `fact_id`s, not bytes. Erasure by key
   destruction leaves ciphertext and plaintext metadata (who, which item,
   when); see ADM Known Tensions for the residual pseudonymous trace.

5. **Abandonment is a judgement.** Folding past a gap after 30 days makes
   later facts visible at the cost of admitting a hole. If the device
   returns, its gap-fill facts fold normally and the hole closes; views that
   exposed `has_hole` re-derive. Recommendation: keep 30 days as a tenant
   policy default.
