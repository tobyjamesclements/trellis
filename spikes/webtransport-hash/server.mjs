// A minimal WebTransport echo server on Node, the box runtime, via
// @fails-components/webtransport (HTTP/3 over quiche). Every bidirectional
// stream is read to its end and echoed back.
import { Http3Server, quicheLoaded } from "@fails-components/webtransport";

export async function startEchoServer({ host, port, certPem, keyPem }) {
  await quicheLoaded;
  let server = await listen({ host, port, certPem, keyPem });
  return {
    /**
     * Rotation restarts the listener: `Http3Server.updateCert` is a no-op on
     * the quiche transport (tried first; connections kept using the old
     * certificate), so the box swaps certificates by stopping and starting
     * the HTTP/3 listener, which takes well under a second.
     */
    async rotate(next) {
      server.stopServer();
      await new Promise((resolve) => setTimeout(resolve, 200));
      server = await listen({ host, port, certPem: next.certPem, keyPem: next.keyPem });
    },
    async stop() {
      server.stopServer();
    },
  };
}

async function listen({ host, port, certPem, keyPem }) {
  const server = new Http3Server({
    host,
    port,
    secret: "trellis-spike",
    cert: certPem,
    privKey: keyPem,
  });
  server.startServer();
  await server.ready;
  const sessions = server.sessionStream("/echo").getReader();
  (async () => {
    for (;;) {
      const { done, value: session } = await sessions.read();
      if (done) return;
      handleSession(session).catch(() => {});
    }
  })();
  return server;
}

async function handleSession(session) {
  await session.ready;
  const streams = session.incomingBidirectionalStreams.getReader();
  for (;;) {
    const { done, value: stream } = await streams.read();
    if (done) return;
    echo(stream).catch(() => {});
  }
}

async function echo(stream) {
  const reader = stream.readable.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const writer = stream.writable.getWriter();
  for (const chunk of chunks) {
    await writer.write(chunk);
  }
  await writer.close();
}
