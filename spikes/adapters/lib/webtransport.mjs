// automerge-repo network adapters over hash-pinned WebTransport (spike 1.2).
// The device adapter takes the WebTransport constructor so the same code runs
// in the browser and, for the acceptance suite, in Node.

import { SpikeAdapter } from "./base.mjs";
import { FrameParser, frame } from "./framing.mjs";
import { decodeMessage, encodeMessage, joinMessage, peerMessage } from "./handshake.mjs";

export class WebTransportDeviceAdapter extends SpikeAdapter {
  #url;
  #hashes;
  #WebTransport;
  #transport;
  #writer;
  #remotePeerId;
  #connected = false;

  constructor({ url, serverCertificateHashes, WebTransport }) {
    super();
    this.#url = url;
    this.#hashes = serverCertificateHashes;
    this.#WebTransport = WebTransport;
  }

  #attempt = 0;

  connect(peerId, peerMetadata = {}) {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    this.#connected = true;
    this.#run().catch(() => {});
  }

  /** Keeps a session up while connected: the box may restart its listener or drop the stream. */
  async #run() {
    while (this.#connected) {
      try {
        await this.#open();
      } catch {
        // The session failed or was closed; retry below unless we disconnected.
      }
      this.#lost();
      if (!this.#connected) return;
      this.#attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** this.#attempt, 3000)));
    }
  }

  async #open() {
    const transport = new this.#WebTransport(this.#url, {
      serverCertificateHashes: this.#hashes.map((value) => ({ algorithm: "sha-256", value })),
    });
    this.#transport = transport;
    await transport.ready;
    const stream = await transport.createBidirectionalStream();
    this.#writer = stream.writable.getWriter();
    await this.#writer.write(frame(joinMessage(this.peerId, this.peerMetadata)));
    const reader = stream.readable.getReader();
    const parser = new FrameParser();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const bytes of parser.push(value)) {
        this.#receive(decodeMessage(bytes));
      }
    }
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
    this.#writer = undefined;
    if (this.#remotePeerId !== undefined) {
      const peerId = this.#remotePeerId;
      this.#remotePeerId = undefined;
      this.emit("peer-disconnected", { peerId });
    }
  }

  send(message) {
    if (!this.#connected || !this.#writer) return;
    this.#writer.write(frame(encodeMessage(message))).catch(() => {});
  }

  disconnect() {
    this.#connected = false;
    this.#lost();
    try {
      this.#transport?.close();
    } catch {
      // Already closed.
    }
    this.emit("close");
  }
}

/** The box side: one HTTP/3 session stream, one bidirectional stream per device. */
export class WebTransportBoxAdapter extends SpikeAdapter {
  #server;
  #path;
  #peers = new Map();
  #pendingJoins = [];
  #connected = false;
  #closed = false;

  constructor({ server, path = "/sync" }) {
    super();
    this.#server = server;
    this.#path = path;
    this.#accept().catch(() => {});
    this.markReady();
  }

  async #accept() {
    const sessions = this.#server.sessionStream(this.#path).getReader();
    for (;;) {
      const { done, value: session } = await sessions.read();
      if (done || this.#closed) return;
      this.#session(session).catch(() => {});
    }
  }

  async #session(session) {
    await session.ready;
    const streams = session.incomingBidirectionalStreams.getReader();
    for (;;) {
      const { done, value: stream } = await streams.read();
      if (done) return;
      this.#stream(stream).catch(() => {});
    }
  }

  async #stream(stream) {
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    const parser = new FrameParser();
    let peerId;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const bytes of parser.push(value)) {
        const message = decodeMessage(bytes);
        if (message.type === "join") {
          peerId = message.senderId;
          const admit = () => {
            this.#peers.set(peerId, writer);
            writer
              .write(frame(peerMessage(this.peerId, peerId, this.peerMetadata ?? {})))
              .catch(() => {});
            this.emit("peer-candidate", { peerId, peerMetadata: message.peerMetadata ?? {} });
          };
          if (this.#connected) admit();
          else this.#pendingJoins.push(admit);
        } else if (this.#connected) {
          this.emit("message", message);
        }
      }
    }
    if (peerId !== undefined && this.#peers.delete(peerId)) {
      this.emit("peer-disconnected", { peerId });
    }
  }

  connect(peerId, peerMetadata = {}) {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    this.#connected = true;
    for (const admit of this.#pendingJoins.splice(0)) admit();
  }

  send(message) {
    if (!this.#connected) return;
    const writer = this.#peers.get(message.targetId);
    writer?.write(frame(encodeMessage(message))).catch(() => {});
  }

  disconnect() {
    this.#connected = false;
    for (const [peerId, writer] of this.#peers) {
      writer.close().catch(() => {});
      this.emit("peer-disconnected", { peerId });
    }
    this.#peers.clear();
    this.emit("close");
  }

  close() {
    this.#closed = true;
    this.disconnect();
  }
}
