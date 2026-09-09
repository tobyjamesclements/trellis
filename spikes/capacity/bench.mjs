// Spike 1.7: cold-loads the generated data set through automerge-repo, folds
// the 200,000-record log, and compares Ed25519 verification back ends.
// Targets from the task: under 1.5 GiB peak memory and under 30 s cold fold,
// measured on the Pi 5. Run with `node bench.mjs` and `bun bench.mjs`.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Repo } from "@automerge/automerge-repo/slim";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import * as noble from "@noble/ed25519";
import { DATA_DIR, initAutomerge, MANIFEST, memory, mib } from "./common.mjs";
import { decodeRecord, foldClassLog, foldSiteLog, parseKeyId } from "./core.bundle.mjs";

// libsodium-wrappers ships a broken ESM entry; its CommonJS build works in Node and Bun.
const sodium = createRequire(import.meta.url)("libsodium-wrappers");

const runtime = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.versions.node}`;
const results = {
  runtime,
  arch: process.arch,
  cpu: (await import("node:os")).cpus()[0]?.model ?? "unknown",
};
const timed = async (label, fn) => {
  const before = performance.now();
  const value = await fn();
  const ms = Math.round(performance.now() - before);
  results[label] = ms;
  console.log(`${label}: ${ms} ms`);
  return value;
};

await initAutomerge();
const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const baseline = memory();
console.log(`${runtime} on ${results.cpu}; rss at start ${mib(baseline.rss)}`);

// Cold load: a fresh repo over the same storage, every document requested.
const repo = new Repo({ storage: new NodeFSStorageAdapter(DATA_DIR), network: [] });
const handles = await timed("load 500 content documents", async () => {
  const found = manifest.content.map(({ url }) => repo.find(url));
  return Promise.all(found.map(async (handle) => (await handle).doc()));
});
results.contentBytes = handles.reduce((sum, doc) => sum + doc.body.length, 0);
console.log(`content text held: ${mib(results.contentBytes)}; rss ${mib(memory().rss)}`);

const siteDoc = await timed("load site log", async () =>
  (await repo.find(manifest.siteLog.url)).doc(),
);
const classDoc = await timed(`load class log (${manifest.records} records)`, async () =>
  (await repo.find(manifest.classLog.url)).doc(),
);
console.log(`rss after loading everything: ${mib(memory().rss)}`);

const siteIdentity = {
  id: manifest.siteLog.id,
  kind: "site",
  site: manifest.siteKey,
  schema: "1.0",
};
const classIdentity = {
  id: manifest.classLog.id,
  kind: "class",
  site: manifest.siteKey,
  schema: "1.0",
};
const siteState = (await foldSiteLog(Object.entries(siteDoc.ops), siteIdentity)).state;

// The full fold with the platform's Web Crypto verification.
const fold = await timed("full fold with Web Crypto (Ed25519 verify per record)", () =>
  foldClassLog(Object.entries(classDoc.ops), classIdentity, siteState),
);
console.log(
  `fold: applied ${fold.applied}, rejected ${fold.rejected.length}, skipped ${fold.skipped.length}, members ${[...fold.state.enrolment.values()].filter((e) => e.enrolled).length}`,
);
results.peakRss = memory().maxRss;
console.log(`peak rss so far: ${mib(results.peakRss)}`);

// Verification back ends on the same 200,000 signatures, single-threaded
// sync (libsodium WASM, noble JS) versus Web Crypto (native, async, pooled).
const records = Object.values(classDoc.ops).map((bytes) => decodeRecord(bytes));
const triples = records.map((record) => ({
  message: record.signed,
  signature: record.signature,
  publicKey: parseKeyId(record.envelope.signer).publicKey,
}));
const SAMPLE = 50_000;
const sample = triples.slice(0, SAMPLE);

await sodium.ready;
await timed(`libsodium WASM verify ${SAMPLE}`, () => {
  let valid = 0;
  for (const { message, signature, publicKey } of sample) {
    if (sodium.crypto_sign_verify_detached(signature, message, publicKey)) valid += 1;
  }
  if (valid !== SAMPLE) throw new Error(`libsodium rejected ${SAMPLE - valid}`);
});

await timed(`@noble/ed25519 JS verify ${SAMPLE}`, async () => {
  let valid = 0;
  for (const { message, signature, publicKey } of sample) {
    if (await noble.verifyAsync(signature, message, publicKey)) valid += 1;
  }
  if (valid !== SAMPLE) throw new Error(`noble rejected ${SAMPLE - valid}`);
});

const subtle = globalThis.crypto.subtle;
const keys = new Map();
for (const { publicKey } of sample) {
  const id = Buffer.from(publicKey).toString("base64");
  if (!keys.has(id))
    keys.set(id, await subtle.importKey("raw", publicKey, { name: "Ed25519" }, true, ["verify"]));
}
await timed(`Web Crypto verify ${SAMPLE}, sequential`, async () => {
  for (const { message, signature, publicKey } of sample) {
    const key = keys.get(Buffer.from(publicKey).toString("base64"));
    if (!(await subtle.verify({ name: "Ed25519" }, key, signature, message)))
      throw new Error("rejected");
  }
});
await timed(`Web Crypto verify ${SAMPLE}, batches of 128`, async () => {
  for (let start = 0; start < sample.length; start += 128) {
    const batch = sample.slice(start, start + 128);
    const ok = await Promise.all(
      batch.map(({ message, signature, publicKey }) =>
        subtle.verify(
          { name: "Ed25519" },
          keys.get(Buffer.from(publicKey).toString("base64")),
          signature,
          message,
        ),
      ),
    );
    if (!ok.every(Boolean)) throw new Error("rejected");
  }
});

results.peakRss = memory().maxRss;
console.log(
  `\npeak rss ${mib(results.peakRss)} (target under 1.5 GiB on the Pi); full fold ${results["full fold with Web Crypto (Ed25519 verify per record)"]} ms (target under 30 s on the Pi)`,
);
console.log(JSON.stringify(results));
process.exit(0);
