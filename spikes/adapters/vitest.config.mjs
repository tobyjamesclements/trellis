import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/*.test.mjs"],
    testTimeout: 40_000,
    hookTimeout: 40_000,
    fileParallelism: false,
  },
});
