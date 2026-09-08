/**
 * Web Crypto is the one cryptographic API shared by the browser and the box
 * runtime (Node or Bun), so every helper in this package goes through it and
 * nothing else. Keys generated here stay inside the platform's key store, and
 * device private keys are never exportable where the runtime supports that.
 */
export function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    throw new Error("Web Crypto is unavailable: the shell must run in a secure context");
  }
  return subtle;
}

export function getRandomValues(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Web Crypto accepts only views over a plain `ArrayBuffer`. Nothing in this
 * package is ever backed by a `SharedArrayBuffer`, so narrowing the type is
 * safe; TypeScript cannot see that on its own since `Uint8Array` defaults to
 * `ArrayBufferLike`.
 */
export function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as Uint8Array<ArrayBuffer>;
}
