import { asBufferSource, getSubtle } from "./subtle";

/** SHA-256 over bytes, used for previous-record hashes and content addresses. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await getSubtle().digest("SHA-256", asBufferSource(bytes)));
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] as number) ^ (right[index] as number);
  }
  return difference === 0;
}
