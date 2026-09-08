import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { encodeCanonical } from "../cbor/canonical";
import { generateSigningKey, generateSiteKey, type SigningKey } from "../crypto/keys";
import { randomUuid } from "../crypto/random";
import * as s from "../schema/schema";
import {
  ClassCreated,
  ClassStarted,
  type ClassState,
  ClassStopped,
  classMembers,
  EnrolmentAdded,
  EnrolmentRemoved,
  foldClassLog,
} from "./class";
import { type OperationDeclaration, operationsFor } from "./dsl";
import type { FoldResult } from "./fold";
import { type LogIdentity, type OperationRecord, recordHash } from "./record";
import { DeviceAdmitted, DeviceRevoked, foldSiteLog, type SiteState } from "./site";
import { type AppendOptions, LamportClock, LogWriter } from "./writer";

type Entry = readonly [string, Uint8Array];

const entry = (record: OperationRecord): Entry => [record.envelope.id, record.bytes];
const entriesOf = (records: readonly OperationRecord[]): Entry[] => records.map(entry);

/** Strips list order from a fold result so results from different arrival orders compare equal. */
function normalise<State>(result: FoldResult<State>) {
  const byId = <T extends { readonly id: string }>(items: readonly T[]) =>
    [...items].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    state: result.state,
    applied: result.applied,
    rejected: byId(result.rejected),
    skipped: byId(result.skipped),
    warnings: result.warnings,
    lamport: result.lamport,
    signers: result.signers,
  };
}

/** One peer: a key and the single Lamport clock it shares across the logs it writes. */
interface Peer {
  readonly key: SigningKey;
  readonly clock: LamportClock;
  readonly site: LogWriter;
  readonly class: LogWriter;
}

let nowValue = 1_700_000_000_000;
const now = () => {
  nowValue += 1000;
  return nowValue;
};

async function makePeer(
  key: SigningKey,
  siteLog: LogIdentity,
  classLog: LogIdentity,
): Promise<Peer> {
  const clock = new LamportClock();
  return {
    key,
    clock,
    site: new LogWriter(key, siteLog, clock, now),
    class: new LogWriter(key, classLog, clock, now),
  };
}

describe("the fold", () => {
  let siteKey: SigningKey;
  let siteLog: LogIdentity;
  let classLog: LogIdentity;
  let box: Peer;
  let admin: Peer;
  let teacher1: Peer;
  let teacher2: Peer;
  let teacher3: Peer;
  let student1: Peer;
  let student2: Peer;
  let student3: Peer;
  let stranger: Peer;
  let learners: readonly [string, string, string, string];
  const siteRecords: OperationRecord[] = [];
  const classRecords: OperationRecord[] = [];
  let siteState: SiteState;

  beforeAll(async () => {
    siteKey = await generateSiteKey();
    siteLog = { id: siteKey.id, kind: "site", site: siteKey.id, schema: "1.0" };
    classLog = { id: randomUuid(), kind: "class", site: siteKey.id, schema: "1.0" };
    const key = (algorithm: "ed25519" | "p256") => generateSigningKey({ algorithm });
    [box, admin, teacher1, teacher2, teacher3, student1, student2, student3, stranger] =
      await Promise.all([
        makePeer(siteKey, siteLog, classLog),
        makePeer(await key("ed25519"), siteLog, classLog),
        makePeer(await key("ed25519"), siteLog, classLog),
        makePeer(await key("p256"), siteLog, classLog),
        makePeer(await key("ed25519"), siteLog, classLog),
        makePeer(await key("p256"), siteLog, classLog),
        makePeer(await key("ed25519"), siteLog, classLog),
        makePeer(await key("ed25519"), siteLog, classLog),
        makePeer(await key("ed25519"), siteLog, classLog),
      ]);
    learners = [randomUuid(), randomUuid(), randomUuid(), randomUuid()];
    const [l1, l2, l3, l4] = learners;

    const site = async <P, S>(
      peer: Peer,
      declaration: OperationDeclaration<string, P, S>,
      payload: P,
    ) => {
      siteRecords.push(await peer.site.append(declaration, payload));
    };
    const klass = async <P, S>(
      peer: Peer,
      declaration: OperationDeclaration<string, P, S>,
      payload: P,
      options?: AppendOptions,
    ) => {
      classRecords.push(await peer.class.append(declaration, payload, options));
    };
    /** The peer receives everything up to this clock value, as a sync would deliver. */
    const sync = (peer: Peer, lamport: number) => peer.clock.observe(lamport);

    // Lamport clocks are noted per record. Records are pushed in construction
    // order, which is one arrival order among the many the tests fold in.
    await site(box, DeviceAdmitted, { device: admin.key.id, role: "administrator" }); // 1
    sync(admin, 1);
    await site(admin, DeviceAdmitted, { device: teacher1.key.id, role: "teacher" }); // 2
    await site(admin, DeviceAdmitted, { device: teacher2.key.id, role: "teacher" }); // 3
    await site(admin, DeviceAdmitted, { device: teacher3.key.id, role: "teacher" }); // 4
    sync(teacher1, 4);
    await klass(teacher1, ClassCreated, { name: "Year 8 Science", code: "K7P2QX", language: "es" }); // 5
    await klass(teacher1, ClassStarted, {}); // 6
    sync(teacher3, 6);
    await klass(teacher3, EnrolmentAdded, { learner: l4 }); // 7: teacher3 still a teacher
    sync(admin, 7);
    await site(admin, DeviceRevoked, { device: teacher3.key.id, reason: "left the school" }); // 8
    sync(box, 8);
    await site(box, DeviceAdmitted, { device: student1.key.id, role: "student", learner: l1 }); // 9
    await site(box, DeviceAdmitted, {
      device: student2.key.id,
      role: "student",
      learner: l2,
      designation: "loaned",
    }); // 10
    sync(teacher1, 10);
    await site(teacher1, DeviceAdmitted, {
      device: student3.key.id,
      role: "student",
      designation: "shared",
    }); // 11
    sync(box, 11);
    await klass(box, EnrolmentAdded, { learner: l1 }); // 12: a join
    await klass(box, EnrolmentAdded, { learner: l2 }); // 13
    sync(teacher2, 13);
    await klass(teacher2, EnrolmentAdded, { learner: l3 }); // 14
    await klass(teacher2, EnrolmentRemoved, { learner: l2 }); // 15
    sync(teacher1, 15);
    await klass(teacher1, EnrolmentRemoved, { learner: l1 }); // 16
    sync(box, 15);
    await klass(box, EnrolmentAdded, { learner: l1 }); // 16: concurrent with the removal
    sync(teacher3, 16);
    await klass(teacher3, EnrolmentRemoved, { learner: l4 }); // 17: revoked at 8
    sync(student1, 17);
    await klass(student1, ClassStopped, {}); // 18: students cannot
    await klass(student1, EnrolmentAdded, { learner: l3 }, { actor: l1 }); // 19: students cannot
    sync(stranger, 2);
    await klass(stranger, EnrolmentAdded, { learner: l1 }); // 3: never admitted
    sync(teacher2, 19);
    await klass(teacher2, ClassStopped, {}); // 20
    await klass(teacher2, ClassStopped, {}); // 21: already stopped
    sync(teacher1, 21);
    await klass(teacher1, ClassStarted, {}); // 22
    await klass(teacher1, ClassCreated, { name: "Again", code: "AGAIN1", language: "en" }); // 23: already created
    sync(student1, 23);
    await site(student1, DeviceAdmitted, { device: stranger.key.id, role: "student" }); // 24: students cannot
    sync(teacher3, 24);
    await site(teacher3, DeviceAdmitted, { device: stranger.key.id, role: "student" }); // 25: revoked
    await site(stranger, DeviceAdmitted, { device: stranger.key.id, role: "administrator" }); // 4: never admitted
    sync(box, 25);
    await site(box, DeviceAdmitted, { device: student2.key.id, role: "student" }); // 26: already admitted
    sync(admin, 26);
    await site(admin, DeviceAdmitted, { device: teacher3.key.id, role: "teacher" }); // 27: revoked keys stay revoked

    siteState = (await foldSiteLog(entriesOf(siteRecords), siteLog)).state;
  });

  it("folds the site log: admissions and the revocation apply, everything else is rejected with a reason", async () => {
    const result = await foldSiteLog(entriesOf(siteRecords), siteLog);
    expect(result.applied).toBe(8);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.lamport).toBe(27);
    expect(result.rejected.map(({ reason, signer }) => [reason, signer]).sort()).toEqual(
      [
        ["unauthorised", student1.key.id],
        ["unauthorised", teacher3.key.id],
        ["unauthorised", stranger.key.id],
        ["inapplicable", box.key.id],
        ["inapplicable", admin.key.id],
      ].sort(),
    );

    const { devices } = result.state;
    expect(result.state.site).toBe(siteKey.id);
    expect(devices.get(admin.key.id)).toEqual({
      role: "administrator",
      admittedAt: 1,
      admittedBy: siteKey.id,
    });
    expect(devices.get(teacher1.key.id)).toEqual({
      role: "teacher",
      admittedAt: 2,
      admittedBy: admin.key.id,
    });
    expect(devices.get(teacher3.key.id)).toEqual({
      role: "teacher",
      admittedAt: 4,
      admittedBy: admin.key.id,
      revokedAt: 8,
      revokedBy: admin.key.id,
    });
    expect(devices.get(student2.key.id)).toEqual({
      role: "student",
      learner: learners[1],
      designation: "loaned",
      admittedAt: 10,
      admittedBy: siteKey.id,
    });
    expect(devices.get(student3.key.id)).toEqual({
      role: "student",
      designation: "shared",
      admittedAt: 11,
      admittedBy: teacher1.key.id,
    });
    expect(devices.has(stranger.key.id)).toBe(false);
    expect(result.signers.get(admin.key.id)?.seq).toBe(5);
  });

  it("folds the class log: lifecycle by staff, enrolment by staff or the site, removal wins a tie", async () => {
    const result = await foldClassLog(entriesOf(classRecords), classLog, siteState);
    const [l1, l2, l3, l4] = learners;
    expect(result.applied).toBe(11);
    expect(result.skipped).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.lamport).toBe(23);
    expect(
      result.rejected.map(({ reason, type, signer }) => [reason, type, signer]).sort(),
    ).toEqual(
      [
        ["unauthorised", "enrolment.removed", teacher3.key.id],
        ["unauthorised", "class.stopped", student1.key.id],
        ["unauthorised", "enrolment.added", student1.key.id],
        ["unauthorised", "enrolment.added", stranger.key.id],
        ["inapplicable", "class.stopped", teacher2.key.id],
        ["inapplicable", "class.created", teacher1.key.id],
      ].sort(),
    );

    const { state } = result;
    expect(state.created).toEqual({
      name: "Year 8 Science",
      code: "K7P2QX",
      language: "es",
      by: teacher1.key.id,
      at: 5,
    });
    expect(state.status).toBe("live");
    expect(state.teachers).toEqual(new Set([teacher1.key.id]));
    expect(state.enrolment.get(l4)).toEqual({ enrolled: true, lamport: 7, by: teacher3.key.id });
    expect(state.enrolment.get(l3)).toEqual({ enrolled: true, lamport: 14, by: teacher2.key.id });
    expect(state.enrolment.get(l2)).toEqual({ enrolled: false, lamport: 15, by: teacher2.key.id });
    expect(state.enrolment.get(l1)?.enrolled).toBe(false);
    expect(state.enrolment.get(l1)?.lamport).toBe(16);
    expect(classMembers(state)).toEqual([l3, l4].sort());
  });

  it("folds any subset of the site records to the same state in any arrival order", async () => {
    const entries = entriesOf(siteRecords);
    await fc.assert(
      fc.asyncProperty(fc.shuffledSubarray(entries), async (shuffled) => {
        const canonical = [...shuffled].sort(([a], [b]) => (a < b ? -1 : 1));
        expect(normalise(await foldSiteLog(shuffled, siteLog))).toEqual(
          normalise(await foldSiteLog(canonical, siteLog)),
        );
      }),
      { numRuns: 25 },
    );
  });

  it("folds any subset of the class records to the same state in any arrival order", async () => {
    const entries = entriesOf(classRecords);
    await fc.assert(
      fc.asyncProperty(fc.shuffledSubarray(entries), async (shuffled) => {
        const canonical = [...shuffled].sort(([a], [b]) => (a < b ? -1 : 1));
        expect(normalise(await foldClassLog(shuffled, classLog, siteState))).toEqual(
          normalise(await foldClassLog(canonical, classLog, siteState)),
        );
      }),
      { numRuns: 25 },
    );
  });

  it("resolves generated concurrent enrolment histories by latest logical order, removal winning ties", async () => {
    const operation = fc.record({
      add: fc.boolean(),
      learner: fc.integer({ min: 0, max: 3 }),
      by: fc.integer({ min: 0, max: 2 }),
      synced: fc.boolean(),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(operation, { maxLength: 24 }), async (operations) => {
        const log: LogIdentity = {
          id: randomUuid(),
          kind: "class",
          site: siteKey.id,
          schema: "1.0",
        };
        const writers = [siteKey, teacher1.key, teacher2.key].map(
          (key) => new LogWriter(key, log, new LamportClock(4), now),
        );
        const teacher = writers[1] as LogWriter;
        const records: OperationRecord[] = [
          await teacher.append(ClassCreated, { name: "Prop", code: "PROP01", language: "en" }),
          await teacher.append(ClassStarted, {}),
        ];
        // The oracle: for each learner the records at the highest Lamport
        // clock decide, and any removal among them wins.
        const expected = new Map<string, { lamport: number; enrolled: boolean }>();
        // Every peer has seen the class created and started before enrolling.
        let highest = teacher.clock.value;
        for (const writer of writers) {
          writer.clock.observe(highest);
        }
        for (const op of operations) {
          const writer = writers[op.by] as LogWriter;
          if (op.synced) {
            writer.clock.observe(highest);
          }
          const learner = learners[op.learner] as string;
          const record = await writer.append(op.add ? EnrolmentAdded : EnrolmentRemoved, {
            learner,
          });
          records.push(record);
          const { lamport } = record.envelope;
          highest = Math.max(highest, lamport);
          const current = expected.get(learner);
          if (current === undefined || lamport > current.lamport) {
            expected.set(learner, { lamport, enrolled: op.add });
          } else if (lamport === current.lamport) {
            current.enrolled = current.enrolled && op.add;
          }
        }

        const forward = await foldClassLog(entriesOf(records), log, siteState);
        const backward = await foldClassLog(entriesOf([...records].reverse()), log, siteState);
        expect(forward.rejected).toEqual([]);
        expect(normalise(backward)).toEqual(normalise(forward));
        const actual = new Map(
          [...forward.state.enrolment].map(([learner, state]) => [learner, state.enrolled]),
        );
        expect(actual).toEqual(
          new Map([...expected].map(([learner, state]) => [learner, state.enrolled])),
        );
      }),
      { numRuns: 12 },
    );
  });

  it("rejects forged, misfiled, and malformed records without disturbing the state", async () => {
    const baseline = await foldClassLog(entriesOf(classRecords), classLog, siteState);
    const forger = new LogWriter(teacher1.key, classLog, new LamportClock(100), now);
    const outsider = new LogWriter(stranger.key, classLog, new LamportClock(100), now);
    const [l1, , l3] = learners;

    const badSignature = await forger.append(ClassStarted, {});
    const flipped = badSignature.bytes.slice();
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] as number) ^ 0x01;

    const badBody = await forger.append(EnrolmentAdded, { learner: l3 });
    const rewritten = encodeCanonical([
      encodeCanonical({ ...badBody.envelope, payload: encodeCanonical({ learner: l1 }) }),
      badBody.signature,
    ]);

    const unadmitted = await outsider.append(EnrolmentAdded, { learner: l3 });
    const misfiled = siteRecords[0] as OperationRecord;
    const misplacedId = randomUuid();
    const garbageId = randomUuid();

    const result = await foldClassLog(
      [
        ...entriesOf(classRecords),
        [badSignature.envelope.id, flipped],
        [badBody.envelope.id, rewritten],
        entry(unadmitted),
        entry(misfiled),
        [misplacedId, badSignature.bytes],
        [garbageId, new Uint8Array([0x83, 0x01, 0x02])],
      ],
      classLog,
      siteState,
    );

    expect(result.state).toEqual(baseline.state);
    expect(result.applied).toBe(baseline.applied);
    const extra = result.rejected.filter(
      (rejection) => !baseline.rejected.some((known) => known.id === rejection.id),
    );
    expect(extra.map(({ id, reason }) => [id, reason]).sort()).toEqual(
      [
        [badSignature.envelope.id, "bad-signature"],
        [badBody.envelope.id, "bad-signature"],
        [unadmitted.envelope.id, "unauthorised"],
        [misfiled.envelope.id, "misdirected"],
        [misplacedId, "id-mismatch"],
        [garbageId, "malformed"],
      ].sort(),
    );
  });

  it("skips and counts unknown operation types and newer major schema versions instead of throwing", async () => {
    const baseline = await foldClassLog(entriesOf(classRecords), classLog, siteState);
    const Future = operationsFor<ClassState>("class")({
      name: "future.thing",
      schema: "1.0",
      payload: s.object({ value: s.integer() }),
      authorise: () => true,
      reduce: () => undefined,
    });
    const StartedV2 = operationsFor<ClassState>("class")({ ...ClassStarted, schema: "2.0" });
    const writer = new LogWriter(teacher1.key, classLog, new LamportClock(50), now);
    const future = await writer.append(Future, { value: 1 });
    const v2 = await writer.append(StartedV2, {});

    const result = await foldClassLog(
      [...entriesOf(classRecords), entry(future), entry(v2)],
      classLog,
      siteState,
    );
    expect(result.skipped).toEqual([
      {
        id: future.envelope.id,
        reason: "unknown-type",
        type: "future.thing",
        schema: "1.0",
        signer: teacher1.key.id,
      },
      {
        id: v2.envelope.id,
        reason: "unsupported-schema",
        type: "class.started",
        schema: "2.0",
        signer: teacher1.key.id,
      },
    ]);
    expect(result.state).toEqual(baseline.state);
    expect(result.applied).toBe(baseline.applied);
    expect(result.rejected).toEqual(baseline.rejected);
  });

  it("reports gaps and forks in a signer's chain, and a writer resumes from the fold's progress", async () => {
    const log: LogIdentity = { id: randomUuid(), kind: "class", site: siteKey.id, schema: "1.0" };
    const writer = new LogWriter(teacher1.key, log, new LamportClock(4), now);
    const created = await writer.append(ClassCreated, {
      name: "Chain",
      code: "CHAIN1",
      language: "en",
    });
    const started = await writer.append(ClassStarted, {});
    const stopped = await writer.append(ClassStopped, {});
    const restarted = await writer.append(ClassStarted, {});

    const withGap = await foldClassLog(entriesOf([created, stopped, restarted]), log, siteState);
    expect(withGap.warnings).toEqual([
      { kind: "chain-gap", signer: teacher1.key.id, seq: 2, ids: [stopped.envelope.id] },
    ]);
    expect(withGap.state.status).toBe("live");
    expect(withGap.rejected.map((rejection) => rejection.reason)).toEqual(["inapplicable"]);

    const complete = await foldClassLog(
      entriesOf([created, started, stopped, restarted]),
      log,
      siteState,
    );
    expect(complete.warnings).toEqual([]);
    expect(complete.signers.get(teacher1.key.id)).toEqual({
      seq: 4,
      hash: await recordHash(restarted),
    });

    const resumed = new LogWriter(teacher1.key, log, new LamportClock(complete.lamport), now);
    resumed.resume(complete.signers.get(teacher1.key.id));
    const fifth = await resumed.append(ClassStopped, {});
    expect(fifth.envelope.seq).toBe(5);
    expect(fifth.envelope.prev).toEqual(await recordHash(restarted));
    const continued = await foldClassLog(
      entriesOf([created, started, stopped, restarted, fifth]),
      log,
      siteState,
    );
    expect(continued.warnings).toEqual([]);
    expect(continued.state.status).toBe("stopped");

    const forked = new LogWriter(teacher1.key, log, new LamportClock(complete.lamport), now);
    const fork = await forked.append(ClassStopped, {});
    const withFork = await foldClassLog(
      entriesOf([created, started, stopped, restarted, fork]),
      log,
      siteState,
    );
    expect(withFork.warnings.map((warning) => warning.kind)).toEqual(["chain-fork"]);
  });

  it("validates payloads and log kinds before signing anything", async () => {
    const writer = new LogWriter(teacher1.key, classLog, new LamportClock(), now);
    await expect(
      writer.append(ClassCreated, { name: "", code: "K7P2QX", language: "es" }),
    ).rejects.toThrow(/name/);
    await expect(
      writer.append(DeviceAdmitted, { device: teacher2.key.id, role: "teacher" }),
    ).rejects.toThrow(/belongs in a site log/);
    expect(writer.seq).toBe(0);
    expect(writer.clock.value).toBe(0);
  });
});
