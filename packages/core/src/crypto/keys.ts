import { base64urlDecode, base64urlEncode } from "../encoding/base64url";
import { asBufferSource, getSubtle } from "./subtle";

/**
 * Signing algorithms the platform accepts (design decision D5): Ed25519 where
 * Web Crypto supports it, ECDSA over P-256 otherwise. Every key identifier
 * carries its algorithm as a prefix so a verifier never has to guess, and
 * carries the raw public key itself so a signer named in a record can be
 * verified without any lookup beyond the admission that makes it trusted.
 */
export type SignatureAlgorithm = "ed25519" | "p256";

export type KeyId = `${SignatureAlgorithm}:${string}`;

/** Raw public key length per algorithm: Ed25519 point, or an uncompressed P-256 point. */
const RAW_PUBLIC_KEY_LENGTH: Record<SignatureAlgorithm, number> = {
  ed25519: 32,
  p256: 65,
};

export interface SigningKey {
  readonly algorithm: SignatureAlgorithm;
  readonly id: KeyId;
  readonly publicKey: Uint8Array;
  readonly privateKey: CryptoKey;
}

export interface GenerateOptions {
  /**
   * `auto` tries Ed25519 and falls back to P-256 when the runtime lacks it.
   * A fixed algorithm is for tests and for the box, which always has Ed25519.
   */
  readonly algorithm?: SignatureAlgorithm | "auto";
  /**
   * Device keys are generated non-extractable so the private key never leaves
   * the platform's key store. The site key is extractable because the recovery
   * bundle must contain it.
   */
  readonly extractable?: boolean;
}

export function generateKeyAlgorithm(
  algorithm: SignatureAlgorithm,
): AlgorithmIdentifier | EcKeyGenParams {
  return algorithm === "ed25519" ? { name: "Ed25519" } : { name: "ECDSA", namedCurve: "P-256" };
}

export function importKeyAlgorithm(
  algorithm: SignatureAlgorithm,
): AlgorithmIdentifier | EcKeyImportParams {
  return algorithm === "ed25519" ? { name: "Ed25519" } : { name: "ECDSA", namedCurve: "P-256" };
}

export function keyIdFor(algorithm: SignatureAlgorithm, publicKey: Uint8Array): KeyId {
  const expected = RAW_PUBLIC_KEY_LENGTH[algorithm];
  if (publicKey.length !== expected) {
    throw new Error(`${algorithm} public key must be ${expected} bytes, got ${publicKey.length}`);
  }
  return `${algorithm}:${base64urlEncode(publicKey)}`;
}

export interface ParsedKeyId {
  readonly algorithm: SignatureAlgorithm;
  readonly publicKey: Uint8Array;
}

export function isSignatureAlgorithm(value: string): value is SignatureAlgorithm {
  return value === "ed25519" || value === "p256";
}

/** Parses and validates a key identifier; throws on any malformed input. */
export function parseKeyId(id: string): ParsedKeyId {
  const separator = id.indexOf(":");
  if (separator < 0) {
    throw new Error("key id has no algorithm prefix");
  }
  const algorithm = id.slice(0, separator);
  if (!isSignatureAlgorithm(algorithm)) {
    throw new Error(`unsupported key algorithm "${algorithm}"`);
  }
  const publicKey = base64urlDecode(id.slice(separator + 1));
  if (publicKey.length !== RAW_PUBLIC_KEY_LENGTH[algorithm]) {
    throw new Error(`${algorithm} key id carries ${publicKey.length} bytes of public key`);
  }
  if (algorithm === "p256" && publicKey[0] !== 0x04) {
    throw new Error("p256 key id must carry an uncompressed point");
  }
  return { algorithm, publicKey };
}

export function isKeyId(value: unknown): value is KeyId {
  if (typeof value !== "string") {
    return false;
  }
  try {
    parseKeyId(value);
    return true;
  } catch {
    return false;
  }
}

async function generateWith(
  algorithm: SignatureAlgorithm,
  extractable: boolean,
): Promise<SigningKey> {
  const subtle = getSubtle();
  const pair = (await subtle.generateKey(generateKeyAlgorithm(algorithm), extractable, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  return {
    algorithm,
    id: keyIdFor(algorithm, publicKey),
    publicKey,
    privateKey: pair.privateKey,
  };
}

let ed25519Supported: boolean | undefined;

/** Whether this runtime's Web Crypto can generate and use Ed25519 keys. */
export async function supportsEd25519(): Promise<boolean> {
  if (ed25519Supported === undefined) {
    try {
      await getSubtle().generateKey({ name: "Ed25519" }, false, ["sign", "verify"]);
      ed25519Supported = true;
    } catch {
      ed25519Supported = false;
    }
  }
  return ed25519Supported;
}

export async function generateSigningKey(options: GenerateOptions = {}): Promise<SigningKey> {
  const extractable = options.extractable ?? false;
  const requested = options.algorithm ?? "auto";
  if (requested !== "auto") {
    return generateWith(requested, extractable);
  }
  return generateWith((await supportsEd25519()) ? "ed25519" : "p256", extractable);
}

/**
 * The per-device keypair generated on first run (device-identity: "Keypair
 * generated on first run"). Non-extractable; the device is identified by the
 * resulting key id and nothing else.
 */
export function generateDeviceKey(): Promise<SigningKey> {
  return generateSigningKey({ algorithm: "auto", extractable: false });
}

/**
 * The site key, generated once on the box at install. It signs admissions,
 * enrolments from joins, licence operations, leases, roster snapshots, and
 * transport parameters, and it must be exportable so the recovery bundle can
 * carry it. Ed25519 is required: the box runtime always has it, and the site
 * key is the one identity every device pins.
 */
export function generateSiteKey(): Promise<SigningKey> {
  return generateSigningKey({ algorithm: "ed25519", extractable: true });
}

/** A private key in PKCS#8 form for the box's key store and the recovery bundle. */
export interface ExportedSigningKey {
  readonly algorithm: SignatureAlgorithm;
  readonly id: KeyId;
  readonly pkcs8: Uint8Array;
}

export async function exportSigningKey(key: SigningKey): Promise<ExportedSigningKey> {
  const pkcs8 = new Uint8Array(await getSubtle().exportKey("pkcs8", key.privateKey));
  return { algorithm: key.algorithm, id: key.id, pkcs8 };
}

export async function importSigningKey(exported: ExportedSigningKey): Promise<SigningKey> {
  const { algorithm, publicKey } = parseKeyId(exported.id);
  if (algorithm !== exported.algorithm) {
    throw new Error("exported key algorithm does not match its id");
  }
  const privateKey = await getSubtle().importKey(
    "pkcs8",
    asBufferSource(exported.pkcs8),
    importKeyAlgorithm(algorithm),
    true,
    ["sign"],
  );
  return { algorithm, id: exported.id, publicKey, privateKey };
}
