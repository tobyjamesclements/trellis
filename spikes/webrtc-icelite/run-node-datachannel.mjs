// Spike 1.5 with node-datachannel (libdatachannel/libjuice): can the other
// candidate library play the ICE-lite box? It offers no ICE-lite mode and no
// static ICE credentials, so the parameters below are whatever it generated
// for this one session; a QR could never carry them. The run records what a
// browser gets when it builds the answer from them anyway.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { PeerConnection } from "node-datachannel";
import { chromium } from "playwright";

const HOST = "127.0.0.1";
const PORT = 5006;
const PLACEHOLDER_OFFER = [
  "v=0",
  "o=- 0 0 IN IP4 0.0.0.0",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=msid-semantic: WMS",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:unknown",
  "a=ice-pwd:unknownunknownunknownunknown",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00",
  "a=setup:active",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

const options = {
  iceServers: [],
  bindAddress: HOST,
  portRangeBegin: PORT,
  portRangeEnd: PORT,
  disableFingerprintVerification: true,
  disableAutoNegotiation: true,
};
console.log("node-datachannel options accepted:", JSON.stringify(options));
const pc = new PeerConnection("box", options);
const events = [];
pc.onStateChange((state) => events.push(`state ${state}`));
pc.onIceStateChange((state) => events.push(`ice ${state}`));
pc.onGatheringStateChange((state) => events.push(`gathering ${state}`));
let channelOpened = false;
pc.onDataChannel((dc) => {
  events.push(`datachannel ${dc.getLabel()}`);
  dc.onMessage((message) => {
    channelOpened = true;
    dc.sendMessage(`box heard: ${message}`);
  });
});
pc.setRemoteDescription(PLACEHOLDER_OFFER, "offer");
pc.setLocalDescription();
await new Promise((resolve) => setTimeout(resolve, 500));
const sdp = pc.localDescription().sdp;
const candidate = /a=candidate:\S+ 1 UDP \d+ (\S+) (\d+) typ host/i.exec(sdp);
const params = {
  host: candidate ? candidate[1] : HOST,
  port: candidate ? Number(candidate[2]) : PORT,
  ufrag: /a=ice-ufrag:(\S+)/.exec(sdp)[1],
  pwd: /a=ice-pwd:(\S+)/.exec(sdp)[1],
  fingerprint: /a=fingerprint:sha-256 (\S+)/.exec(sdp)[1],
  setup: /a=setup:(\S+)/.exec(sdp)[1],
  iceLite: sdp.includes("a=ice-lite"),
};
console.log("what this session would need the QR to carry:", JSON.stringify(params));

const page = readFileSync(new URL("./page.html", import.meta.url));
const pageServer = createServer((_q, r) => {
  r.setHeader("content-type", "text/html");
  r.end(page);
});
await new Promise((resolve) => pageServer.listen(0, HOST, resolve));
const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.goto(`http://localhost:${pageServer.address().port}/`);
const outcome = await tab.evaluate(([p]) => window.connect(p, 8000), [params]);
console.log(
  "browser outcome:",
  JSON.stringify({
    ok: outcome.ok,
    error: outcome.error,
    states: outcome.states,
    received: outcome.received,
  }),
);
console.log("box events:", events.join(" | "), "| channel used:", channelOpened);
await browser.close();
pageServer.close();
pc.close();
setTimeout(() => process.exit(0), 200);
