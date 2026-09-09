// Spike 1.7, second pass: how load time, memory, and fold time grow with the
// number of records in one log document, and what each content document size
// costs to load, after the 200,000-record document failed to load at all.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Automerge from "@automerge/automerge/slim";
import { Repo } from "@automerge/automerge-repo/slim";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import * as noble from "@noble/ed25519";
import { DATA_DIR, initAutomerge, MANIFEST, memory, mib } from "./common.mjs";
import {
  ClassCreated,
  ClassStarted,
  DeviceAdmitted,
  EnrolmentAdded,
  EnrolmentRemoved,
  foldClassLog,
  foldSiteLog,
  generateSigningKey,
  generateSiteKey,
  LamportClock,
  LogWriter,
  parseKeyId,
  randomUuid,
} from "./core.bundle.mjs";

const sodium = createRequire(import.meta.url)("libsodium-wrappers");
const runtime = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.versions.node}`;
const sizes = (process.argv[2] ?? "25000,50000,100000").split(",").map(Number);
const out = { runtime, arch: process.arch, steps: [] };
const step = (label, ms, extra = {}) => {
  out.steps.push({ label, ms, ...extra });
  console.log(
    `${label}: ${ms} ms ${Object.entries(extra)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`,
  );
};
const time = async (fn) => {
  const t = performance.now();
  const v = await fn();
  return [Math.round(performance.now() - t), v];
};

await initAutomerge();

// Content documents by size class, from the existing data set.
const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const repo = new Repo({ storage: new NodeFSStorageAdapter(DATA_DIR), network: [] });
for (const label of ["1 KiB", "10 KiB", "100 KiB", "1 MiB"]) {
  const urls = manifest.content.filter((c) => c.label === label).map((c) => c.url);
  const before = memory().rss;
  const [ms] = await time(async () =>
    Promise.all(urls.map(async (url) => (await repo.find(url)).doc())),
  );
  step(`load ${urls.length} content documents of ${label}`, ms, {
    perDocMs: (ms / urls.length).toFixed(1),
    rssDeltaMiB: ((memory().rss - before) / 1048576).toFixed(0),
  });
}

// Signers as in the generator.
const siteKey = await generateSiteKey();
const siteLog = { id: siteKey.id, kind: "site", site: siteKey.id, schema: "1.0" };
const box = new LogWriter(siteKey, siteLog, new LamportClock());
const admin = await generateSigningKey({ algorithm: "ed25519" });
const siteRecords = [await box.append(DeviceAdmitted, { device: admin.id, role: "administrator" })];
const adminWriter = new LogWriter(admin, siteLog, new LamportClock(1));
const teachers = [];
for (let i = 0; i < 8; i += 1) {
  const key = await generateSigningKey({ algorithm: "ed25519" });
  siteRecords.push(await adminWriter.append(DeviceAdmitted, { device: key.id, role: "teacher" }));
  teachers.push(key);
}
const siteState = (
  await foldSiteLog(
    siteRecords.map((r) => [r.envelope.id, r.bytes]),
    siteLog,
  )
).state;

let verificationSample;
for (const count of sizes) {
  const classLog = { id: randomUuid(), kind: "class", site: siteKey.id, schema: "1.0" };
  const writers = teachers.map((key) => new LogWriter(key, classLog, new LamportClock(10)));
  const learners = Array.from({ length: 2000 }, () => randomUuid());
  const records = [
    await writers[0].append(ClassCreated, { name: "Scale", code: "SCALE1", language: "en" }),
    await writers[0].append(ClassStarted, {}),
  ];
  const [signMs] = await time(async () => {
    while (records.length < count) {
      const w = writers[records.length % writers.length];
      records.push(
        await w.append(records.length % 3 === 2 ? EnrolmentRemoved : EnrolmentAdded, {
          learner: learners[records.length % learners.length],
        }),
      );
    }
  });
  const bytes = records.reduce((s, r) => s + r.bytes.length, 0);
  step(`sign ${count} records`, signMs, { recordMiB: mib(bytes) });
  if (!verificationSample) verificationSample = records.slice(0, 20000);

  // Build the document in batches of 500 records per change.
  let doc = Automerge.from({
    kind: "class",
    log: classLog.id,
    site: siteKey.id,
    schema: "1.0",
    ops: {},
  });
  const [buildMs] = await time(async () => {
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      doc = Automerge.change(doc, (d) => {
        for (const r of chunk) d.ops[r.envelope.id] = r.bytes;
      });
    }
  });
  step(`build document with ${count} records`, buildMs, { rssMiB: mib(memory().rss) });

  const [saveMs, snapshot] = await time(async () => Automerge.save(doc));
  step(`save snapshot of ${count} records`, saveMs, { snapshotMiB: mib(snapshot.length) });
  const beforeLoad = memory().rss;
  try {
    const [loadMs] = await time(async () => Automerge.load(snapshot));
    step(`load snapshot of ${count} records`, loadMs, {
      rssDeltaMiB: ((memory().rss - beforeLoad) / 1048576).toFixed(0),
    });
  } catch (error) {
    step(`load snapshot of ${count} records`, -1, { error: String(error).slice(0, 80) });
  }

  // Through automerge-repo's storage, as the box would.
  const dir = await mkdtemp(join(tmpdir(), "scale-"));
  const writerRepo = new Repo({ storage: new NodeFSStorageAdapter(dir), network: [] });
  const handle = writerRepo.create({
    kind: "class",
    log: classLog.id,
    site: siteKey.id,
    schema: "1.0",
    ops: {},
  });
  const [repoBuildMs] = await time(async () => {
    for (let i = 0; i < records.length; i += 500) {
      const chunk = records.slice(i, i + 500);
      handle.change((d) => {
        for (const r of chunk) d.ops[r.envelope.id] = r.bytes;
      });
    }
    await writerRepo.flush();
  });
  step(`automerge-repo write ${count} records`, repoBuildMs);
  await writerRepo.shutdown();
  const readerRepo = new Repo({ storage: new NodeFSStorageAdapter(dir), network: [] });
  const beforeRepoLoad = memory().rss;
  let loaded;
  try {
    const [repoLoadMs, d] = await time(async () => (await readerRepo.find(handle.url)).doc());
    loaded = d;
    step(`automerge-repo cold load ${count} records`, repoLoadMs, {
      rssDeltaMiB: ((memory().rss - beforeRepoLoad) / 1048576).toFixed(0),
      keys: Object.keys(d.ops).length,
    });
  } catch (error) {
    step(`automerge-repo cold load ${count} records`, -1, { error: String(error).slice(0, 80) });
  }
  await readerRepo.shutdown();
  await rm(dir, { recursive: true, force: true });

  const entries = Object.entries((loaded ?? doc).ops);
  const [foldMs, fold] = await time(async () => foldClassLog(entries, classLog, siteState));
  step(`full fold of ${count} records with Web Crypto`, foldMs, {
    applied: fold.applied,
    rejected: fold.rejected.length,
    peakRssMiB: mib(memory().maxRss),
  });
}

// Verification back ends on the same 20,000 signatures.
const triples = verificationSample.map((r) => ({
  message: r.signed,
  signature: r.signature,
  publicKey: parseKeyId(r.envelope.signer).publicKey,
}));
await sodium.ready;
const [sodMs] = await time(async () => {
  for (const t of triples)
    if (!sodium.crypto_sign_verify_detached(t.signature, t.message, t.publicKey))
      throw new Error("bad");
});
step(`libsodium WASM verify ${triples.length}`, sodMs, {
  perSec: Math.round(triples.length / (sodMs / 1000)),
});
const [nobMs] = await time(async () => {
  for (const t of triples)
    if (!(await noble.verifyAsync(t.signature, t.message, t.publicKey))) throw new Error("bad");
});
step(`@noble/ed25519 JS verify ${triples.length}`, nobMs, {
  perSec: Math.round(triples.length / (nobMs / 1000)),
});
const subtle = globalThis.crypto.subtle;
const keys = new Map();
for (const t of triples) {
  const id = Buffer.from(t.publicKey).toString("base64");
  if (!keys.has(id))
    keys.set(id, await subtle.importKey("raw", t.publicKey, { name: "Ed25519" }, true, ["verify"]));
}
const [seqMs] = await time(async () => {
  for (const t of triples)
    if (
      !(await subtle.verify(
        { name: "Ed25519" },
        keys.get(Buffer.from(t.publicKey).toString("base64")),
        t.signature,
        t.message,
      ))
    )
      throw new Error("bad");
});
step(`Web Crypto verify ${triples.length}, sequential`, seqMs, {
  perSec: Math.round(triples.length / (seqMs / 1000)),
});
const [batMs] = await time(async () => {
  for (let i = 0; i < triples.length; i += 128) {
    const ok = await Promise.all(
      triples
        .slice(i, i + 128)
        .map((t) =>
          subtle.verify(
            { name: "Ed25519" },
            keys.get(Buffer.from(t.publicKey).toString("base64")),
            t.signature,
            t.message,
          ),
        ),
    );
    if (!ok.every(Boolean)) throw new Error("bad");
  }
});
step(`Web Crypto verify ${triples.length}, batches of 128`, batMs, {
  perSec: Math.round(triples.length / (batMs / 1000)),
});

out.peakRssMiB = Math.round(memory().maxRss / 1048576);
console.log(JSON.stringify(out));
process.exit(0);
