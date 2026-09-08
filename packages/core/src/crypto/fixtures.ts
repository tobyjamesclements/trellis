/**
 * Known-answer material for the signature tests.
 *
 * The RFC 8032 vectors pin Ed25519 verification to the standard. The
 * `boxSigned` fixtures were produced once by Node's Web Crypto, the box
 * runtime, so that the browser project verifying them is a genuine
 * cross-runtime check: the device verifying what the box signed.
 */
export const RFC8032 = {
  test1: {
    publicKeyHex: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
    messageHex: "",
    signatureHex:
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  },
  test2: {
    publicKeyHex: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
    messageHex: "72",
    signatureHex:
      "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
  },
} as const;

export const boxSigned = {
  message: "trellis fixture: signed by the box runtime",
  ed25519: {
    keyId: "ed25519:nwqkGHVLuaYnIKCj_yb4cAXvq1AqHlOfbG6aMVvbggM",
    signature:
      "pzfrGtUf9hw5jPOXcfSElsKgLH6N0tMolTUuCX6NUKX-8MpN_n2QLwQHNr5Q1C-T2JOny-bzSY6m1JTjbJ3yCQ",
  },
  p256: {
    keyId:
      "p256:BFMPFE6h_NgP0mRtYuXQ83fw2BUvmmF6ecezFXf5wpL6rjFqfDeK94lYxV3t6_mEMRrzGX_4_vP7A4ezPxL2VWI",
    signature:
      "qUhO7PXGCuByPHepQMbNTCxjaTMwpoKHcIzbacP_Hwuew41edMOCe2Dfy39EeXo1xhPy7ql14m2Sbfvmzj-ITA",
  },
} as const;

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
