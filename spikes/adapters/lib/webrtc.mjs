// automerge-repo network adapters over signalling-free WebRTC (spike 1.5).
// The device adapter takes the RTCPeerConnection constructor, so it runs in
// the browser and, for the acceptance suite, in Node with werift as a full
// agent. The box adapter runs werift as an ICE-lite agent; one werift
// connection serves one device on one port, so the spike box takes a list
// of ports and hands each device its own (a UDP front that demultiplexes by
// source address replaces this in the product).

import { X509Certificate } from "node:crypto";
import {
  HashAlgorithm,
  SignatureAlgorithm,
  RTCPeerConnection as WeriftPeerConnection,
} from "werift";
import { SpikeAdapter } from "./base.mjs";
import { decodeMessage, encodeMessage, peerMessage } from "./handshake.mjs";
import { toBytes } from "./webrtc-device.mjs";

export { answerFor, WebRtcDeviceAdapter } from "./webrtc-device.mjs";

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
  "a=setup:active",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

export function makeBoxKeys() {
  const { execFileSync } = process.getBuiltinModule("node:child_process");
  const { mkdtempSync, readFileSync } = process.getBuiltinModule("node:fs");
  const { tmpdir } = process.getBuiltinModule("node:os");
  const { join } = process.getBuiltinModule("node:path");
  const dir = mkdtempSync(join(tmpdir(), "dtls-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "3650",
      "-subj",
      "/CN=trellis-box-dtls",
    ],
    { stdio: "ignore" },
  );
  const certPem = readFileSync(cert, "utf8");
  return {
    certPem,
    keyPem: readFileSync(key, "utf8"),
    signatureHash: { hash: HashAlgorithm.sha256_4, signature: SignatureAlgorithm.ecdsa_3 },
    fingerprint: new X509Certificate(certPem).fingerprint256,
  };
}

/** One waiting werift ICE-lite connection on one port. */
async function listen({ host, port, keys, ufrag, pwd, onChannel, onClose }) {
  const pc = new WeriftPeerConnection({
    iceLite: true,
    icePortRange: [port, port + 1],
    iceUseIpv4: true,
    iceUseIpv6: false,
    iceAdditionalHostAddresses: [host],
    iceServers: [],
    dtls: {
      keys: { certPem: keys.certPem, keyPem: keys.keyPem, signatureHash: keys.signatureHash },
    },
  });
  let peerFingerprint;
  pc.onDataChannel.subscribe((channel) => onChannel(channel, () => peerFingerprint));
  pc.connectionStateChange.subscribe((state) => {
    if (state === "closed" || state === "failed" || state === "disconnected") onClose();
  });
  await pc.setRemoteDescription({ type: "offer", sdp: PLACEHOLDER_OFFER });
  const ice = pc.iceTransports[0].connection;
  ice.localUsername = ufrag;
  ice.localPassword = pwd;
  ice.userHistory[ufrag] = pwd;
  const dtls = pc.dtlsTransports[0];
  dtls.verifyRemoteCertificateFingerprint = function recordInsteadOfVerify() {
    const certificate = this.dtls?.remoteCertificate;
    peerFingerprint = certificate ? new X509Certificate(certificate).fingerprint256 : undefined;
  };
  const answer = await pc.createAnswer();
  await pc.setLocalDescription({
    type: "answer",
    sdp: answer.sdp.replace("a=setup:active", "a=setup:passive"),
  });
  const sdp = pc.localDescription.sdp;
  const candidate = [...sdp.matchAll(/a=candidate:\S+ 1 udp \d+ (\S+) (\d+) typ host/g)].find(
    (m) => m[1] === host,
  );
  return {
    pc,
    params: {
      host,
      port: Number(candidate[2]),
      ufrag,
      pwd,
      fingerprint: /a=fingerprint:sha-256 (\S+)/.exec(sdp)[1],
      setup: /a=setup:(\S+)/.exec(sdp)[1],
    },
  };
}

export class WebRtcBoxAdapter extends SpikeAdapter {
  #host;
  #keys;
  #ufrag;
  #pwd;
  #listeners = new Map();
  #peers = new Map();
  #pendingJoins = [];
  #connected = false;
  #closed = false;
  #readyWhen;
  ready;

  /**
   * `readyWhen: "listening"` (the default) is the box's behaviour: ready as
   * soon as its ports are open. `"first-peer"` is for the acceptance suite,
   * which requests a document 50 ms after constructing the repos; a werift
   * device takes longer than that to connect, and a repo that asks before it
   * has a peer reports the document unavailable.
   */
  constructor({ host, ports, keys, ufrag, pwd, readyWhen = "listening" }) {
    super();
    this.#host = host;
    this.#keys = keys;
    this.#ufrag = ufrag;
    this.#pwd = pwd;
    this.#readyWhen = readyWhen;
    this.ready = Promise.all(ports.map((port) => this.#listen(port))).then(() => {
      if (this.#readyWhen === "listening") this.markReady();
    });
  }

  /** The parameters a device on this port would carry in its QR. */
  paramsFor(port) {
    return this.#listeners.get(port)?.params;
  }

  async #listen(port) {
    const state = { peerId: undefined, listener: undefined };
    const listener = await listen({
      host: this.#host,
      port,
      keys: this.#keys,
      ufrag: this.#ufrag,
      pwd: this.#pwd,
      onChannel: (channel, fingerprint) => {
        channel.onMessage.subscribe((data) => {
          const message = decodeMessage(toBytes(data));
          if (message.type === "join") {
            state.peerId = message.senderId;
            const admit = () => {
              this.#peers.set(state.peerId, {
                channel,
                pc: state.listener.pc,
                port,
                fingerprint: fingerprint(),
              });
              channel.send(
                Buffer.from(peerMessage(this.peerId, state.peerId, this.peerMetadata ?? {})),
              );
              this.emit("peer-candidate", {
                peerId: state.peerId,
                peerMetadata: message.peerMetadata ?? {},
              });
              this.markReady();
            };
            if (this.#connected) admit();
            else this.#pendingJoins.push(admit);
          } else if (this.#connected) {
            this.emit("message", message);
          }
        });
      },
      onClose: () => {
        if (state.listener !== undefined) this.#recycle(port, state.listener);
      },
    });
    state.listener = listener;
    this.#listeners.set(port, listener);
  }

  /**
   * Ends whatever is on a port and waits for the next device there. Idempotent:
   * the connection-state event and a deliberate disconnect may both call it.
   */
  #recycle(port, listener) {
    if (this.#listeners.get(port) !== listener) return;
    this.#listeners.delete(port);
    for (const [peerId, peer] of [...this.#peers]) {
      if (peer.pc === listener.pc) {
        this.#peers.delete(peerId);
        this.emit("peer-disconnected", { peerId });
        // The channel close is what the device notices (a stream reset);
        // closing the werift connection alone tells it nothing.
        try {
          peer.channel.close();
        } catch {
          // Already closed.
        }
      }
    }
    setTimeout(() => {
      try {
        listener.pc.close();
      } catch {
        // Already closed.
      }
      if (!this.#closed) this.#listen(port).catch(() => {});
    }, 150);
  }

  connect(peerId, peerMetadata = {}) {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    this.#connected = true;
    for (const admit of this.#pendingJoins.splice(0)) admit();
  }

  send(message) {
    if (!this.#connected) return;
    const peer = this.#peers.get(message.targetId);
    try {
      peer?.channel.send(Buffer.from(encodeMessage(message)));
    } catch {
      // Channel already closed.
    }
  }

  disconnect() {
    this.#connected = false;
    // Closing the whole werift connection, not just the channel, frees the
    // port so the listener can wait for the device to come back.
    for (const peer of [...this.#peers.values()]) {
      this.#recycle(peer.port, this.#listeners.get(peer.port));
    }
    this.emit("close");
  }

  close() {
    this.#closed = true;
    this.disconnect();
    for (const listener of this.#listeners.values()) listener.pc.close();
    this.#listeners.clear();
  }
}
