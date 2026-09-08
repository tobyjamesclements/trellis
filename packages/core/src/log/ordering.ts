import type { Envelope } from "./record";

/**
 * The total order every fold applies (class-state-log: "State is a
 * deterministic fold evaluated on read"): Lamport clock, then signer key,
 * then the signer's sequence number. The identifier is a last resort that
 * keeps the order total even over a set that violates the sequence rules.
 */
export function compareEnvelopes(a: Envelope, b: Envelope): number {
  if (a.lamport !== b.lamport) {
    return a.lamport - b.lamport;
  }
  if (a.signer !== b.signer) {
    return a.signer < b.signer ? -1 : 1;
  }
  if (a.seq !== b.seq) {
    return a.seq - b.seq;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}
