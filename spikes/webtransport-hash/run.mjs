// Spike 1.2: hash-pinned WebTransport. Runs the Node HTTP/3 server and drives
// the bundled Chromium through Playwright, then prints what happened.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { makeCertificate } from "./certs.mjs";
import { startEchoServer } from "./server.mjs";

const HOST = "127.0.0.1";
const PORT = 4433;
const url = `https://${HOST}:${PORT}/echo`;
const results = [];
const record = (name, outcome, expectation) => {
  results.push({ name, ...outcome, expectation });
  console.log(
    `${outcome.ok === expectation ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(outcome)}`,
  );
};

const certA = makeCertificate({ days: 14 });
const echo = await startEchoServer({
  host: HOST,
  port: PORT,
  certPem: certA.certPem,
  keyPem: certA.keyPem,
});

const page = readFileSync(new URL("./page.html", import.meta.url));
const pageServer = createServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(page);
});
await new Promise((resolve) => pageServer.listen(0, HOST, resolve));
const pageUrl = `http://localhost:${pageServer.address().port}/`;

const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.goto(pageUrl);
const version = browser.version();
const connect = (hash, message = "hello box") =>
  tab.evaluate(([u, h, m]) => window.connect(u, h, m), [url, hash, message]);

// The hash of the current certificate lets the page connect to a bare IP address.
record("14-day P-256 certificate, correct hash", await connect(certA.sha256Hex), true);
record("same certificate, second connection", await connect(certA.sha256Hex, "again"), true);
record("no hash at all (self-signed must fail)", await connect(null), false);
record("wrong hash", await connect("00".repeat(32)), false);

// Rotation: the box swaps to the next certificate in its schedule; the device
// must reconnect with the new hash and the old hash must stop working.
const certB = makeCertificate({ days: 14 });
await echo.rotate(certB);
record("after rotation, new hash", await connect(certB.sha256Hex, "rotated"), true);
record("after rotation, old hash", await connect(certA.sha256Hex), false);

// Browsers refuse hash pinning for certificates valid longer than two weeks,
// which is why the schedule is cut in fourteen-day pieces.
const certLong = makeCertificate({ days: 15 });
await echo.rotate(certLong);
record(
  "15-day certificate, correct hash (validity too long)",
  await connect(certLong.sha256Hex),
  false,
);

// Ten connections in a row give a setup-time distribution.
await echo.rotate(certB);
const timings = [];
for (let index = 0; index < 10; index += 1) {
  const outcome = await connect(certB.sha256Hex, `ping ${index}`);
  if (outcome.ok) timings.push(outcome.readyMs);
}
timings.sort((a, b) => a - b);
console.log(
  `ready() latency over ${timings.length} connections: min ${timings[0]}ms, median ${timings[Math.floor(timings.length / 2)]}ms, max ${timings.at(-1)}ms`,
);

await browser.close();
pageServer.close();
await echo.stop();
const failed = results.filter((r) => r.ok !== r.expectation);
console.log(
  `\nChromium ${version}: ${results.length - failed.length}/${results.length} checks as expected`,
);
process.exit(failed.length === 0 ? 0 : 1);
