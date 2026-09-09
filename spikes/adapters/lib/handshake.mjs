// The peer handshake automerge-repo's WebSocket adapters use, reused so the
// Repo on each side sees a peer exactly as it would over a WebSocket: the
// client sends `join`, the server answers `peer`, and every later frame is a
// Repo message passed through unchanged.
import { decode, encode } from "@automerge/automerge-repo/helpers/cbor.js";

export const PROTOCOL_VERSION = "1";

export function joinMessage(senderId, peerMetadata) {
  return encode({
    type: "join",
    senderId,
    peerMetadata,
    supportedProtocolVersions: [PROTOCOL_VERSION],
  });
}

export function peerMessage(senderId, targetId, peerMetadata) {
  return encode({
    type: "peer",
    senderId,
    targetId,
    peerMetadata,
    selectedProtocolVersion: PROTOCOL_VERSION,
  });
}

export function encodeMessage(message) {
  return encode(message);
}

export function decodeMessage(bytes) {
  return decode(bytes);
}
