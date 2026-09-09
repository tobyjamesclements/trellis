// Length-prefixed frames for byte streams: four big-endian bytes of length,
// then the frame. Data channels are message-based and need no framing.
export function frame(bytes) {
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}

export class FrameParser {
  #buffer = new Uint8Array(0);

  /** Feeds a chunk and returns the complete frames it finished. */
  push(chunk) {
    const merged = new Uint8Array(this.#buffer.length + chunk.length);
    merged.set(this.#buffer);
    merged.set(chunk, this.#buffer.length);
    this.#buffer = merged;
    const frames = [];
    for (;;) {
      if (this.#buffer.length < 4) break;
      const length = new DataView(this.#buffer.buffer, this.#buffer.byteOffset).getUint32(0);
      if (this.#buffer.length < 4 + length) break;
      frames.push(this.#buffer.slice(4, 4 + length));
      this.#buffer = this.#buffer.slice(4 + length);
    }
    return frames;
  }
}
