import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initializeWasm } from "@automerge/automerge/slim";

export const DATA_DIR = new URL("./data/", import.meta.url).pathname;
export const MANIFEST = `${DATA_DIR}manifest.json`;

export async function initAutomerge() {
  const require = createRequire(import.meta.url);
  await initializeWasm(await readFile(require.resolve("@automerge/automerge/automerge.wasm")));
}

export function mib(bytes) {
  return `${(bytes / 1048576).toFixed(0)} MiB`;
}

export function memory() {
  const usage = process.memoryUsage();
  const maxRss =
    typeof process.resourceUsage === "function" ? process.resourceUsage().maxRSS * 1024 : usage.rss;
  return { rss: usage.rss, heapUsed: usage.heapUsed, external: usage.external, maxRss };
}

export const CONTENT_MIX = [
  { count: 100, bytes: 1024, label: "1 KiB" },
  { count: 300, bytes: 10 * 1024, label: "10 KiB" },
  { count: 80, bytes: 100 * 1024, label: "100 KiB" },
  { count: 20, bytes: 1024 * 1024, label: "1 MiB" },
];

export const LOG_RECORDS = 200_000;
