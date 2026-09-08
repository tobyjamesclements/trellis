import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { boxStatus, createBoxServer } from "./server";

describe("box server", () => {
  const server = createBoxServer();

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("answers the status probe", async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/status`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(boxStatus());
  });
});
