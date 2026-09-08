import * as Automerge from "@automerge/automerge/slim";
import { bytesEqual } from "../crypto/hash";
import type { KeyId } from "../crypto/keys";
import type { LogIdentity, LogKind, OperationRecord } from "./record";

/**
 * The keyed append-only set (design decision D3): an Automerge document whose
 * `ops` map goes from operation identifier to the record's signed bytes.
 * Distinct keys never conflict, so concurrent appends from any number of
 * peers merge to their union, and the same record arriving twice is one
 * entry. The document is created once, by the box, and replicated; a second
 * `createLogDocument` for the same log would be a different document.
 *
 * Callers must have initialised the Automerge WASM module: the box does so
 * from its own file and the client from the shell's assets.
 */
export type LogDocument = {
  kind: LogKind;
  log: string;
  site: KeyId;
  schema: string;
  ops: Record<string, Uint8Array>;
};

export type LogDoc = Automerge.Doc<LogDocument>;

export function createLogDocument(identity: LogIdentity): LogDoc {
  return Automerge.from<LogDocument>({
    kind: identity.kind,
    log: identity.id,
    site: identity.site,
    schema: identity.schema,
    ops: {},
  });
}

export function logDocumentIdentity(doc: LogDoc): LogIdentity {
  return { id: doc.log, kind: doc.kind, site: doc.site, schema: doc.schema };
}

/** Appends a record; a record already present with the same bytes is a no-op. */
export function appendToLogDocument(doc: LogDoc, record: OperationRecord): LogDoc {
  const id = record.envelope.id;
  const existing = doc.ops[id];
  if (existing !== undefined) {
    if (bytesEqual(existing, record.bytes)) {
      return doc;
    }
    throw new Error(`log already holds a different record under ${id}`);
  }
  return Automerge.change(doc, `append ${record.envelope.type}`, (draft) => {
    draft.ops[id] = record.bytes;
  });
}

export function logDocumentEntries(doc: LogDoc): readonly (readonly [string, Uint8Array])[] {
  return Object.entries(doc.ops);
}

export function mergeLogDocuments(into: LogDoc, from: LogDoc): LogDoc {
  return Automerge.merge(into, from);
}

export function cloneLogDocument(doc: LogDoc): LogDoc {
  return Automerge.clone(doc);
}

export function saveLogDocument(doc: LogDoc): Uint8Array {
  return Automerge.save(doc);
}

export function loadLogDocument(bytes: Uint8Array): LogDoc {
  return Automerge.load<LogDocument>(bytes);
}
