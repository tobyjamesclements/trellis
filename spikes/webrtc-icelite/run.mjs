// Spike 1.5 driver: starts the werift box, serves the device page, and
// drives the bundled Chromium through Playwright.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { startBox } from "./box.mjs";
import { makeDtlsKeys } from "./keys.mjs";

const HOST = "127.0.0.1";
const PORT = 5004;
const UFRAG = "trellisbox";
const PWD = "trellis-static-ice-password-for-the-spike";
const keys = makeDtlsKeys();

const page = readFileSync(new URL("./page.html", import.meta.url));
const pageServer = createServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(page);
});
await new Promise((resolve) => pageServer.listen(0, HOST, resolve));
const browser = await chromium.launch();
const results = [];
const record = (name, outcome, expectation) => {
  results.push({ name, ok: outcome.ok, expectation });
  console.log(
    `${outcome.ok === expectation ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(outcome)}`,
  );
};

async function device(params, timeoutMs) {
  const tab = await browser.newPage();
  await tab.goto(`http://localhost:${pageServer.address().port}/`);
  const outcome = await tab.evaluate(([p, t]) => window.connect(p, t), [params, timeoutMs]);
  await tab.close();
  return outcome;
}

async function session(name, mutate, expectation, timeoutMs = 8000) {
  const box = await startBox({ host: HOST, port: PORT, keys, ufrag: UFRAG, pwd: PWD });
  const params = mutate({ ...box.params });
  const reply = box.channel.then((dc) => {
    dc.onMessage.subscribe((message) => {
      dc.send(`box heard: ${message.toString()}`);
    });
  });
  const outcome = await device(params, timeoutMs);
  await Promise.race([reply, new Promise((resolve) => setTimeout(resolve, 10))]);
  const peer = box.peerFingerprint();
  record(
    name,
    {
      ...outcome,
      boxSawPeerFingerprint: peer
        ? peer.toUpperCase() === (outcome.localFingerprint ?? "").toUpperCase()
        : false,
    },
    expectation,
  );
  if (name.startsWith("correct"))
    console.log(`      box events: ${box.events.map((e) => e.event).join(" | ")}`);
  box.close();
  await new Promise((resolve) => setTimeout(resolve, 200));
  return outcome;
}

console.log(
  `box parameters (what the QR would carry): ${JSON.stringify(
    await (async () => {
      const b = await startBox({ host: HOST, port: PORT, keys, ufrag: UFRAG, pwd: PWD });
      const p = b.params;
      b.close();
      await new Promise((r) => setTimeout(r, 200));
      return p;
    })(),
  )}`,
);

await session("correct parameters, first device", (p) => p, true);
await session("correct parameters, second device after the first left", (p) => p, true);
await session(
  "wrong box fingerprint in the device's parameters",
  (p) => ({ ...p, fingerprint: p.fingerprint.replace(/^../, (h) => (h === "00" ? "11" : "00")) }),
  false,
);
await session(
  "wrong ICE password in the device's parameters",
  (p) => ({ ...p, pwd: `${p.pwd}-wrong` }),
  false,
  6000,
);

const timings = [];
for (let index = 0; index < 5; index += 1) {
  const outcome = await session(`timing run ${index + 1}`, (p) => p, true);
  if (outcome.ok) timings.push(outcome.setupMs);
}
timings.sort((a, b) => a - b);
console.log(
  `\ndata channel open after setRemoteDescription over ${timings.length} runs: min ${timings[0]} ms, median ${timings[Math.floor(timings.length / 2)]} ms, max ${timings.at(-1)} ms`,
);

await browser.close();
pageServer.close();
const failed = results.filter((r) => r.ok !== r.expectation);
console.log(
  `Chromium ${browser.version()}: ${results.length - failed.length}/${results.length} checks as expected`,
);
process.exit(failed.length === 0 ? 0 : 1);
