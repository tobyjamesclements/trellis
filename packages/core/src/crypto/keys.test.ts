import { describe, expect, it } from "vitest";
import { base64urlDecode, base64urlEncode } from "../encoding/base64url";
import { boxSigned, fromHex, RFC8032 } from "./fixtures";
import { bytesEqual, sha256 } from "./hash";
import {
  exportSigningKey,
  generateDeviceKey,
  generateSigningKey,
  generateSiteKey,
  importSigningKey,
  isKeyId,
  keyIdFor,
  parseKeyId,
  type SignatureAlgorithm,
  supportsEd25519,
} from "./keys";
import { sign, verify } from "./signatures";

const encoder = new TextEncoder();
const ALGORITHMS: readonly SignatureAlgorithm[] = ["ed25519", "p256"];

describe("key identifiers", () => {
  it("prefix the algorithm and carry the raw public key", async () => {
    for (const algorithm of ALGORITHMS) {
      const key = await generateSigningKey({ algorithm });
      expect(key.id.startsWith(`${algorithm}:`)).toBe(true);
      const parsed = parseKeyId(key.id);
      expect(parsed.algorithm).toBe(algorithm);
      expect(parsed.publicKey).toEqual(key.publicKey);
      expect(isKeyId(key.id)).toBe(true);
    }
  });

  it("reject malformed identifiers", () => {
    expect(() => parseKeyId("nope")).toThrow(/no algorithm prefix/);
    expect(() => parseKeyId(`rsa:${base64urlEncode(new Uint8Array(32))}`)).toThrow(/unsupported/);
    expect(() => parseKeyId(`ed25519:${base64urlEncode(new Uint8Array(31))}`)).toThrow(/31 bytes/);
    expect(() => parseKeyId(`p256:${base64urlEncode(new Uint8Array(65))}`)).toThrow(/uncompressed/);
    expect(() => keyIdFor("ed25519", new Uint8Array(65))).toThrow(/must be 32 bytes/);
    expect(isKeyId(42)).toBe(false);
    expect(isKeyId("ed25519:")).toBe(false);
  });
});

describe("device keys", () => {
  it("are generated in the key store with a non-extractable private key", async () => {
    const key = await generateDeviceKey();
    expect(key.privateKey.extractable).toBe(false);
    expect(key.privateKey.type).toBe("private");
    expect(key.publicKey.length).toBe(key.algorithm === "ed25519" ? 32 : 65);
  });

  it("prefer Ed25519 where the runtime supports it", async () => {
    // Both runtimes under test, Node 22 and current Chromium, support Ed25519;
    // the P-256 fallback is exercised explicitly by the algorithm matrix below.
    expect(await supportsEd25519()).toBe(true);
    expect((await generateDeviceKey()).algorithm).toBe("ed25519");
  });
});

describe("sign and verify", () => {
  for (const algorithm of ALGORITHMS) {
    describe(algorithm, () => {
      it("round-trips a signature", async () => {
        const key = await generateSigningKey({ algorithm });
        const message = encoder.encode("class started");
        const signature = await sign(key, message);
        expect(signature.length).toBe(64);
        expect(await verify(key.id, message, signature)).toBe(true);
      });

      it("rejects a tampered message, a tampered signature, and the wrong signer", async () => {
        const key = await generateSigningKey({ algorithm });
        const other = await generateSigningKey({ algorithm });
        const message = encoder.encode("class started");
        const signature = await sign(key, message);

        expect(await verify(key.id, encoder.encode("class stopped"), signature)).toBe(false);

        const tampered = signature.slice();
        tampered[10] = (tampered[10] as number) ^ 0x01;
        expect(await verify(key.id, message, tampered)).toBe(false);

        expect(await verify(other.id, message, signature)).toBe(false);
        expect(await verify(key.id, message, signature.slice(0, 63))).toBe(false);
      });
    });
  }

  it("verifies across algorithms: an Ed25519 verifier accepts P-256 signers and vice versa", async () => {
    const ed = await generateSigningKey({ algorithm: "ed25519" });
    const ec = await generateSigningKey({ algorithm: "p256" });
    const message = encoder.encode("enrolment added");
    expect(await verify(ec.id, message, await sign(ec, message))).toBe(true);
    expect(await verify(ed.id, message, await sign(ed, message))).toBe(true);
  });

  it("matches the RFC 8032 Ed25519 test vectors", async () => {
    for (const vector of [RFC8032.test1, RFC8032.test2]) {
      const id = keyIdFor("ed25519", fromHex(vector.publicKeyHex));
      expect(await verify(id, fromHex(vector.messageHex), fromHex(vector.signatureHex))).toBe(true);
    }
  });

  it("verifies signatures the box runtime produced", async () => {
    const message = encoder.encode(boxSigned.message);
    for (const fixture of [boxSigned.ed25519, boxSigned.p256]) {
      expect(isKeyId(fixture.keyId)).toBe(true);
      expect(await verify(fixture.keyId, message, base64urlDecode(fixture.signature))).toBe(true);
      expect(
        await verify(fixture.keyId, encoder.encode("other"), base64urlDecode(fixture.signature)),
      ).toBe(false);
    }
  });
});

describe("site key", () => {
  it("is Ed25519, exportable, and survives the export and import round trip", async () => {
    const site = await generateSiteKey();
    expect(site.algorithm).toBe("ed25519");
    expect(site.privateKey.extractable).toBe(true);

    const exported = await exportSigningKey(site);
    expect(exported.id).toBe(site.id);
    expect(exported.pkcs8.length).toBeGreaterThan(0);

    const restored = await importSigningKey(exported);
    expect(restored.id).toBe(site.id);
    const message = encoder.encode("device admitted");
    expect(await verify(site.id, message, await sign(restored, message))).toBe(true);
    expect(await verify(restored.id, message, await sign(site, message))).toBe(true);
  });

  it("refuses an export whose algorithm and id disagree", async () => {
    const site = await generateSiteKey();
    const exported = await exportSigningKey(site);
    await expect(importSigningKey({ ...exported, algorithm: "p256" })).rejects.toThrow(
      /does not match/,
    );
  });
});

describe("hashing", () => {
  it("computes SHA-256", async () => {
    const digest = await sha256(encoder.encode("abc"));
    expect(base64urlEncode(digest)).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
    expect(bytesEqual(digest, await sha256(encoder.encode("abc")))).toBe(true);
    expect(bytesEqual(digest, await sha256(encoder.encode("abd")))).toBe(false);
  });
});
