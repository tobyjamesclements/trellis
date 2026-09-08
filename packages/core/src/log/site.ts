import type { KeyId } from "../crypto/keys";
import * as s from "../schema/schema";
import { OperationRegistry, operationsFor, type Principal, type Role } from "./dsl";
import { type FoldResult, foldRecords } from "./fold";
import { keyIdSchema, type LogIdentity } from "./record";

/**
 * The site log: device admissions, roles, and revocations for one site.
 * Licence events, the pack catalogue, succession, and schema settings join it
 * in later phases. The site key named by the log is the trust anchor: records
 * it signs are always from the "site" principal.
 */
export type DeviceDesignation = "shared" | "loaned";

export interface DeviceState {
  readonly role: Role;
  readonly designation?: DeviceDesignation;
  /** The learner a personal or loaned device acts for by default. */
  readonly learner?: string;
  readonly admittedAt: number;
  readonly admittedBy: KeyId;
  readonly revokedAt?: number;
  readonly revokedBy?: KeyId;
}

export interface SiteState {
  readonly site: KeyId;
  readonly devices: Map<KeyId, DeviceState>;
}

export function initialSiteState(site: KeyId): SiteState {
  return { site, devices: new Map() };
}

/**
 * The principal a signer was at a logical time (class-state-log:
 * "Authorisation by role at logical time"). A device counts from the Lamport
 * clock of its admission and stops at the clock of its revocation, and a
 * revoked key is never re-admitted: a lost or replaced device joins again
 * with a fresh key.
 */
export function sitePrincipalAt(
  state: SiteState,
  signer: KeyId,
  lamport: number,
): Principal | undefined {
  if (signer === state.site) {
    return "site";
  }
  const device = state.devices.get(signer);
  if (device === undefined || device.admittedAt > lamport) {
    return undefined;
  }
  if (device.revokedAt !== undefined && lamport >= device.revokedAt) {
    return undefined;
  }
  return device.role;
}

const declare = operationsFor<SiteState>("site");

export const DeviceAdmitted = declare({
  name: "device.admitted",
  schema: "1.0",
  payload: s.object({
    device: keyIdSchema,
    role: s.literal("administrator", "teacher", "student"),
    designation: s.optional(s.literal("shared", "loaned")),
    learner: s.optional(s.uuid()),
  }),
  // The site key admits on the box's behalf: the setup code, staff codes, and
  // class joins. Administrators admit any role; teachers admit students.
  authorise: ({ principal, payload }) =>
    principal === "site" ||
    principal === "administrator" ||
    (principal === "teacher" && payload.role === "student"),
  reduce: (state, { envelope, payload }) => {
    const existing = state.devices.get(payload.device);
    if (existing !== undefined) {
      return existing.revokedAt === undefined ? "device already admitted" : "device is revoked";
    }
    state.devices.set(payload.device, {
      role: payload.role,
      ...(payload.designation !== undefined ? { designation: payload.designation } : {}),
      ...(payload.learner !== undefined ? { learner: payload.learner } : {}),
      admittedAt: envelope.lamport,
      admittedBy: envelope.signer,
    });
    return undefined;
  },
});

export const DeviceRevoked = declare({
  name: "device.revoked",
  schema: "1.0",
  payload: s.object({
    device: keyIdSchema,
    reason: s.optional(s.string({ max: 200 })),
  }),
  // Administrators and the site key revoke any device; a teacher revokes the
  // student devices they could have admitted, which covers a lost laptop.
  authorise: ({ principal, payload, state }) => {
    if (principal === "site" || principal === "administrator") {
      return true;
    }
    return principal === "teacher" && state.devices.get(payload.device)?.role === "student";
  },
  reduce: (state, { envelope, payload }) => {
    const existing = state.devices.get(payload.device);
    if (existing === undefined) {
      return "device is not admitted";
    }
    if (existing.revokedAt !== undefined) {
      return "device already revoked";
    }
    state.devices.set(payload.device, {
      ...existing,
      revokedAt: envelope.lamport,
      revokedBy: envelope.signer,
    });
    return undefined;
  },
});

export const SITE_OPERATIONS = new OperationRegistry<SiteState>("site", [
  DeviceAdmitted,
  DeviceRevoked,
]);

export function foldSiteLog(
  entries: Iterable<readonly [string, Uint8Array]>,
  log: LogIdentity,
): Promise<FoldResult<SiteState>> {
  if (log.kind !== "site") {
    throw new Error(`cannot fold a ${log.kind} log as the site log`);
  }
  return foldRecords(entries, {
    log,
    registry: SITE_OPERATIONS,
    initialState: () => initialSiteState(log.site),
    principalAt: sitePrincipalAt,
  });
}

/** Devices admitted and not revoked, in key order. */
export function activeDevices(state: SiteState): readonly [KeyId, DeviceState][] {
  return [...state.devices.entries()]
    .filter(([, device]) => device.revokedAt === undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
}
