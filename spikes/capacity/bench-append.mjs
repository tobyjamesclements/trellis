// Spike 1.7, third pass: what one more record costs on a large log, which is
// what every device pays for each chat message or enrolment, and how big the
// incremental change is that sync must carry.
import * as Automerge from "@automerge/automerge/slim";
import { initAutomerge, memory, mib } from "./common.mjs";
import {
  ClassCreated,
  ClassStarted,
  DeviceAdmitted,
  EnrolmentAdded,
  generateSigningKey,
  generateSiteKey,
  LamportClock,
  LogWriter,
  randomUuid,
} from "./core.bundle.mjs";

await initAutomerge();
const runtime = typeof Bun !== "undefined" ? `Bun ${Bun.version}` : `Node ${process.versions.node}`;
const siteKey = await generateSiteKey();
const siteLog = { id: siteKey.id, kind: "site", site: siteKey.id, schema: "1.0" };
const teacher = await generateSigningKey({ algorithm: "ed25519" });
await new LogWriter(siteKey, siteLog, new LamportClock()).append(DeviceAdmitted, {
  device: teacher.id,
  role: "teacher",
});
const classLog = { id: randomUuid(), kind: "class", site: siteKey.id, schema: "1.0" };
const writer = new LogWriter(teacher, classLog, new LamportClock(10));
const learners = Array.from({ length: 2000 }, () => randomUuid());
let doc = Automerge.from({
  kind: "class",
  log: classLog.id,
  site: siteKey.id,
  schema: "1.0",
  ops: {},
});
const records = [
  await writer.append(ClassCreated, { name: "Append", code: "APPEND", language: "en" }),
  await writer.append(ClassStarted, {}),
];

for (const target of [1000, 10000, 25000, 50000, 100000]) {
  while (records.length < target) {
    records.push(
      await writer.append(EnrolmentAdded, { learner: learners[records.length % learners.length] }),
    );
  }
  const pending = Object.keys(doc.ops).length;
  const chunk = records.slice(pending, target);
  for (let i = 0; i < chunk.length; i += 500) {
    const part = chunk.slice(i, i + 500);
    doc = Automerge.change(doc, (d) => {
      for (const r of part) d.ops[r.envelope.id] = r.bytes;
    });
  }
  // Fifty single-record appends, timed one by one, plus the incremental bytes sync would carry.
  const singles = [];
  for (let i = 0; i < 50; i += 1)
    singles.push(await writer.append(EnrolmentAdded, { learner: learners[i] }));
  const times = [];
  let incrementalBytes = 0;
  let changeBytes = 0;
  for (const record of singles) {
    const t = performance.now();
    doc = Automerge.change(doc, (d) => {
      d.ops[record.envelope.id] = record.bytes;
    });
    times.push(performance.now() - t);
    changeBytes += Automerge.getLastLocalChange(doc)?.length ?? 0;
    incrementalBytes += Automerge.saveIncremental(doc).length;
  }
  records.push(...singles);
  times.sort((a, b) => a - b);
  const t = performance.now();
  const snapshot = Automerge.save(doc);
  const saveMs = Math.round(performance.now() - t);
  console.log(
    `${target} records: single append median ${times[25].toFixed(1)} ms, p90 ${times[45].toFixed(1)} ms; sync change ${(changeBytes / 50).toFixed(0)} bytes per record, saveIncremental ${(incrementalBytes / 50).toFixed(0)} bytes; full save ${saveMs} ms (${mib(snapshot.length)}); rss ${mib(memory().rss)}`,
  );
}
console.log(runtime);
process.exit(0);
