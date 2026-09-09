// The box's long-lived DTLS certificate: ECDSA P-256, generated once at
// install and carried in the recovery bundle. Its fingerprint is what the QR
// signs for devices.
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HashAlgorithm, SignatureAlgorithm } from "werift";

export function makeDtlsKeys() {
  const dir = mkdtempSync(join(tmpdir(), "dtls-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      "3650",
      "-subj",
      "/CN=trellis-box-dtls",
    ],
    { stdio: "ignore" },
  );
  const certPem = readFileSync(cert, "utf8");
  return {
    certPem,
    keyPem: readFileSync(key, "utf8"),
    // werift wants its own enums here, not names.
    signatureHash: { hash: HashAlgorithm.sha256_4, signature: SignatureAlgorithm.ecdsa_3 },
    fingerprint: new X509Certificate(certPem).fingerprint256,
  };
}

export function fingerprintOf(der) {
  return new X509Certificate(der).fingerprint256;
}
