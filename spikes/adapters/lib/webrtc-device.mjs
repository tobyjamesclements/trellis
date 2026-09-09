// The device side of signalling-free WebRTC as an automerge-repo network
// adapter, free of Node imports so it bundles for the browser. It takes the
// RTCPeerConnection constructor: the browser's, or werift's in Node for the
// acceptance suite.
import { SpikeAdapter } from "./base.mjs";
import { decodeMessage, encodeMessage, joinMessage } from "./handshake.mjs";

/** The answer a device builds for the box from the static parameters it holds. */
export function answerFor(params, offerSdp) {
  const mid = /a=mid:(\S+)/.exec(offerSdp)?.[1] ?? "0";
  const sctpPort = /a=sctp-port:(\d+)/.exec(offerSdp)?.[1] ?? "5000";
  return [
    "v=0",
    "o=- 0 0 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "a=ice-lite",
    `a=group:BUNDLE ${mid}`,
    "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
    `c=IN IP4 ${params.host}`,
    `a=ice-ufrag:${params.ufrag}`,
    `a=ice-pwd:${params.pwd}`,
    `a=fingerprint:sha-256 ${params.fingerprint}`,
    `a=setup:${params.setup}`,
    `a=mid:${mid}`,
    `a=sctp-port:${sctpPort}`,
    "a=max-message-size:262144",
    `a=candidate:1 1 udp 2130706431 ${params.host} ${params.port} typ host generation 0`,
    "a=end-of-candidates",
    "",
  ].join("\r\n");
}

export const toBytes = (data) =>
  data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength);

export class WebRtcDeviceAdapter extends SpikeAdapter {
  #params;
  #RTCPeerConnection;
  #pc;
  #channel;
  #remotePeerId;
  #connected = false;

  constructor({ params, RTCPeerConnection }) {
    super();
    this.#params = params;
    this.#RTCPeerConnection = RTCPeerConnection;
  }

  #attempt = 0;

  connect(peerId, peerMetadata = {}) {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    this.#connected = true;
    this.#run().catch(() => {});
  }

  /** Keeps a connection up while connected: the box re-listens after each device leaves. */
  async #run() {
    while (this.#connected) {
      try {
        await this.#open();
      } catch {
        // Failed or closed; retry below unless we disconnected.
      }
      this.#lost();
      try {
        this.#channel?.close();
        this.#pc?.close();
      } catch {
        // Already closed.
      }
      this.#channel = undefined;
      if (!this.#connected) return;
      this.#attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** this.#attempt, 3000)));
    }
  }

  /** Resolves when the connection has ended, or rejects if it never opened within the timeout. */
  async #open() {
    const pc = new this.#RTCPeerConnection({ iceServers: [] });
    this.#pc = pc;
    const channel = pc.createDataChannel("automerge");
    channel.binaryType = "arraybuffer";
    this.#channel = channel;
    let opened = false;
    let settle;
    const ended = new Promise((resolve, reject) => {
      settle = { resolve, reject };
    });
    const timer = setTimeout(() => {
      if (!opened) settle.reject(new Error("data channel did not open"));
    }, 10_000);
    const onMessage = (data) => this.#receive(decodeMessage(toBytes(data)));
    const onOpen = () => {
      opened = true;
      channel.send(
        this.#isWerift(channel)
          ? Buffer.from(joinMessage(this.peerId, this.peerMetadata))
          : joinMessage(this.peerId, this.peerMetadata),
      );
    };
    const onEnd = () => settle.resolve();
    if (this.#isWerift(channel)) {
      channel.onMessage.subscribe(onMessage);
      channel.stateChanged.subscribe((state) => {
        if (state === "open") onOpen();
        if (state === "closed") onEnd();
      });
      pc.connectionStateChange.subscribe((state) => {
        if (state === "failed" || state === "closed") onEnd();
      });
    } else {
      channel.onmessage = (event) => onMessage(event.data);
      channel.onopen = onOpen;
      channel.onclose = onEnd;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") onEnd();
      };
    }
    const offer = await pc.createOffer();
    // werift falls back to a public STUN server when none is configured and
    // waits five seconds for it before checking anything; a device on the
    // box's LAN needs no STUN at all.
    for (const transport of pc.iceTransports ?? []) {
      if (transport.connection) transport.connection.stunServer = undefined;
    }
    await pc.setLocalDescription(offer);
    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerFor(this.#params, pc.localDescription.sdp),
    });
    try {
      await ended;
    } finally {
      clearTimeout(timer);
    }
  }

  #isWerift(channel) {
    return typeof channel.onMessage?.subscribe === "function";
  }

  #receive(message) {
    if (!this.#connected) return;
    if (message.type === "peer") {
      this.#attempt = 0;
      this.#remotePeerId = message.senderId;
      this.emit("peer-candidate", {
        peerId: message.senderId,
        peerMetadata: message.peerMetadata ?? {},
      });
      this.markReady();
      return;
    }
    this.emit("message", message);
  }

  #lost() {
    if (this.#remotePeerId !== undefined) {
      const peerId = this.#remotePeerId;
      this.#remotePeerId = undefined;
      this.emit("peer-disconnected", { peerId });
    }
  }

  send(message) {
    if (!this.#connected || !this.#channel) return;
    const bytes = encodeMessage(message);
    try {
      this.#channel.send(this.#isWerift(this.#channel) ? Buffer.from(bytes) : bytes);
    } catch {
      // Channel not open yet or already closed.
    }
  }

  disconnect() {
    this.#connected = false;
    this.#lost();
    try {
      this.#channel?.close();
      this.#pc?.close();
    } catch {
      // Already closed.
    }
    this.emit("close");
  }
}
