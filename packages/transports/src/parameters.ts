/**
 * Transport parameters the box delivers to every device, signed by the site
 * key, in the admission QR and at every contact (document-sync: "Transport
 * parameters travel with admission and every contact").
 *
 * These are data shapes only. The adapters themselves arrive with task 2.5
 * once the phase 1 spikes (tasks 1.2 to 1.6) have decided which transports
 * passed and in what order a device should prefer them.
 */

export type TransportKind = "webtransport" | "webrtc" | "websocket";

/**
 * Provisional preference order from design decision D12. Task 1.11 fixes the
 * final order from the spike results; until then this is the design's stated
 * intent, not a measured one.
 */
export const PROVISIONAL_TRANSPORT_PREFERENCE: readonly TransportKind[] = [
  "webtransport",
  "webrtc",
  "websocket",
];

/** One entry in the schedule of upcoming hash-pinned WebTransport certificates. */
export interface CertificateHashWindow {
  /** SHA-256 of the DER certificate, as the browser expects in `serverCertificateHashes`. */
  readonly sha256: Uint8Array;
  /** Validity start, milliseconds since the epoch, informational for the device's selection. */
  readonly notBefore: number;
  /** Validity end; browsers require at most fourteen days from `notBefore`. */
  readonly notAfter: number;
}

export interface LanAddress {
  readonly host: string;
  readonly port: number;
}

export interface TransportParameters {
  readonly addresses: readonly LanAddress[];
  /** Covers at least twelve months so a device away for six still connects. */
  readonly webtransportSchedule: readonly CertificateHashWindow[];
  readonly webrtc: {
    readonly iceUsernameFragment: string;
    readonly icePassword: string;
    /** DTLS certificate fingerprint, `sha-256` hex with colons as SDP writes it. */
    readonly dtlsFingerprint: string;
  };
  readonly shellUrl: string;
}
