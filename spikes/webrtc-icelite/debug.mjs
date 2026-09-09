import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { startBox } from "./box.mjs";
import { makeDtlsKeys } from "./keys.mjs";

const HOST = process.env.BOX_HOST ?? "127.0.0.1";
const keys = makeDtlsKeys();
const page = readFileSync(new URL("./page.html", import.meta.url), "utf8")
  .replace(
    "resolve({ ...outcome, states,",
    "pc.getStats().then((stats) => { const pairs = []; stats.forEach((s) => { if (s.type === 'candidate-pair' || s.type === 'remote-candidate' || s.type === 'local-candidate') pairs.push(s); }); resolve({ ...outcome, states, pairs,",
  )
  .replace(
    'localFingerprint: /a=fingerprint:sha-256 (\\S+)/.exec(pc.localDescription?.sdp ?? "")?.[1] });',
    'localFingerprint: /a=fingerprint:sha-256 (\\S+)/.exec(pc.localDescription?.sdp ?? "")?.[1] }); });',
  );
const pageServer = createServer((_q, r) => {
  r.setHeader("content-type", "text/html");
  r.end(page);
});
await new Promise((resolve) => pageServer.listen(0, "127.0.0.1", resolve));
const box = await startBox({
  host: HOST,
  port: 5004,
  keys,
  ufrag: "trellisbox",
  pwd: "trellis-static-ice-password-for-the-spike",
});
console.log("params", JSON.stringify(box.params));
box.channel.then((dc) => dc.onMessage.subscribe((m) => dc.send(`box heard: ${m}`)));
const browser = await chromium.launch();
const tab = await browser.newPage();
await tab.goto(`http://localhost:${pageServer.address().port}/`);
const outcome = await tab.evaluate(([p]) => window.connect(p, 5000), [box.params]);
console.log(
  "outcome",
  JSON.stringify({
    ok: outcome.ok,
    error: outcome.error,
    states: outcome.states,
    setupMs: outcome.setupMs,
  }),
);
for (const s of outcome.pairs ?? []) {
  if (s.type === "candidate-pair")
    console.log(
      "pair",
      JSON.stringify({
        state: s.state,
        nominated: s.nominated,
        requestsSent: s.requestsSent,
        responsesReceived: s.responsesReceived,
        requestsReceived: s.requestsReceived,
        responsesSent: s.responsesSent,
        bytesSent: s.bytesSent,
        bytesReceived: s.bytesReceived,
      }),
    );
  else
    console.log(
      s.type,
      JSON.stringify({
        address: s.address,
        port: s.port,
        candidateType: s.candidateType,
        protocol: s.protocol,
      }),
    );
}
console.log("box events", box.events.map((e) => e.event).join(" | "));
await browser.close();
box.close();
pageServer.close();
setTimeout(() => process.exit(0), 300);
