import type { KeyId } from "../crypto/keys";
import * as s from "../schema/schema";
import { OperationRegistry, operationsFor, type Principal } from "./dsl";
import { type FoldResult, foldRecords } from "./fold";
import type { Envelope, LogIdentity } from "./record";
import { type SiteState, sitePrincipalAt } from "./site";

/**
 * The class log: the class lifecycle and its enrolment. Units, assignments,
 * chat, and annotations join it in phase 3. Authorisation is judged against
 * the site log's folded state, so a class log is only ever folded after the
 * site log it belongs to.
 */
export type ClassStatus = "created" | "live" | "stopped";

export interface ClassCreation {
  readonly name: string;
  readonly code: string;
  readonly language: string;
  readonly by: KeyId;
  readonly at: number;
}

export interface EnrolmentState {
  readonly enrolled: boolean;
  readonly lamport: number;
  readonly by: KeyId;
}

export interface ClassState {
  readonly log: string;
  readonly site: KeyId;
  created: ClassCreation | undefined;
  status: ClassStatus | undefined;
  readonly teachers: Set<KeyId>;
  readonly enrolment: Map<string, EnrolmentState>;
}

export function initialClassState(log: LogIdentity): ClassState {
  return {
    log: log.id,
    site: log.site,
    created: undefined,
    status: undefined,
    teachers: new Set(),
    enrolment: new Map(),
  };
}

const staff = (principal: Principal | undefined): boolean =>
  principal === "teacher" || principal === "administrator";

const staffOrSite = (principal: Principal | undefined): boolean =>
  staff(principal) || principal === "site";

const declare = operationsFor<ClassState>("class");

export const CLASS_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;
export const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

export const ClassCreated = declare({
  name: "class.created",
  schema: "1.0",
  payload: s.object({
    name: s.string({ min: 1, max: 120 }),
    code: s.string({ pattern: CLASS_CODE_PATTERN }),
    language: s.string({ pattern: LANGUAGE_TAG_PATTERN }),
  }),
  authorise: ({ principal }) => staff(principal),
  reduce: (state, { envelope, payload }) => {
    if (state.created !== undefined) {
      return "class already created";
    }
    state.created = {
      name: payload.name,
      code: payload.code,
      language: payload.language,
      by: envelope.signer,
      at: envelope.lamport,
    };
    state.status = "created";
    state.teachers.add(envelope.signer);
    return undefined;
  },
});

export const ClassStarted = declare({
  name: "class.started",
  schema: "1.0",
  payload: s.object({}),
  authorise: ({ principal }) => staff(principal),
  reduce: (state) => {
    if (state.created === undefined) {
      return "class not created";
    }
    if (state.status === "live") {
      return "class already live";
    }
    state.status = "live";
    return undefined;
  },
});

export const ClassStopped = declare({
  name: "class.stopped",
  schema: "1.0",
  payload: s.object({}),
  authorise: ({ principal }) => staff(principal),
  reduce: (state) => {
    if (state.created === undefined) {
      return "class not created";
    }
    if (state.status !== "live") {
      return "class not live";
    }
    state.status = "stopped";
    return undefined;
  },
});

/**
 * Enrolment add and remove resolve latest by logical order, and removal wins
 * a tie (class-state-log: "Concurrency semantics per operation family").
 * Records arrive here in logical order, so a later record never carries an
 * earlier Lamport clock; equal clocks are the concurrent case.
 */
function enrol(
  state: ClassState,
  learner: string,
  enrolled: boolean,
  envelope: Envelope,
): undefined | string {
  if (state.created === undefined) {
    return "class not created";
  }
  const current = state.enrolment.get(learner);
  if (current === undefined || envelope.lamport > current.lamport) {
    state.enrolment.set(learner, { enrolled, lamport: envelope.lamport, by: envelope.signer });
  } else {
    state.enrolment.set(learner, {
      enrolled: current.enrolled && enrolled,
      lamport: current.lamport,
      by: envelope.signer,
    });
  }
  return undefined;
}

export const EnrolmentAdded = declare({
  name: "enrolment.added",
  schema: "1.0",
  payload: s.object({ learner: s.uuid() }),
  authorise: ({ principal }) => staffOrSite(principal),
  reduce: (state, { envelope, payload }) => enrol(state, payload.learner, true, envelope),
});

export const EnrolmentRemoved = declare({
  name: "enrolment.removed",
  schema: "1.0",
  payload: s.object({ learner: s.uuid() }),
  authorise: ({ principal }) => staffOrSite(principal),
  reduce: (state, { envelope, payload }) => enrol(state, payload.learner, false, envelope),
});

export const CLASS_OPERATIONS = new OperationRegistry<ClassState>("class", [
  ClassCreated,
  ClassStarted,
  ClassStopped,
  EnrolmentAdded,
  EnrolmentRemoved,
]);

export function foldClassLog(
  entries: Iterable<readonly [string, Uint8Array]>,
  log: LogIdentity,
  site: SiteState,
): Promise<FoldResult<ClassState>> {
  if (log.kind !== "class") {
    throw new Error(`cannot fold a ${log.kind} log as a class log`);
  }
  if (log.site !== site.site) {
    throw new Error("class log belongs to a different site");
  }
  return foldRecords(entries, {
    log,
    registry: CLASS_OPERATIONS,
    initialState: () => initialClassState(log),
    principalAt: (_state, signer, lamport) => sitePrincipalAt(site, signer, lamport),
  });
}

/** Learner references currently enrolled, in reference order. */
export function classMembers(state: ClassState): readonly string[] {
  return [...state.enrolment.entries()]
    .filter(([, entry]) => entry.enrolled)
    .map(([learner]) => learner)
    .sort();
}
