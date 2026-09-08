import { decodeCanonical, encodeCanonical } from "../cbor/canonical";
import { sha256 } from "../crypto/hash";
import { isKeyId, type KeyId, type SigningKey } from "../crypto/keys";
import { sign, verify } from "../crypto/signatures";
import * as s from "../schema/schema";

/**
 * The operation record (class-state-log: "Operation record format").
 *
 * A record is two byte strings: the signed body, which is the canonical CBOR
 * of the envelope plus the payload, and the signature over exactly those
 * bytes. Storing the signed bytes verbatim means a verifier never has to
 * re-encode anything, so no encoder difference can ever break a signature.
 *
 * The envelope carries, in clear: the operation identifier, the log it
 * belongs to, the type, the schema version it was written under, the signing
 * device key, the acting learner reference when a shared device acts for a
 * learner, the signer's sequence number in this log, the Lamport clock, the
 * hash of the signer's previous record in this log, and the signer's wall
 * clock as information only. The payload is canonical CBOR in site and class
 * logs and ciphertext under the learner record key in learner logs.
 */
export type LogKind = "site" | "class" | "learner";

export const LOG_KINDS: readonly LogKind[] = ["site", "class", "learner"];

/** What identifies a log document to the records inside it. */
export interface LogIdentity {
  readonly id: string;
  readonly kind: LogKind;
  readonly site: KeyId;
  readonly schema: string;
}

export interface Envelope {
  readonly id: string;
  readonly log: string;
  readonly type: string;
  readonly schema: string;
  readonly signer: KeyId;
  readonly actor?: string;
  readonly seq: number;
  readonly lamport: number;
  readonly prev: Uint8Array | null;
  readonly time: number;
}

export interface OperationRecord {
  readonly envelope: Envelope;
  readonly payload: Uint8Array;
  readonly signature: Uint8Array;
  /** The exact bytes the signature covers. */
  readonly signed: Uint8Array;
  /** The bytes stored in the log document, hashed for `prev` chains. */
  readonly bytes: Uint8Array;
}

export const OPERATION_TYPE_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
export const SCHEMA_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export const keyIdSchema: s.Schema<KeyId> = {
  description: "key id",
  parse(value, path = "") {
    if (!isKeyId(value)) {
      throw new s.SchemaError(path, "expected an algorithm-prefixed key id");
    }
    return value;
  },
};

const SIGNED_BODY = s.object({
  id: s.uuid(),
  log: s.string({ min: 1, max: 128 }),
  type: s.string({ max: 64, pattern: OPERATION_TYPE_PATTERN }),
  schema: s.string({ pattern: SCHEMA_VERSION_PATTERN }),
  signer: keyIdSchema,
  actor: s.optional(s.uuid()),
  seq: s.integer({ min: 1 }),
  lamport: s.integer({ min: 1 }),
  prev: s.nullable(s.bytes({ length: 32 })),
  time: s.integer({ min: 0 }),
  payload: s.bytes(),
});

const STORED_RECORD = s.tuple(s.bytes(), s.bytes({ length: 64 }));

export class RecordFormatError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RecordFormatError";
  }
}

export interface SchemaVersion {
  readonly major: number;
  readonly minor: number;
}

export function parseSchemaVersion(version: string): SchemaVersion {
  const match = SCHEMA_VERSION_PATTERN.exec(version);
  if (match === null) {
    throw new RecordFormatError(`invalid schema version "${version}"`);
  }
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function signedBody(envelope: Envelope, payload: Uint8Array): Record<string, unknown> {
  // Listed field by field so nothing beyond the declared envelope is signed.
  return {
    id: envelope.id,
    log: envelope.log,
    type: envelope.type,
    schema: envelope.schema,
    signer: envelope.signer,
    actor: envelope.actor,
    seq: envelope.seq,
    lamport: envelope.lamport,
    prev: envelope.prev,
    time: envelope.time,
    payload,
  };
}

/** Signs an envelope and payload with a key this peer holds, producing the stored record. */
export async function signRecord(
  key: SigningKey,
  envelope: Envelope,
  payload: Uint8Array,
): Promise<OperationRecord> {
  if (envelope.signer !== key.id) {
    throw new Error("envelope signer does not match the signing key");
  }
  const signed = encodeCanonical(signedBody(envelope, payload));
  // Round-trip through the schema so a locally built envelope obeys the same
  // rules as one read from a peer.
  const checked = SIGNED_BODY.parse(decodeCanonical(signed));
  const signature = await sign(key, signed);
  const bytes = encodeCanonical([signed, signature]);
  const { payload: _payload, ...envelopeOut } = checked;
  return { envelope: envelopeOut, payload, signature, signed, bytes };
}

/** Decodes stored bytes into a record, throwing `RecordFormatError` on anything malformed. */
export function decodeRecord(bytes: Uint8Array): OperationRecord {
  try {
    const [signed, signature] = STORED_RECORD.parse(decodeCanonical(bytes));
    const { payload, ...envelope } = SIGNED_BODY.parse(decodeCanonical(signed));
    return { envelope, payload, signature, signed, bytes };
  } catch (error) {
    throw new RecordFormatError(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
}

export function verifyRecord(record: OperationRecord): Promise<boolean> {
  return verify(record.envelope.signer, record.signed, record.signature);
}

export function recordHash(record: OperationRecord): Promise<Uint8Array> {
  return sha256(record.bytes);
}
