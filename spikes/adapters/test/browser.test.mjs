import { createServer } from "node:http";
import { Repo } from "@automerge/automerge-repo/slim";
import { Http3Server, quicheLoaded } from "@fails-components/webtransport";
import { build } from "esbuild";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeCertificate } from "../lib/certs.mjs";
import { makeBoxKeys, WebRtcBoxAdapter } from "../lib/webrtc.mjs";
import { WebTransportBoxAdapter } from "../lib/webtransport.mjs";
import "./setup.mjs";

// A document created on the box, found and edited in Chromium, and edited
// back on the box, over each transport in turn.
const HOST = "127.0.0.1";
let browser;
let pageServer;
let pageUrl;

beforeAll(async () => {
  const bundle = await build({
    entryPoints: [new URL("../lib/device-bundle.mjs", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
    logLevel: "silent",
  });
  const page = `<!doctype html><title>round trip</title><script type="module">${bundle.outputFiles[0].text}</script><p>device</p>`;
  pageServer = createServer((_q, r) => {
    r.setHeader("content-type", "text/html");
    r.end(page);
  });
  await new Promise((resolve) => pageServer.listen(0, HOST, resolve));
  pageUrl = `http://localhost:${pageServer.address().port}/`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  pageServer?.close();
});

async function roundTrip(kind, boxAdapter, options) {
  const boxRepo = new Repo({ network: [boxAdapter], peerId: "box" });
  const handle = boxRepo.create({ box: "created on the box" });
  const tab = await browser.newPage();
  tab.on("pageerror", (error) => console.log(`page error: ${error.message}`));
  tab.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      console.log(`page ${message.type()}: ${message.text()}`);
  });
  await tab.goto(pageUrl);
  await tab.waitForFunction(() => typeof window.startDevice === "function", null, {
    timeout: 15_000,
  });
  const deviceEdit = new Promise((resolve) => {
    handle.on("change", ({ doc }) => {
      if (doc.device === "edited in the browser") resolve();
    });
  });
  const result = tab.evaluate(
    ([k, o, url]) => window.startDevice(k, o, url),
    [kind, options, handle.url],
  );
  await deviceEdit;
  handle.change((d) => {
    d.box = "seen by the box";
  });
  const outcome = await result;
  await tab.close();
  expect(outcome.first).toBe("created on the box");
  expect(outcome.final).toMatchObject({ box: "seen by the box", device: "edited in the browser" });
  expect(handle.doc().device).toBe("edited in the browser");
  return outcome.foundMs;
}

describe("a document round trip between Chromium and the box", () => {
  it("over hash-pinned WebTransport", async () => {
    await quicheLoaded;
    const cert = makeCertificate({ host: HOST });
    const server = new Http3Server({
      host: HOST,
      port: 4711,
      secret: "spike",
      cert: cert.certPem,
      privKey: cert.keyPem,
    });
    server.startServer();
    await server.ready;
    const box = new WebTransportBoxAdapter({ server });
    const hex = [...cert.sha256].map((b) => b.toString(16).padStart(2, "0")).join("");
    const foundMs = await roundTrip("webtransport", box, {
      url: `https://${HOST}:4711/sync`,
      hashes: [hex],
    });
    console.log(`webtransport: document found in the browser after ${foundMs} ms`);
    box.close();
    server.stopServer();
  });

  it("over signalling-free WebRTC", async () => {
    const box = new WebRtcBoxAdapter({
      host: HOST,
      ports: [5200],
      keys: makeBoxKeys(),
      ufrag: "trellisbox",
      pwd: "trellis-static-ice-password-for-the-spike",
    });
    await box.ready;
    const foundMs = await roundTrip("webrtc", box, { params: box.paramsFor(5200) });
    console.log(`webrtc: document found in the browser after ${foundMs} ms`);
    box.close();
  });
});
