import { decodeCanonical } from "../cbor/canonical";
import { bytesEqual } from "../crypto/hash";
import type { KeyId } from "../crypto/keys";
import type { OperationRegistry, Principal } from "./dsl";
import { compareEnvelopes } from "./ordering";
import {
  decodeRecord,
  type LogIdentity,
  type OperationRecord,
  parseSchemaVersion,
  recordHash,
  verifyRecord,
} from "./record";

/**
 * The fold (class-state-log: "State is a deterministic fold evaluated on
 * read"). Given the records of one log, it verifies every signature, discards
 * records whose signer lacked authority at their logical time, orders what
 * remains by Lamport clock, signer, and sequence number, and applies each
 * declared reducer. Unknown operation types and unsupported major schema
 * versions are skipped and counted, never thrown. The result is a pure
 * function of the set of records: arrival order plays no part.
 */
export type RejectionReason =
  | "malformed"
  | "id-mismatch"
  | "misdirected"
  | "bad-signature"
  | "unauthorised"
  | "invalid-payload"
  | "inapplicable";

export interface Rejection {
  readonly id: string;
  readonly reason: RejectionReason;
  readonly detail: string;
  readonly type?: string;
  readonly signer?: KeyId;
}

export type SkipReason = "unknown-type" | "unsupported-schema";

export interface Skip {
  readonly id: string;
  readonly reason: SkipReason;
  readonly type: string;
  readonly schema: string;
  readonly signer: KeyId;
}

export type ChainWarningKind = "chain-gap" | "chain-fork" | "chain-mismatch";

/** A signer's sequence or previous-hash chain is inconsistent: records are missing, or a device wrote two histories. */
export interface ChainWarning {
  readonly kind: ChainWarningKind;
  readonly signer: KeyId;
  readonly seq: number;
  readonly ids: readonly string[];
}

/** The highest sequence number a signer has in this log and the hash of that record, for a writer to continue its chain. */
export interface SignerProgress {
  readonly seq: number;
  readonly hash: Uint8Array;
}

export interface FoldResult<State> {
  readonly state: State;
  readonly applied: number;
  readonly rejected: readonly Rejection[];
  readonly skipped: readonly Skip[];
  readonly warnings: readonly ChainWarning[];
  /** The highest Lamport clock among records from admitted signers. */
  readonly lamport: number;
  readonly signers: ReadonlyMap<KeyId, SignerProgress>;
}

export interface FoldOptions<State> {
  readonly log: LogIdentity;
  readonly registry: OperationRegistry<State>;
  readonly initialState: () => State;
  /** The principal a signer was at a logical time, judged from the state so far. */
  readonly principalAt: (state: State, signer: KeyId, lamport: number) => Principal | undefined;
}

const VERIFY_BATCH = 128;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Verified {
  readonly record: OperationRecord;
  readonly hash: Uint8Array;
}

export async function foldRecords<State>(
  entries: Iterable<readonly [string, Uint8Array]>,
  options: FoldOptions<State>,
): Promise<FoldResult<State>> {
  const rejected: Rejection[] = [];
  const skipped: Skip[] = [];

  const decoded: OperationRecord[] = [];
  for (const [key, bytes] of entries) {
    let record: OperationRecord;
    try {
      record = decodeRecord(bytes);
    } catch (error) {
      rejected.push({ id: key, reason: "malformed", detail: message(error) });
      continue;
    }
    const { envelope } = record;
    if (envelope.id !== key) {
      rejected.push({
        id: key,
        reason: "id-mismatch",
        detail: `stored under ${key} but signed as ${envelope.id}`,
        type: envelope.type,
        signer: envelope.signer,
      });
      continue;
    }
    if (envelope.log !== options.log.id) {
      rejected.push({
        id: key,
        reason: "misdirected",
        detail: `signed for log ${envelope.log}`,
        type: envelope.type,
        signer: envelope.signer,
      });
      continue;
    }
    decoded.push(record);
  }

  const verified: Verified[] = [];
  for (let start = 0; start < decoded.length; start += VERIFY_BATCH) {
    const batch = decoded.slice(start, start + VERIFY_BATCH);
    const results = await Promise.all(
      batch.map(async (record) => ({
        record,
        valid: await verifyRecord(record),
        hash: await recordHash(record),
      })),
    );
    for (const { record, valid, hash } of results) {
      if (valid) {
        verified.push({ record, hash });
      } else {
        rejected.push({
          id: record.envelope.id,
          reason: "bad-signature",
          detail: "signature does not verify against the signer key",
          type: record.envelope.type,
          signer: record.envelope.signer,
        });
      }
    }
  }

  verified.sort((a, b) => compareEnvelopes(a.record.envelope, b.record.envelope));

  const state = options.initialState();
  let applied = 0;
  let lamport = 0;
  for (const { record } of verified) {
    const { envelope } = record;
    const principal = options.principalAt(state, envelope.signer, envelope.lamport);
    if (principal !== undefined) {
      lamport = Math.max(lamport, envelope.lamport);
    }
    const declaration = options.registry.get(envelope.type);
    if (declaration === undefined) {
      skipped.push({
        id: envelope.id,
        reason: "unknown-type",
        type: envelope.type,
        schema: envelope.schema,
        signer: envelope.signer,
      });
      continue;
    }
    if (parseSchemaVersion(envelope.schema).major > parseSchemaVersion(declaration.schema).major) {
      skipped.push({
        id: envelope.id,
        reason: "unsupported-schema",
        type: envelope.type,
        schema: envelope.schema,
        signer: envelope.signer,
      });
      continue;
    }
    let payload: unknown;
    try {
      payload = declaration.payload.parse(decodeCanonical(record.payload));
    } catch (error) {
      rejected.push({
        id: envelope.id,
        reason: "invalid-payload",
        detail: message(error),
        type: envelope.type,
        signer: envelope.signer,
      });
      continue;
    }
    if (!declaration.authorise({ envelope, payload, principal, state })) {
      rejected.push({
        id: envelope.id,
        reason: "unauthorised",
        detail:
          principal === undefined
            ? "signer was not admitted, or was revoked, at this logical time"
            : `${principal} may not perform ${envelope.type}`,
        type: envelope.type,
        signer: envelope.signer,
      });
      continue;
    }
    const outcome = declaration.reduce(state, { envelope, payload });
    if (typeof outcome === "string") {
      rejected.push({
        id: envelope.id,
        reason: "inapplicable",
        detail: outcome,
        type: envelope.type,
        signer: envelope.signer,
      });
      continue;
    }
    applied += 1;
  }

  const { warnings, signers } = checkChains(verified);
  return { state, applied, rejected, skipped, warnings, lamport, signers };
}

/**
 * Checks each signer's sequence and previous-hash chain, walking the
 * signer's records in sequence order. Inconsistencies are reported, not
 * enforced: under eventual consistency a gap usually means a record has not
 * arrived yet, and the fold must give the same answer on every peer whatever
 * has arrived. A fork, two records with one sequence number, means a device
 * wrote two histories, which the box reports to the administrator.
 */
function checkChains(verified: readonly Verified[]): {
  warnings: ChainWarning[];
  signers: Map<KeyId, SignerProgress>;
} {
  const bySigner = new Map<KeyId, Verified[]>();
  for (const entry of verified) {
    const signer = entry.record.envelope.signer;
    const list = bySigner.get(signer);
    if (list === undefined) {
      bySigner.set(signer, [entry]);
    } else {
      list.push(entry);
    }
  }

  const warnings: ChainWarning[] = [];
  const signers = new Map<KeyId, SignerProgress>();
  for (const [signer, entries] of [...bySigner.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    entries.sort(
      (a, b) =>
        a.record.envelope.seq - b.record.envelope.seq ||
        compareEnvelopes(a.record.envelope, b.record.envelope),
    );
    let expectedSeq = 1;
    let previous: Verified | undefined;
    for (const entry of entries) {
      const { envelope } = entry.record;
      if (previous !== undefined && envelope.seq === previous.record.envelope.seq) {
        warnings.push({
          kind: "chain-fork",
          signer,
          seq: envelope.seq,
          ids: [previous.record.envelope.id, envelope.id],
        });
        continue;
      }
      if (envelope.seq > expectedSeq) {
        warnings.push({ kind: "chain-gap", signer, seq: expectedSeq, ids: [envelope.id] });
      }
      if (envelope.seq === 1) {
        if (envelope.prev !== null) {
          warnings.push({ kind: "chain-mismatch", signer, seq: 1, ids: [envelope.id] });
        }
      } else if (previous !== undefined && envelope.seq === previous.record.envelope.seq + 1) {
        if (envelope.prev === null || !bytesEqual(envelope.prev, previous.hash)) {
          warnings.push({ kind: "chain-mismatch", signer, seq: envelope.seq, ids: [envelope.id] });
        }
      }
      expectedSeq = envelope.seq + 1;
      previous = entry;
    }
    if (previous !== undefined) {
      signers.set(signer, { seq: previous.record.envelope.seq, hash: previous.hash });
    }
  }
  return { warnings, signers };
}
