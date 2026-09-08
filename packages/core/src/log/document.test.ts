import { describe, expect, it } from "vitest";
import { generateSigningKey, generateSiteKey } from "../crypto/keys";
import {
  appendToLogDocument,
  cloneLogDocument,
  createLogDocument,
  loadLogDocument,
  logDocumentEntries,
  logDocumentIdentity,
  mergeLogDocuments,
  saveLogDocument,
} from "./document";
import type { LogIdentity } from "./record";
import { DeviceAdmitted, foldSiteLog } from "./site";
import { LamportClock, LogWriter } from "./writer";

describe("the keyed-set log document", () => {
  it("is created once, replicated, and merges concurrent appends to their union", async () => {
    const siteKey = await generateSiteKey();
    const admin = await generateSigningKey({ algorithm: "ed25519" });
    const teacher1 = await generateSigningKey({ algorithm: "ed25519" });
    const teacher2 = await generateSigningKey({ algorithm: "p256" });
    const identity: LogIdentity = { id: siteKey.id, kind: "site", site: siteKey.id, schema: "1.0" };

    // The box creates the site log and admits the first administrator.
    let boxDoc = createLogDocument(identity);
    expect(logDocumentIdentity(boxDoc)).toEqual(identity);
    const boxWriter = new LogWriter(siteKey, identity, new LamportClock());
    const admitAdmin = await boxWriter.append(DeviceAdmitted, {
      device: admin.id,
      role: "administrator",
    });
    boxDoc = appendToLogDocument(boxDoc, admitAdmin);

    // The same record arriving again is one entry and no new change.
    expect(appendToLogDocument(boxDoc, admitAdmin)).toBe(boxDoc);
    expect(logDocumentEntries(boxDoc)).toHaveLength(1);

    // Two replicas: one by save and load as sync would deliver it, one by clone.
    let adminDoc = loadLogDocument(saveLogDocument(boxDoc));
    let otherDoc = cloneLogDocument(boxDoc);
    expect(logDocumentIdentity(adminDoc)).toEqual(identity);

    // Each replica appends while disconnected.
    const adminWriter = new LogWriter(admin, identity, new LamportClock(1));
    const admitTeacher1 = await adminWriter.append(DeviceAdmitted, {
      device: teacher1.id,
      role: "teacher",
    });
    adminDoc = appendToLogDocument(adminDoc, admitTeacher1);
    const admitTeacher2 = await boxWriter.append(DeviceAdmitted, {
      device: teacher2.id,
      role: "teacher",
    });
    otherDoc = appendToLogDocument(otherDoc, admitTeacher2);

    // Merging in any direction yields the union, and every replica folds alike.
    boxDoc = mergeLogDocuments(mergeLogDocuments(boxDoc, adminDoc), otherDoc);
    adminDoc = mergeLogDocuments(adminDoc, boxDoc);
    otherDoc = mergeLogDocuments(otherDoc, adminDoc);
    const ids = (entries: readonly (readonly [string, Uint8Array])[]) =>
      new Set(entries.map(([id]) => id));
    const expectedIds = new Set([
      admitAdmin.envelope.id,
      admitTeacher1.envelope.id,
      admitTeacher2.envelope.id,
    ]);
    expect(ids(logDocumentEntries(boxDoc))).toEqual(expectedIds);
    expect(ids(logDocumentEntries(adminDoc))).toEqual(expectedIds);
    expect(ids(logDocumentEntries(otherDoc))).toEqual(expectedIds);

    const boxFold = await foldSiteLog(logDocumentEntries(boxDoc), identity);
    const adminFold = await foldSiteLog(logDocumentEntries(adminDoc), identity);
    expect(boxFold.applied).toBe(3);
    expect(boxFold.rejected).toEqual([]);
    expect(adminFold.state).toEqual(boxFold.state);
    expect(boxFold.state.devices.get(teacher2.id)?.role).toBe("teacher");

    // Stored bytes survive a save and load round trip byte for byte.
    const reloaded = loadLogDocument(saveLogDocument(boxDoc));
    expect(reloaded.ops[admitTeacher1.envelope.id]).toEqual(admitTeacher1.bytes);

    // Different bytes under an existing identifier are refused locally.
    const tampered = admitTeacher1.bytes.slice();
    tampered[0] = (tampered[0] as number) ^ 0x01;
    expect(() => appendToLogDocument(boxDoc, { ...admitTeacher1, bytes: tampered })).toThrow(
      /different record/,
    );
  });
});
