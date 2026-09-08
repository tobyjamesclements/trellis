import { describe, expect, it } from "vitest";
import { PROVISIONAL_TRANSPORT_PREFERENCE } from "./parameters";

describe("transport preference", () => {
  it("names each transport once, in the order design decision D12 states", () => {
    expect(PROVISIONAL_TRANSPORT_PREFERENCE).toEqual(["webtransport", "webrtc", "websocket"]);
    expect(new Set(PROVISIONAL_TRANSPORT_PREFERENCE).size).toBe(3);
  });
});
