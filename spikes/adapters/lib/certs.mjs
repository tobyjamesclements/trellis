import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeCertificate({ days = 14, host = "127.0.0.1" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "wt-cert-"));
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
      String(days),
      "-subj",
      "/CN=trellis-box",
      "-addext",
      `subjectAltName=IP:${host}`,
    ],
    { stdio: "ignore" },
  );
  const certPem = readFileSync(cert, "utf8");
  const hex = new X509Certificate(certPem).fingerprint256.replaceAll(":", "");
  return {
    certPem,
    keyPem: readFileSync(key, "utf8"),
    sha256: Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16)),
  };
}
