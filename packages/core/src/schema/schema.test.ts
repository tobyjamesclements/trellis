import { describe, expect, it } from "vitest";
import * as s from "./schema";

describe("schema", () => {
  const payload = s.object({
    learner: s.uuid(),
    role: s.literal("teacher", "student"),
    note: s.optional(s.string({ max: 5 })),
    prev: s.nullable(s.bytes({ length: 2 })),
    seq: s.integer({ min: 1 }),
  });
  const learner = "3f2c1b4e-9d8a-4c7b-8e6f-5a4b3c2d1e0f";

  it("accepts plain objects and Maps alike, dropping unknown keys", () => {
    const fromObject = payload.parse({ learner, role: "teacher", prev: null, seq: 3, extra: 1 });
    const fromMap = payload.parse(
      new Map<string, unknown>([
        ["seq", 3],
        ["prev", null],
        ["role", "teacher"],
        ["learner", learner],
        ["extra", 1],
      ]),
    );
    expect(fromObject).toEqual({ learner, role: "teacher", prev: null, seq: 3 });
    expect(fromMap).toEqual(fromObject);
    expect("note" in fromObject).toBe(false);
  });

  it("keeps optional fields when present", () => {
    const parsed = payload.parse({
      learner,
      role: "student",
      note: "hi",
      prev: new Uint8Array(2),
      seq: 1,
    });
    expect(parsed.note).toBe("hi");
  });

  it("reports the path of the failing field", () => {
    expect(() => payload.parse({ learner, role: "admin", prev: null, seq: 1 })).toThrow(/^role: /);
    expect(() => payload.parse({ learner, role: "teacher", prev: null, seq: 0 })).toThrow(/^seq: /);
    expect(() =>
      payload.parse({ learner, role: "teacher", prev: new Uint8Array(3), seq: 1 }),
    ).toThrow(/^prev: expected 2 bytes/);
    expect(() => payload.parse({ learner: "nope", role: "teacher", prev: null, seq: 1 })).toThrow(
      /^learner: /,
    );
    expect(() =>
      payload.parse({ learner, role: "teacher", note: "toolong", prev: null, seq: 1 }),
    ).toThrow(/^note: /);
  });

  it("rejects non-objects, non-string map keys, floats, and wrong tuple shapes", () => {
    expect(() => payload.parse("x")).toThrow(/expected object/);
    expect(() => payload.parse(new Map([[1, 2]]))).toThrow(/string keys/);
    expect(() => s.integer().parse(1.5)).toThrow(/safe integer/);
    expect(() => s.tuple(s.bytes(), s.integer()).parse([new Uint8Array(1)])).toThrow(/2-tuple/);
    expect(s.tuple(s.bytes(), s.integer()).parse([new Uint8Array(1), 7])).toEqual([
      new Uint8Array(1),
      7,
    ]);
    expect(s.array(s.integer(), { max: 2 }).parse([1, 2])).toEqual([1, 2]);
    expect(() => s.array(s.integer(), { max: 2 }).parse([1, 2, 3])).toThrow(/at most 2/);
  });
});
