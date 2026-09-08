/** A random UUID (RFC 9562 version 4), used for operation identifiers and learner references. */
export function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}
