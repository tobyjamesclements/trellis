// The box side of spike 1.5 with werift: an ICE-lite agent with static ICE
// credentials and a long-lived DTLS certificate, waiting on a known port for
// a device it has never been told about. No signalling server exists; the
// device learns everything it needs from the parameters returned here, which
// stand in for the site-signed QR contents.
//
// Two things werift does not offer as configuration, done here by hand and
// noted in the README as the upstream asks:
//   1. static ICE credentials, set on the ICE connection before answering;
//   2. accepting an unknown peer certificate: the device authenticates at the
//      application layer afterwards, so the box records the peer's
//      fingerprint instead of verifying it against a value it cannot know.
import { RTCPeerConnection } from "werift";
import { fingerprintOf } from "./keys.mjs";

// The device's real offer is unknown when the box starts, so it answers a
// placeholder with the same shape as a browser's data-channel offer.
const PLACEHOLDER_OFFER = [
  "v=0",
  "o=- 0 0 IN IP4 0.0.0.0",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=msid-semantic: WMS",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:unknown",
  "a=ice-pwd:unknownunknownunknownunknown",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
  // Stated as active so werift answers passive: the box is the DTLS server
  // that waits for whoever arrives, and the device's real offer is actpass.
  "a=setup:active",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

export async function startBox({ host, port, keys, ufrag, pwd }) {
  const pc = new RTCPeerConnection({
    iceLite: true,
    // werift insists on a range wider than one port; the QR carries the port it picked.
    icePortRange: [port, port + 1],
    iceUseIpv4: true,
    iceUseIpv6: false,
    // werift skips loopback when gathering; add the requested address explicitly.
    iceAdditionalHostAddresses: [host],
    iceServers: [],
    dtls: {
      keys: { certPem: keys.certPem, keyPem: keys.keyPem, signatureHash: keys.signatureHash },
    },
  });

  const events = [];
  const log = (event) => events.push({ at: Math.round(performance.now()), event });
  pc.iceConnectionStateChange.subscribe((state) => log(`ice ${state}`));
  pc.connectionStateChange.subscribe((state) => log(`connection ${state}`));

  const channel = new Promise((resolve) => {
    pc.onDataChannel.subscribe((dc) => {
      log(`datachannel ${dc.label}`);
      resolve(dc);
    });
  });

  await pc.setRemoteDescription({ type: "offer", sdp: PLACEHOLDER_OFFER });

  const ice = pc.iceTransports[0].connection;
  ice.localUsername = ufrag;
  ice.localPassword = pwd;
  ice.userHistory[ufrag] = pwd;

  let peerFingerprint;
  const dtls = pc.dtlsTransports[0];
  dtls.verifyRemoteCertificateFingerprint = function recordInsteadOfVerify() {
    const certificate = this.dtls?.remoteCertificate;
    peerFingerprint = certificate ? fingerprintOf(certificate) : "none";
    log(`dtls peer certificate ${peerFingerprint}`);
  };

  // werift answers as the active DTLS side regardless of the offer, and as a
  // DTLS client with an ECDSA key it fails to choose a signature scheme against
  // Chromium. The box must be the passive server in any case: it waits for
  // whoever arrives. werift honours the role written in the local description.
  const answer = await pc.createAnswer();
  await pc.setLocalDescription({
    type: "answer",
    sdp: answer.sdp.replace("a=setup:active", "a=setup:passive"),
  });
  const sdp = pc.localDescription.sdp;
  const candidate =
    [...sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/g)].find(
      (m) => m[1] === host,
    ) ?? /a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/.exec(sdp);
  const params = {
    host: candidate ? candidate[1] : host,
    port: candidate ? Number(candidate[2]) : port,
    ufrag: /a=ice-ufrag:(\S+)/.exec(sdp)[1],
    pwd: /a=ice-pwd:(\S+)/.exec(sdp)[1],
    fingerprint: /a=fingerprint:sha-256 (\S+)/.exec(sdp)[1],
    setup: /a=setup:(\S+)/.exec(sdp)[1],
    candidates: [...sdp.matchAll(/a=candidate:(.+)/g)].map((m) => m[1]),
  };
  if (params.ufrag !== ufrag || params.pwd !== pwd) {
    throw new Error("werift did not use the static ICE credentials");
  }
  if (params.fingerprint.toUpperCase() !== keys.fingerprint.toUpperCase()) {
    throw new Error("werift did not use the static DTLS certificate");
  }

  return {
    params,
    channel,
    events,
    peerFingerprint: () => peerFingerprint,
    close: () => pc.close(),
  };
}
