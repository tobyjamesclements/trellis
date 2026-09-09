// Generates the spike data set with automerge-repo over the NodeFS storage
// adapter: 500 content documents of mixed size and one class log holding
// 200,000 signed records (plus the site log that authorises their signers),
// all produced with the platform's own record format and writers.
import { mkdir, rm, writeFile } from "node:fs/promises";
import * as Automerge from "@automerge/automerge/slim";
import { Repo } from "@automerge/automerge-repo/slim";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import {
  CONTENT_MIX,
  DATA_DIR,
  initAutomerge,
  LOG_RECORDS,
  MANIFEST,
  memory,
  mib,
} from "./common.mjs";
import {
  ClassCreated,
  ClassStarted,
  DeviceAdmitted,
  EnrolmentAdded,
  EnrolmentRemoved,
  generateSigningKey,
  generateSiteKey,
  LamportClock,
  LogWriter,
  randomUuid,
} from "./core.bundle.mjs";

await initAutomerge();
await rm(DATA_DIR, { recursive: true, force: true });
await mkdir(DATA_DIR, { recursive: true });

const started = performance.now();
const repo = new Repo({ storage: new NodeFSStorageAdapter(DATA_DIR), network: [] });
const manifest = {
  content: [],
  siteLog: null,
  classLog: null,
  siteKey: null,
  signers: [],
  records: 0,
};

// Content documents: Automerge text with a handful of edits each.
const filler = "The quick brown fox jumps over the lazy dog. ";
let created = 0;
for (const { count, bytes, label } of CONTENT_MIX) {
  for (let index = 0; index < count; index += 1) {
    const handle = repo.create({ tier: "site", language: "en", body: "" });
    const target = bytes;
    const edits = 8;
    handle.change((doc) => {
      Automerge.splice(
        doc,
        ["body"],
        0,
        0,
        filler.repeat(Math.ceil(target / edits / filler.length)),
      );
    });
    for (let edit = 1; edit < edits; edit += 1) {
      handle.change((doc) => {
        Automerge.splice(
          doc,
          ["body"],
          doc.body.length,
          0,
          filler.repeat(Math.ceil(target / edits / filler.length)),
        );
      });
    }
    manifest.content.push({ url: handle.url, label });
    created += 1;
  }
  console.log(`content: ${count} documents of ${label}`);
}

// Site log: the site key admits an administrator, who admits eight teachers.
const siteKey = await generateSiteKey();
const siteLog = { id: siteKey.id, kind: "site", site: siteKey.id, schema: "1.0" };
const classLog = { id: randomUuid(), kind: "class", site: siteKey.id, schema: "1.0" };
const boxClock = new LamportClock();
const box = new LogWriter(siteKey, siteLog, boxClock);
const admin = await generateSigningKey({ algorithm: "ed25519", extractable: true });
const adminClock = new LamportClock();
const siteRecords = [await box.append(DeviceAdmitted, { device: admin.id, role: "administrator" })];
adminClock.observe(1);
const adminSite = new LogWriter(admin, siteLog, adminClock);
const teachers = [];
for (let index = 0; index < 8; index += 1) {
  const key = await generateSigningKey({ algorithm: "ed25519", extractable: true });
  siteRecords.push(await adminSite.append(DeviceAdmitted, { device: key.id, role: "teacher" }));
  teachers.push(key);
}
const siteDoc = repo.create({
  kind: "site",
  log: siteLog.id,
  site: siteKey.id,
  schema: "1.0",
  ops: {},
});
siteDoc.change((doc) => {
  for (const record of siteRecords) doc.ops[record.envelope.id] = record.bytes;
});
manifest.siteLog = { url: siteDoc.url, id: siteLog.id };
manifest.siteKey = siteKey.id;

// Class log: created and started by the first teacher, then 200,000
// enrolment records from eight teacher devices over 2,000 learners, appended
// in batches of 500 per Automerge change as a busy box would receive them.
const clocks = teachers.map(() => new LamportClock(10));
const writers = teachers.map((key, index) => new LogWriter(key, classLog, clocks[index]));
const learners = Array.from({ length: 2000 }, () => randomUuid());
const classDoc = repo.create({
  kind: "class",
  log: classLog.id,
  site: siteKey.id,
  schema: "1.0",
  ops: {},
});
const first = [
  await writers[0].append(ClassCreated, { name: "Capacity", code: "CAP001", language: "en" }),
  await writers[0].append(ClassStarted, {}),
];
classDoc.change((doc) => {
  for (const record of first) doc.ops[record.envelope.id] = record.bytes;
});
let records = 2;
let batch = [];
let bytes = first.reduce((sum, record) => sum + record.bytes.length, 0);
const signingStarted = performance.now();
while (records < LOG_RECORDS) {
  const writer = writers[records % writers.length];
  if (records % 977 === 0)
    clocks[records % writers.length].observe(Math.max(...clocks.map((c) => c.value)));
  const learner = learners[records % learners.length];
  const record = await writer.append(records % 3 === 2 ? EnrolmentRemoved : EnrolmentAdded, {
    learner,
  });
  batch.push(record);
  bytes += record.bytes.length;
  records += 1;
  if (batch.length === 500 || records === LOG_RECORDS) {
    const chunk = batch;
    batch = [];
    classDoc.change((doc) => {
      for (const item of chunk) doc.ops[item.envelope.id] = item.bytes;
    });
    if (records % 20_000 === 0)
      console.log(
        `log: ${records} records, ${mib(bytes)} of record bytes, rss ${mib(memory().rss)}`,
      );
  }
}
const signingSeconds = ((performance.now() - signingStarted) / 1000).toFixed(1);
manifest.classLog = { url: classDoc.url, id: classLog.id };
manifest.records = records;
manifest.recordBytes = bytes;

await repo.flush();
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `generated ${created} content documents and ${records} log records (${mib(bytes)}) in ${seconds}s (signing ${signingSeconds}s); peak rss ${mib(memory().maxRss)}`,
);
process.exit(0);
