import { decode, encode, rfc8949EncodeOptions } from "cborg";

/**
 * Canonical CBOR is the one encoding every peer uses for anything that is
 * signed or hashed: the RFC 8949 section 4.2 deterministic form, with the
 * shortest integer encodings, map keys sorted bytewise by their encoded
 * form, and no indefinite lengths. Two peers encoding the same value get the
 * same bytes, so a signature over those bytes means the same thing anywhere.
 *
 * Properties whose value is `undefined` are omitted rather than encoded, so
 * an optional field left out and one set to `undefined` are the same value.
 */
const ENCODE_OPTIONS = Object.freeze({
  ...rfc8949EncodeOptions,
  ignoreUndefinedProperties: true,
});

export function encodeCanonical(value: unknown): Uint8Array {
  return encode(value, ENCODE_OPTIONS);
}

/**
 * Strict decoding for bytes from other peers. Maps decode to `Map` so a
 * hostile key such as `__proto__` is inert data; duplicate keys, indefinite
 * lengths, `undefined`, NaN, infinities, and integers outside the safe range
 * are refused. Callers validate the decoded value against a schema before
 * using it.
 */
const DECODE_OPTIONS = Object.freeze({
  strict: true,
  useMaps: true,
  rejectDuplicateMapKeys: true,
  allowIndefinite: false,
  allowUndefined: false,
  allowNaN: false,
  allowInfinity: false,
  allowBigInt: false,
});

export function decodeCanonical(bytes: Uint8Array): unknown {
  return decode(bytes, DECODE_OPTIONS);
}
