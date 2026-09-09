import { RTCPeerConnection } from "werift";
import { makeBoxKeys, WebRtcBoxAdapter, WebRtcDeviceAdapter } from "./lib/webrtc.mjs";

const t0 = Date.now();
const log = (m) => console.log(`${String(Date.now() - t0).padStart(5)} ms  ${m}`);
const box = new WebRtcBoxAdapter({
  host: "127.0.0.1",
  ports: [5300],
  keys: makeBoxKeys(),
  ufrag: "trellisbox",
  pwd: "trellis-static-ice-password-for-the-spike",
});
await box.ready;
const device = new WebRtcDeviceAdapter({ params: box.paramsFor(5300), RTCPeerConnection });
box.on("peer-candidate", (p) => log(`box sees ${p.peerId}`));
box.on("peer-disconnected", (p) => log(`box lost ${p.peerId}`));
device.on("peer-candidate", (p) => log(`device sees ${p.peerId}`));
device.on("peer-disconnected", (p) => log(`device lost ${p.peerId}`));
box.connect("box", {});
device.connect("dev", {});
await new Promise((r) => setTimeout(r, 1500));
log("box.disconnect()");
box.disconnect();
await new Promise((r) => setTimeout(r, 2500));
log("box.connect() again");
box.connect("box", {});
await new Promise((r) => setTimeout(r, 6000));
log("done");
device.disconnect();
box.close();
setTimeout(() => process.exit(0), 300);
