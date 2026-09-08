import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeCanonical, encodeCanonical } from "./canonical";

describe("canonical CBOR", () => {
  it("encodes the same value to the same bytes whatever the key order", () => {
    const first = encodeCanonical({ seq: 1, id: "x", lamport: 2, prev: null });
    const second = encodeCanonical({ prev: null, lamport: 2, id: "x", seq: 1 });
    expect(first).toEqual(second);
  });

  it("sorts map keys bytewise by their encoded form, as RFC 8949 section 4.2 requires", () => {
    // "b" encodes as 61 62 and "aa" as 62 61 61, so "b" sorts first.
    expect([...encodeCanonical({ aa: 1, b: 2 })]).toEqual([
      0xa2, 0x61, 0x62, 0x02, 0x62, 0x61, 0x61, 0x01,
    ]);
  });

  it("uses the shortest integer form", () => {
    expect([...encodeCanonical(23)]).toEqual([0x17]);
    expect([...encodeCanonical(24)]).toEqual([0x18, 0x18]);
    expect([...encodeCanonical(256)]).toEqual([0x19, 0x01, 0x00]);
    expect([...encodeCanonical(-1)]).toEqual([0x20]);
  });

  it("omits properties whose value is undefined", () => {
    expect(encodeCanonical({ a: 1, b: undefined })).toEqual(encodeCanonical({ a: 1 }));
  });

  it("decodes maps to Map so hostile keys are inert data", () => {
    const decoded = decodeCanonical(
      encodeCanonical(new Map([["__proto__", { polluted: true }]])),
    ) as Map<string, unknown>;
    expect(decoded.get("__proto__")).toEqual(new Map([["polluted", true]]));
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("round-trips nested arrays, maps, bytes, booleans, and null", () => {
    const decoded = decodeCanonical(
      encodeCanonical({
        id: "x",
        n: [1, 2, { k: new Uint8Array([9, 8]) }],
        flag: true,
        none: null,
      }),
    );
    expect(decoded).toEqual(
      new Map<string, unknown>([
        ["id", "x"],
        ["n", [1, 2, new Map([["k", new Uint8Array([9, 8])]])]],
        ["flag", true],
        ["none", null],
      ]),
    );
  });

  it("round-trips arbitrary integers, strings, and bytes", () => {
    fc.assert(
      fc.property(
        fc.record({ i: fc.integer(), s: fc.string(), b: fc.uint8Array({ maxLength: 64 }) }),
        (value) => {
          const decoded = decodeCanonical(encodeCanonical(value)) as Map<string, unknown>;
          expect(decoded.get("i")).toBe(value.i);
          expect(decoded.get("s")).toBe(value.s);
          expect(decoded.get("b")).toEqual(value.b);
        },
      ),
    );
  });

  it("refuses duplicate keys, indefinite lengths, and undefined", () => {
    expect(() =>
      decodeCanonical(new Uint8Array([0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02])),
    ).toThrow();
    expect(() => decodeCanonical(new Uint8Array([0x9f, 0x01, 0xff]))).toThrow();
    expect(() => decodeCanonical(new Uint8Array([0xf7]))).toThrow();
  });
});
