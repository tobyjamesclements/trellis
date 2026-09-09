import { runNetworkAdapterTests } from "@automerge/automerge-repo/helpers/tests/network-adapter-tests.js";
import { RTCPeerConnection } from "werift";
import { makeBoxKeys, WebRtcBoxAdapter, WebRtcDeviceAdapter } from "../lib/webrtc.mjs";
import "./setup.mjs";

// All three peers in Node: the werift ICE-lite box on two ports, and two
// device adapters running werift as full agents from the box's parameters.
const HOST = "127.0.0.1";
const keys = makeBoxKeys();
let base = 5100;

runNetworkAdapterTests(async () => {
  base += 10;
  const box = new WebRtcBoxAdapter({
    host: HOST,
    ports: [base, base + 2],
    keys,
    ufrag: "trellisbox",
    pwd: "trellis-static-ice-password-for-the-spike",
    readyWhen: "first-peer",
  });
  await box.ready;
  const devices = [base, base + 2].map(
    (port) => new WebRtcDeviceAdapter({ params: box.paramsFor(port), RTCPeerConnection }),
  );
  return {
    adapters: [box, devices[0], devices[1]],
    teardown: () => {
      for (const adapter of devices) adapter.disconnect();
      box.close();
    },
  };
}, "signalling-free WebRTC");
