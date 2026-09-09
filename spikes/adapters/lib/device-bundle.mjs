// Browser entry for the round-trip test: a repo in the page over either
// transport, with Automerge initialised from the embedded module.
import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64";
import { initializeBase64Wasm } from "@automerge/automerge/slim";
import { Repo } from "@automerge/automerge-repo/slim";
import { WebRtcDeviceAdapter } from "./webrtc-device.mjs";
import { WebTransportDeviceAdapter } from "./webtransport.mjs";

await initializeBase64Wasm(automergeWasmBase64);

window.startDevice = async (kind, options, url) => {
  const adapter =
    kind === "webtransport"
      ? new WebTransportDeviceAdapter({
          url: options.url,
          serverCertificateHashes: options.hashes.map((hex) =>
            Uint8Array.from(hex.match(/../g), (pair) => Number.parseInt(pair, 16)),
          ),
          WebTransport,
        })
      : new WebRtcDeviceAdapter({ params: options.params, RTCPeerConnection });
  const repo = new Repo({ network: [adapter], peerId: `device-${kind}` });
  const started = performance.now();
  const handle = await repo.find(url);
  const doc = handle.doc();
  const foundMs = Math.round(performance.now() - started);
  handle.change((d) => {
    d.device = "edited in the browser";
  });
  await new Promise((resolve) => {
    const check = () => {
      if (handle.doc().box === "seen by the box") resolve();
    };
    handle.on("change", check);
    check();
  });
  return { foundMs, first: doc.box ?? null, final: handle.doc() };
};
