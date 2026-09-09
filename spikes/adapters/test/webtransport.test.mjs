import { runNetworkAdapterTests } from "@automerge/automerge-repo/helpers/tests/network-adapter-tests.js";
import { Http3Server, quicheLoaded, WebTransport } from "@fails-components/webtransport";
import { makeCertificate } from "../lib/certs.mjs";
import { WebTransportBoxAdapter, WebTransportDeviceAdapter } from "../lib/webtransport.mjs";
import "./setup.mjs";

// The acceptance suite runs all three peers in Node: the box adapter over the
// HTTP/3 server, and two device adapters using the Node WebTransport client
// with the same certificate hash a browser would hold.
const HOST = "127.0.0.1";
let port = 4500;

runNetworkAdapterTests(async () => {
  await quicheLoaded;
  port += 1;
  const cert = makeCertificate({ host: HOST });
  const server = new Http3Server({
    host: HOST,
    port,
    secret: "spike",
    cert: cert.certPem,
    privKey: cert.keyPem,
  });
  server.startServer();
  await server.ready;
  const box = new WebTransportBoxAdapter({ server });
  const device = () =>
    new WebTransportDeviceAdapter({
      url: `https://${HOST}:${port}/sync`,
      serverCertificateHashes: [cert.sha256],
      WebTransport,
    });
  const devices = [device(), device()];
  return {
    adapters: [box, devices[0], devices[1]],
    teardown: () => {
      for (const adapter of devices) adapter.disconnect();
      box.close();
      server.stopServer();
    },
  };
}, "hash-pinned WebTransport");
