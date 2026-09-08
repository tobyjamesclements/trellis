import type { Schema } from "../schema/schema";
import {
  type Envelope,
  type LogKind,
  OPERATION_TYPE_PATTERN,
  SCHEMA_VERSION_PATTERN,
} from "./record";

/**
 * The operation DSL (design decision D4): every operation type is declared
 * once with its name, schema version, payload schema, authorisation
 * predicate, and reducer, and the fold is generated from the declarations.
 */
export type Role = "administrator" | "teacher" | "student";

export const ROLES: readonly Role[] = ["administrator", "teacher", "student"];

/** What a signer was at a record's logical time: a device role, or the site key itself. */
export type Principal = Role | "site";

export interface ReduceInput<Payload> {
  readonly envelope: Envelope;
  readonly payload: Payload;
}

export interface AuthoriseInput<Payload, State> extends ReduceInput<Payload> {
  /** Undefined when the signer was not admitted, or was revoked, at the record's logical time. */
  readonly principal: Principal | undefined;
  readonly state: State;
}

export interface OperationDeclaration<Name extends string, Payload, State> {
  readonly name: Name;
  /** The schema version this declaration writes and the highest major it can read. */
  readonly schema: string;
  readonly log: LogKind;
  readonly payload: Schema<Payload>;
  authorise(input: AuthoriseInput<Payload, State>): boolean;
  /**
   * Applies the operation to the state. Returning a string means the record is
   * valid and authorised but inapplicable at this point in the logical order
   * (a class started twice, a device admitted twice); the fold records it.
   */
  reduce(state: State, input: ReduceInput<Payload>): undefined | string;
}

/**
 * Binds a log kind and state type so each declaration in a log family infers
 * its name and payload from the literal it is written as.
 */
export function operationsFor<State>(log: LogKind) {
  return <Name extends string, Payload>(
    declaration: Omit<OperationDeclaration<Name, Payload, State>, "log">,
  ): OperationDeclaration<Name, Payload, State> => {
    if (!OPERATION_TYPE_PATTERN.test(declaration.name)) {
      throw new Error(`invalid operation name "${declaration.name}"`);
    }
    if (!SCHEMA_VERSION_PATTERN.test(declaration.schema)) {
      throw new Error(`invalid schema version "${declaration.schema}" for ${declaration.name}`);
    }
    return Object.freeze({ ...declaration, log });
  };
}

export class OperationRegistry<State> {
  readonly log: LogKind;
  readonly #byName = new Map<string, OperationDeclaration<string, unknown, State>>();

  constructor(log: LogKind, declarations: readonly OperationDeclaration<string, unknown, State>[]) {
    this.log = log;
    for (const declaration of declarations) {
      if (declaration.log !== log) {
        throw new Error(`${declaration.name} belongs in a ${declaration.log} log, not ${log}`);
      }
      if (this.#byName.has(declaration.name)) {
        throw new Error(`duplicate operation declaration ${declaration.name}`);
      }
      this.#byName.set(declaration.name, declaration);
    }
  }

  get(name: string): OperationDeclaration<string, unknown, State> | undefined {
    return this.#byName.get(name);
  }

  get names(): readonly string[] {
    return [...this.#byName.keys()];
  }
}
