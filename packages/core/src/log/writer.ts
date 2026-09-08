import { encodeCanonical } from "../cbor/canonical";
import type { SigningKey } from "../crypto/keys";
import { randomUuid } from "../crypto/random";
import type { OperationDeclaration } from "./dsl";
import type { SignerProgress } from "./fold";
import {
  type Envelope,
  type LogIdentity,
  type OperationRecord,
  recordHash,
  signRecord,
} from "./record";

/**
 * A peer's Lamport clock, shared by every log the peer writes and bumped past
 * every clock value it observes in any log. Sharing one clock across logs is
 * what makes logical time comparable between a class-log record and the
 * site-log admission or revocation that decides whether its signer was
 * authorised (class-state-log: "Authorisation by role at logical time").
 */
export class LamportClock {
  #value: number;

  constructor(initial = 0) {
    this.#value = initial;
  }

  get value(): number {
    return this.#value;
  }

  observe(lamport: number): void {
    if (lamport > this.#value) {
      this.#value = lamport;
    }
  }

  next(): number {
    this.#value += 1;
    return this.#value;
  }
}

export interface AppendOptions {
  /** The learner a shared device is acting for. */
  readonly actor?: string;
}

/**
 * Issues records for one signer in one log: validates the payload against
 * its declaration, assigns the next sequence number and Lamport clock, links
 * the signer's previous record by hash, and signs. Appends are serialised so
 * concurrent callers still produce one chain.
 */
export class LogWriter {
  readonly key: SigningKey;
  readonly log: LogIdentity;
  readonly clock: LamportClock;
  readonly #now: () => number;
  #seq = 0;
  #prev: Uint8Array | null = null;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(
    key: SigningKey,
    log: LogIdentity,
    clock: LamportClock,
    now: () => number = Date.now,
  ) {
    this.key = key;
    this.log = log;
    this.clock = clock;
    this.#now = now;
  }

  /** Continues this signer's chain from a fold's progress, after a reload. */
  resume(progress: SignerProgress | undefined): void {
    this.#seq = progress?.seq ?? 0;
    this.#prev = progress?.hash ?? null;
  }

  get seq(): number {
    return this.#seq;
  }

  append<Payload, State>(
    declaration: OperationDeclaration<string, Payload, State>,
    payload: Payload,
    options: AppendOptions = {},
  ): Promise<OperationRecord> {
    const run = async (): Promise<OperationRecord> => {
      if (declaration.log !== this.log.kind) {
        throw new Error(
          `${declaration.name} belongs in a ${declaration.log} log, not a ${this.log.kind} log`,
        );
      }
      const checked = declaration.payload.parse(payload);
      const envelope: Envelope = {
        id: randomUuid(),
        log: this.log.id,
        type: declaration.name,
        schema: declaration.schema,
        signer: this.key.id,
        ...(options.actor !== undefined ? { actor: options.actor } : {}),
        seq: this.#seq + 1,
        lamport: this.clock.next(),
        prev: this.#prev,
        time: this.#now(),
      };
      const record = await signRecord(this.key, envelope, encodeCanonical(checked));
      this.#seq = envelope.seq;
      this.#prev = await recordHash(record);
      return record;
    };
    const result = this.#queue.then(run, run);
    this.#queue = result.catch(() => undefined);
    return result;
  }
}
