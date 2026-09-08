/**
 * A small validator for values decoded from CBOR (or built locally) before
 * they are trusted. It is deliberately tiny: the operation DSL declares each
 * payload's shape with it, and the same declarations validate what a peer
 * writes and what it reads. Plain objects and `Map`s with string keys are
 * both accepted as objects, because strict CBOR decoding yields `Map`s.
 * Unknown keys are ignored so that minor schema versions can add fields.
 */
export class SchemaError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path === "" ? "value" : path}: ${message}`);
    this.name = "SchemaError";
    this.path = path;
  }
}

export interface Schema<T> {
  readonly description: string;
  parse(value: unknown, path?: string): T;
}

export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

type Fields = Record<string, Schema<unknown>>;

type OptionalKeys<F extends Fields> = {
  [K in keyof F]: F[K] extends { readonly optional: true } ? K : never;
}[keyof F];

type Simplify<T> = { [K in keyof T]: T[K] } & {};

export type ObjectOf<F extends Fields> = Simplify<
  { readonly [K in Exclude<keyof F, OptionalKeys<F>>]: Infer<F[K]> } & {
    readonly [K in OptionalKeys<F>]?: Exclude<Infer<F[K]>, undefined>;
  }
>;

function describe(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value instanceof Uint8Array) {
    return "bytes";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (value instanceof Map) {
    return "map";
  }
  return typeof value;
}

export interface StringOptions {
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: RegExp;
}

export function string(options: StringOptions = {}): Schema<string> {
  return {
    description: "string",
    parse(value, path = "") {
      if (typeof value !== "string") {
        throw new SchemaError(path, `expected string, got ${describe(value)}`);
      }
      if (options.min !== undefined && value.length < options.min) {
        throw new SchemaError(path, `expected at least ${options.min} characters`);
      }
      if (options.max !== undefined && value.length > options.max) {
        throw new SchemaError(path, `expected at most ${options.max} characters`);
      }
      if (options.pattern !== undefined && !options.pattern.test(value)) {
        throw new SchemaError(path, `does not match ${options.pattern}`);
      }
      return value;
    },
  };
}

export interface IntegerOptions {
  readonly min?: number;
  readonly max?: number;
}

export function integer(options: IntegerOptions = {}): Schema<number> {
  return {
    description: "integer",
    parse(value, path = "") {
      if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        throw new SchemaError(path, `expected a safe integer, got ${describe(value)}`);
      }
      if (options.min !== undefined && value < options.min) {
        throw new SchemaError(path, `expected at least ${options.min}`);
      }
      if (options.max !== undefined && value > options.max) {
        throw new SchemaError(path, `expected at most ${options.max}`);
      }
      return value;
    },
  };
}

export function boolean(): Schema<boolean> {
  return {
    description: "boolean",
    parse(value, path = "") {
      if (typeof value !== "boolean") {
        throw new SchemaError(path, `expected boolean, got ${describe(value)}`);
      }
      return value;
    },
  };
}

export interface BytesOptions {
  readonly length?: number;
  readonly max?: number;
}

export function bytes(options: BytesOptions = {}): Schema<Uint8Array> {
  return {
    description: "bytes",
    parse(value, path = "") {
      if (!(value instanceof Uint8Array)) {
        throw new SchemaError(path, `expected bytes, got ${describe(value)}`);
      }
      if (options.length !== undefined && value.length !== options.length) {
        throw new SchemaError(path, `expected ${options.length} bytes, got ${value.length}`);
      }
      if (options.max !== undefined && value.length > options.max) {
        throw new SchemaError(path, `expected at most ${options.max} bytes`);
      }
      return value;
    },
  };
}

export function literal<const L extends string>(...values: readonly L[]): Schema<L> {
  return {
    description: values.map((value) => JSON.stringify(value)).join(" | "),
    parse(value, path = "") {
      if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
        throw new SchemaError(path, `expected one of ${this.description}`);
      }
      return value as L;
    },
  };
}

export function nullable<T>(schema: Schema<T>): Schema<T | null> {
  return {
    description: `${schema.description} | null`,
    parse(value, path = "") {
      return value === null ? null : schema.parse(value, path);
    },
  };
}

export function optional<T>(schema: Schema<T>): OptionalSchema<T> {
  return {
    description: `${schema.description}?`,
    optional: true,
    parse(value, path = "") {
      return value === undefined ? undefined : schema.parse(value, path);
    },
  };
}

export interface ArrayOptions {
  readonly max?: number;
}

export function array<T>(item: Schema<T>, options: ArrayOptions = {}): Schema<readonly T[]> {
  return {
    description: `${item.description}[]`,
    parse(value, path = "") {
      if (!Array.isArray(value)) {
        throw new SchemaError(path, `expected array, got ${describe(value)}`);
      }
      if (options.max !== undefined && value.length > options.max) {
        throw new SchemaError(path, `expected at most ${options.max} items`);
      }
      return value.map((element, index) => item.parse(element, `${path}[${index}]`));
    },
  };
}

export function tuple<const S extends readonly Schema<unknown>[]>(
  ...items: S
): Schema<{ readonly [K in keyof S]: Infer<S[K]> }> {
  return {
    description: `[${items.map((item) => item.description).join(", ")}]`,
    parse(value, path = "") {
      if (!Array.isArray(value) || value.length !== items.length) {
        throw new SchemaError(path, `expected a ${items.length}-tuple, got ${describe(value)}`);
      }
      return items.map((item, index) => item.parse(value[index], `${path}[${index}]`)) as {
        readonly [K in keyof S]: Infer<S[K]>;
      };
    },
  };
}

function fieldOf(value: object, key: string): unknown {
  if (value instanceof Map) {
    return value.get(key);
  }
  return Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
}

export function object<const F extends Fields>(fields: F): Schema<ObjectOf<F>> {
  return {
    description: `{ ${Object.keys(fields).join(", ")} }`,
    parse(value, path = "") {
      const isPlainObject =
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Uint8Array);
      if (!isPlainObject) {
        throw new SchemaError(path, `expected object, got ${describe(value)}`);
      }
      if (value instanceof Map) {
        for (const key of value.keys()) {
          if (typeof key !== "string") {
            throw new SchemaError(path, "expected string keys");
          }
        }
      }
      const output: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(fields)) {
        const parsed = schema.parse(fieldOf(value, key), path === "" ? key : `${path}.${key}`);
        if (parsed !== undefined) {
          output[key] = parsed;
        }
      }
      return output as ObjectOf<F>;
    },
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A lower-case RFC 9562 UUID, the form of operation identifiers and learner references. */
export function uuid(): Schema<string> {
  const inner = string({ pattern: UUID_PATTERN });
  return { ...inner, description: "uuid" };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
