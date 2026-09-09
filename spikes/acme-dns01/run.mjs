// Spike 1.10, the half that needs no real zone: Pebble (Let's Encrypt's test
// CA) with its challenge test DNS server stands in for the CA and the project
// zone; the box obtains a certificate for a hostname in the zone by DNS-01
// through the registry's challenge service, then renews it unattended.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import acme from "acme-client";
import { obtainCertificate } from "./box-acme.mjs";
import { startChallengeService } from "./challenge-service.mjs";

const PEBBLE = process.env.PEBBLE_BIN ?? "pebble";
const CHALLTESTSRV = process.env.CHALLTESTSRV_BIN ?? "pebble-challtestsrv";
const dir = process.env.PEBBLE_DIR ?? mkdtempSync(join(tmpdir(), "pebble-"));
// Node reads NODE_EXTRA_CA_CERTS only at start-up, so the script generates
// Pebble's listener certificate, appends it to whatever CA bundle the
// environment already trusts, and runs itself again with that bundle.
if (!process.env.PEBBLE_CHILD) {
  console.log("parent: generating Pebble listener certificate");
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
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-days",
      "2",
      "-subj",
      "/CN=pebble",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  if (!existsSync(join(dir, "cert.pem"))) throw new Error(`openssl wrote no certificate in ${dir}`);
  const inherited = process.env.NODE_EXTRA_CA_CERTS
    ? readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8")
    : "";
  writeFileSync(
    join(dir, "ca-bundle.pem"),
    `${inherited}\n${readFileSync(join(dir, "cert.pem"), "utf8")}`,
  );
  console.log("parent: relaunching with the CA bundle");
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: "inherit",
    env: {
      ...process.env,
      PEBBLE_CHILD: "1",
      NODE_EXTRA_CA_CERTS: join(dir, "ca-bundle.pem"),
      PEBBLE_DIR: dir,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
  process.exit(child.status ?? 1);
}

writeFileSync(
  join(dir, "config.json"),
  JSON.stringify({
    pebble: {
      listenAddress: "127.0.0.1:14000",
      managementListenAddress: "127.0.0.1:15000",
      certificate: join(dir, "cert.pem"),
      privateKey: join(dir, "key.pem"),
      httpPort: 5002,
      tlsPort: 5001,
      ocspResponderURL: "",
      externalAccountBindingRequired: false,
    },
  }),
);

const children = [];
const logs = new Map();
const start = (bin, args, ready) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, PEBBLE_VA_NOSLEEP: "1", PEBBLE_WFE_NONCEREJECT: "0" },
    });
    children.push(child);
    let output = "";
    logs.set(bin, () => output);
    const onData = (chunk) => {
      output += chunk;
      if (output.includes(ready)) resolve(child);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      output += `\n[exited ${code}]`;
      reject(new Error(`${bin} exited ${code}: ${output.slice(-300)}`));
    });
  });
const stop = () => {
  for (const child of children) child.kill();
};

try {
  console.log("child: starting challenge test DNS server");
  await start(
    CHALLTESTSRV,
    [
      "-dnsserver",
      "127.0.0.1:8053",
      "-management",
      "127.0.0.1:8055",
      "-http01",
      "",
      "-https01",
      "",
      "-tlsalpn01",
      "",
      "-doh",
      "",
      "-defaultIPv4",
      "127.0.0.1",
    ],
    "Starting management server",
  );
  console.log("child: starting Pebble");
  await start(
    PEBBLE,
    ["-config", join(dir, "config.json"), "-dnsserver", "127.0.0.1:8053", "-strict"],
    "ACME directory available",
  );
  console.log("child: starting the registry challenge service");
  const challenge = await startChallengeService({
    port: 8060,
    dnsManagementUrl: "http://127.0.0.1:8055",
  });

  // The box's ACME account key is generated at install and kept in the recovery bundle.
  // Pebble logs that its directory is available slightly before it listens.
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt += 1) {
    try {
      ready = (await fetch("https://127.0.0.1:14000/dir")).ok;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!ready) throw new Error("Pebble's directory never answered");
  const accountKey = await acme.crypto.createPrivateKey();
  const hostname = `${Math.random().toString(36).slice(2, 10)}.boxes.trellis.test`;
  const first = await obtainCertificate({
    directoryUrl: "https://127.0.0.1:14000/dir",
    hostname,
    challengeServiceUrl: challenge.url,
    accountKey,
  });
  const firstCert = new X509Certificate(first.certificate);
  console.log(
    `issued for ${hostname} in ${first.ms} ms: names ${firstCert.subjectAltName}, valid ${firstCert.validFrom} to ${firstCert.validTo}`,
  );

  // Forced renewal, unattended: the same account and challenge path, a new key and certificate.
  const second = await obtainCertificate({
    directoryUrl: "https://127.0.0.1:14000/dir",
    hostname,
    challengeServiceUrl: challenge.url,
    accountKey,
    accountUrl: first.accountUrl,
  });
  const secondCert = new X509Certificate(second.certificate);
  console.log(
    `renewed in ${second.ms} ms: serial ${firstCert.serialNumber} -> ${secondCert.serialNumber}`,
  );
  console.log(
    `challenge service saw: ${challenge.log.map((e) => e.action).join(", ")}; TLS keys differ: ${first.tlsKey.toString() !== second.tlsKey.toString()}`,
  );
  console.log(
    `checks: hostname matches ${secondCert.subjectAltName.includes(hostname)}; new serial ${firstCert.serialNumber !== secondCert.serialNumber}`,
  );
  challenge.server.close();
  stop();
  process.exit(0);
} catch (error) {
  console.error("FAILED", error.stack ?? error.message, error.response?.data ?? "");
  for (const [bin, output] of logs)
    console.error(`--- ${bin} output ---\n${output().slice(-1500)}`);
  stop();
  process.exit(1);
}
