// Short-lived ECDSA P-256 self-signed certificates, the only kind browsers
// accept for `serverCertificateHashes` (at most fourteen days of validity).
import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeCertificate({ days = 14, curve = "prime256v1", host = "127.0.0.1" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wt-cert-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      `ec`,
      "-pkeyopt",
      `ec_paramgen_curve:${curve}`,
      "-nodes",
      "-keyout",
      key,
      "-out",
      cert,
      "-days",
      String(days),
      "-subj",
      "/CN=trellis-box",
      "-addext",
      `subjectAltName=IP:${host}`,
    ],
    { stdio: "ignore" },
  );
  const certPem = readFileSync(cert, "utf8");
  const x509 = new X509Certificate(certPem);
  return {
    certPem,
    keyPem: readFileSync(key, "utf8"),
    sha256Hex: x509.fingerprint256.replaceAll(":", "").toLowerCase(),
    validFrom: x509.validFrom,
    validTo: x509.validTo,
  };
}
