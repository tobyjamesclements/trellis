import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { base64urlDecode, base64urlEncode } from "./base64url";

describe("base64url", () => {
  it("matches the RFC 4648 test vectors without padding", () => {
    const encoder = new TextEncoder();
    expect(base64urlEncode(encoder.encode(""))).toBe("");
    expect(base64urlEncode(encoder.encode("f"))).toBe("Zg");
    expect(base64urlEncode(encoder.encode("fo"))).toBe("Zm8");
    expect(base64urlEncode(encoder.encode("foo"))).toBe("Zm9v");
    expect(base64urlEncode(encoder.encode("foob"))).toBe("Zm9vYg");
    expect(base64urlEncode(encoder.encode("fooba"))).toBe("Zm9vYmE");
    expect(base64urlEncode(encoder.encode("foobar"))).toBe("Zm9vYmFy");
  });

  it("uses the URL-safe alphabet", () => {
    expect(base64urlEncode(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });

  it("round-trips arbitrary bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
        expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes);
      }),
    );
  });

  it("rejects malformed input", () => {
    expect(() => base64urlDecode("A")).toThrow(/invalid length/);
    expect(() => base64urlDecode("Zm9=")).toThrow(/invalid character/);
    expect(() => base64urlDecode("Zh")).toThrow(/padding/);
  });
});
