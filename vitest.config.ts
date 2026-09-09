import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Two test projects share one runner:
 *
 * - `node` runs every package's `*.test.ts` under Node, the box runtime.
 * - `browser` runs the shared core's whole suite again inside headless
 *   Chromium, the device runtime, so that everything meant to be identical on
 *   every peer (Web Crypto, CBOR, the fold) is exercised where it will run,
 *   together with the client's unit tests. The client's end-to-end checks of
 *   the built shell live in Playwright under `packages/client/e2e`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["packages/{core,transports,box}/src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          setupFiles: ["./packages/core/test/setup.node.ts"],
        },
      },
      {
        test: {
          name: "browser",
          include: ["packages/core/src/**/*.test.ts", "packages/client/src/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/dist/**"],
          setupFiles: ["./packages/core/test/setup.browser.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
