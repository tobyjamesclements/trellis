import { describe, expect, it } from "vitest";
import { encodeCanonical } from "../cbor/canonical";
import { generateSigningKey, generateSiteKey } from "../crypto/keys";
import { randomUuid } from "../crypto/random";
import {
  decodeRecord,
  type Envelope,
  type LogIdentity,
  parseSchemaVersion,
  RecordFormatError,
  signRecord,
  verifyRecord,
} from "./record";

describe("operation records", () => {
  it("sign, store, decode, and verify", async () => {
    const site = await generateSiteKey();
    const device = await generateSigningKey({ algorithm: "ed25519" });
    const log: LogIdentity = { id: randomUuid(), kind: "class", site: site.id, schema: "1.0" };
    const envelope: Envelope = {
      id: randomUuid(),
      log: log.id,
      type: "enrolment.added",
      schema: "1.0",
      signer: device.id,
      actor: randomUuid(),
      seq: 1,
      lamport: 4,
      prev: null,
      time: 1_700_000_000_000,
    };
    const payload = encodeCanonical({ learner: randomUuid() });
    const record = await signRecord(device, envelope, payload);
    expect(record.envelope).toEqual(envelope);
    expect(await verifyRecord(record)).toBe(true);

    const decoded = decodeRecord(record.bytes);
    expect(decoded.envelope).toEqual(envelope);
    expect(decoded.payload).toEqual(payload);
    expect(decoded.signed).toEqual(record.signed);
    expect(decoded.signature).toEqual(record.signature);
    expect(await verifyRecord(decoded)).toBe(true);

    // The signature covers the envelope and the payload: changing either breaks it.
    const forgedPayload = encodeCanonical([
      encodeCanonical({ ...envelope, payload: encodeCanonical({ learner: randomUuid() }) }),
      record.signature,
    ]);
    expect(await verifyRecord(decodeRecord(forgedPayload))).toBe(false);
    const forgedClock = encodeCanonical([
      encodeCanonical({ ...envelope, lamport: 99, payload }),
      record.signature,
    ]);
    expect(await verifyRecord(decodeRecord(forgedClock))).toBe(false);
  });

  it("refuses to sign with a key other than the envelope's signer", async () => {
    const device = await generateSigningKey({ algorithm: "ed25519" });
    const other = await generateSigningKey({ algorithm: "p256" });
    const envelope: Envelope = {
      id: randomUuid(),
      log: "log",
      type: "class.started",
      schema: "1.0",
      signer: other.id,
      seq: 1,
      lamport: 1,
      prev: null,
      time: 0,
    };
    await expect(signRecord(device, envelope, encodeCanonical({}))).rejects.toThrow(/signer/);
  });

  it("rejects malformed stored bytes with a RecordFormatError", async () => {
    const device = await generateSigningKey({ algorithm: "ed25519" });
    const body = {
      id: randomUuid(),
      log: "log",
      type: "class.started",
      schema: "1.0",
      signer: device.id,
      seq: 1,
      lamport: 1,
      prev: null,
      time: 0,
      payload: encodeCanonical({}),
    };
    const stored = (overrides: Record<string, unknown>, signature = new Uint8Array(64)) =>
      encodeCanonical([encodeCanonical({ ...body, ...overrides }), signature]);

    expect(() => decodeRecord(new Uint8Array([1, 2, 3]))).toThrow(RecordFormatError);
    expect(() => decodeRecord(encodeCanonical({ not: "a record" }))).toThrow(RecordFormatError);
    expect(() => decodeRecord(stored({}, new Uint8Array(63)))).toThrow(/64 bytes/);
    expect(() => decodeRecord(stored({ seq: 0 }))).toThrow(/seq/);
    expect(() => decodeRecord(stored({ lamport: 1.5 }))).toThrow(/lamport/);
    expect(() => decodeRecord(stored({ signer: "rsa:abc" }))).toThrow(/signer/);
    expect(() => decodeRecord(stored({ type: "Started" }))).toThrow(/type/);
    expect(() => decodeRecord(stored({ schema: "1" }))).toThrow(/schema/);
    expect(() => decodeRecord(stored({ prev: new Uint8Array(31) }))).toThrow(/prev/);
    expect(() => decodeRecord(stored({ id: "not-a-uuid" }))).toThrow(/id/);
    expect(() => decodeRecord(stored({ actor: "nobody" }))).toThrow(/actor/);
    expect(() => decodeRecord(stored({ payload: "text" }))).toThrow(/payload/);
    expect(decodeRecord(stored({})).envelope.type).toBe("class.started");
  });

  it("parses schema versions", () => {
    expect(parseSchemaVersion("1.0")).toEqual({ major: 1, minor: 0 });
    expect(parseSchemaVersion("12.34")).toEqual({ major: 12, minor: 34 });
    expect(() => parseSchemaVersion("01.0")).toThrow(RecordFormatError);
    expect(() => parseSchemaVersion("1")).toThrow(RecordFormatError);
  });
});
