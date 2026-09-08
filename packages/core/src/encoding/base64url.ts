/**
 * Base64url (RFC 4648 section 5) without padding.
 *
 * Used for key identifiers and anywhere bytes must travel inside a string,
 * such as a class code's QR form. Implemented by hand so that the same code
 * runs in the browser and on the box without a Buffer dependency.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const DECODE = new Map<string, number>(Array.from(ALPHABET, (char, index) => [char, index]));

export function base64urlEncode(bytes: Uint8Array): string {
  let output = "";
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const triple =
      ((bytes[index] as number) << 16) |
      ((bytes[index + 1] as number) << 8) |
      (bytes[index + 2] as number);
    output +=
      ALPHABET.charAt((triple >> 18) & 63) +
      ALPHABET.charAt((triple >> 12) & 63) +
      ALPHABET.charAt((triple >> 6) & 63) +
      ALPHABET.charAt(triple & 63);
  }
  const remaining = bytes.length - index;
  if (remaining === 1) {
    const value = bytes[index] as number;
    output += ALPHABET.charAt(value >> 2) + ALPHABET.charAt((value & 3) << 4);
  } else if (remaining === 2) {
    const value = ((bytes[index] as number) << 8) | (bytes[index + 1] as number);
    output +=
      ALPHABET.charAt(value >> 10) +
      ALPHABET.charAt((value >> 4) & 63) +
      ALPHABET.charAt((value & 15) << 2);
  }
  return output;
}

export function base64urlDecode(text: string): Uint8Array {
  if (text.length % 4 === 1) {
    throw new Error("base64url: invalid length");
  }
  const fullGroups = Math.floor(text.length / 4);
  const remaining = text.length % 4;
  const output = new Uint8Array(fullGroups * 3 + (remaining === 0 ? 0 : remaining - 1));
  let outIndex = 0;
  let inIndex = 0;
  const sextet = (position: number): number => {
    const value = DECODE.get(text[position] as string);
    if (value === undefined) {
      throw new Error(`base64url: invalid character at ${position}`);
    }
    return value;
  };
  for (let group = 0; group < fullGroups; group += 1, inIndex += 4) {
    const value =
      (sextet(inIndex) << 18) |
      (sextet(inIndex + 1) << 12) |
      (sextet(inIndex + 2) << 6) |
      sextet(inIndex + 3);
    output[outIndex++] = (value >> 16) & 255;
    output[outIndex++] = (value >> 8) & 255;
    output[outIndex++] = value & 255;
  }
  if (remaining === 2) {
    const value = (sextet(inIndex) << 6) | sextet(inIndex + 1);
    if ((value & 15) !== 0) {
      throw new Error("base64url: non-zero padding bits");
    }
    output[outIndex++] = value >> 4;
  } else if (remaining === 3) {
    const value = (sextet(inIndex) << 12) | (sextet(inIndex + 1) << 6) | sextet(inIndex + 2);
    if ((value & 3) !== 0) {
      throw new Error("base64url: non-zero padding bits");
    }
    output[outIndex++] = value >> 10;
    output[outIndex++] = (value >> 2) & 255;
  }
  return output;
}
