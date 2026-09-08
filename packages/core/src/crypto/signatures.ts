import { importKeyAlgorithm, type KeyId, parseKeyId, type SigningKey } from "./keys";
import { asBufferSource, getSubtle } from "./subtle";

function signAlgorithm(algorithm: "ed25519" | "p256"): AlgorithmIdentifier | EcdsaParams {
  return algorithm === "ed25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: "SHA-256" };
}

/** Signs bytes with a key this peer holds. Signatures are 64 bytes for both algorithms. */
export async function sign(key: SigningKey, message: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await getSubtle().sign(signAlgorithm(key.algorithm), key.privateKey, asBufferSource(message)),
  );
}

const verificationKeys = new Map<KeyId, Promise<CryptoKey>>();

function verificationKey(id: KeyId): Promise<CryptoKey> {
  let cached = verificationKeys.get(id);
  if (cached === undefined) {
    const { algorithm, publicKey } = parseKeyId(id);
    cached = getSubtle().importKey(
      "raw",
      asBufferSource(publicKey),
      importKeyAlgorithm(algorithm),
      true,
      ["verify"],
    );
    cached.catch(() => verificationKeys.delete(id));
    verificationKeys.set(id, cached);
  }
  return cached;
}

/**
 * Verifies a signature against the public key carried in the signer's key
 * id. Returns false for a bad signature; throws only when the id itself is
 * malformed, which callers validate before they get here. Imported public
 * keys are cached because a fold verifies the same few signers thousands of
 * times.
 */
export async function verify(
  signer: KeyId,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  const { algorithm } = parseKeyId(signer);
  if (signature.length !== 64) {
    return false;
  }
  const key = await verificationKey(signer);
  return getSubtle().verify(
    signAlgorithm(algorithm),
    key,
    asBufferSource(signature),
    asBufferSource(message),
  );
}
