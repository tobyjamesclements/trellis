# Spike 1.6: the transports as automerge-repo network adapters

**Question.** Do the two transports that passed spikes 1.2 and 1.5 work as
automerge-repo network adapters with no change to the sync protocol: does
each pass automerge-repo's own adapter acceptance suite, and does a document
edited in the browser reach the box and come back?

**Method.** `npm install && npm test` runs three vitest files:

- `test/webtransport.test.mjs`: the acceptance suite with the box adapter over
  the Node HTTP/3 server and two device adapters using the Node WebTransport
  client with the certificate hash a browser would hold.
- `test/webrtc.test.mjs`: the acceptance suite with the werift ICE-lite box
  on two ports and two device adapters running werift as full agents from
  the box's published parameters.
- `test/browser.test.mjs`: a document created on the box, found and edited in
  the bundled Chromium through each device adapter, and edited back on the
  box.

The adapters reuse the join and peer handshake of automerge-repo's WebSocket
adapters, so a Repo sees a peer exactly as it would over a WebSocket. Frames
over WebTransport streams are length-prefixed CBOR; data channel messages
carry CBOR directly.

## Results (Chromium 141, Node 22, x86_64 container, loopback)

| Check                                            | WebTransport | WebRTC |
| ------------------------------------------------ | ------------ | ------ |
| Acceptance suite (7 tests: two- and three-way sync, broadcast, peer metadata, disconnect, no send after disconnect, reconnect) | 7 of 7 | 7 of 7 |
| Chromium round trip: box creates, browser finds and edits, box edits back | document found after 79 ms | found after 178 ms |

**Findings.**

1. Nothing in the sync protocol had to change. Both adapters are a transport
   plus the existing handshake, as design decision D2 intended.
2. **Reconnection is the device's job.** The suite expects a device to come
   back on its own after the box drops it or restarts; both device adapters
   retry with a short back-off, and the box adapters queue joins that arrive
   before the box has a peer identity.
3. **A WebRTC box must close the data channel before the connection.** A
   device notices the channel's stream reset within milliseconds; closing
   the werift connection alone tells it nothing, and because the box keeps
   the same static credentials when it listens again, the old device's
   consent checks would keep succeeding indefinitely.
4. **werift as a device needs STUN switched off.** With no STUN server
   configured it falls back to a public one and waits five seconds for it
   before checking anything. On the box's LAN no device needs STUN; Chromium
   with an empty server list connects in about 70 ms.
5. **Readiness.** automerge-repo asks peers for a document 50 ms after a
   repo is created; the box adapter can be told to report ready only once
   it has a peer, which the suite needs and the product does not.

**Still to build for task 2.5.** The site-key proof and device
challenge-response before any sync; refusal of non-box peers on devices;
one WebRTC listener per port becoming a UDP front that gives each source
address its own werift connection; chunking of data channel messages above
the 256 KiB limit for large sync messages; and the WebTransport adapters
bundled into the box binary with the native HTTP/3 addon.

## What the rig still has to answer

- The same round trip from the Windows laptops to the Pi over Wi-Fi, with
  the shell served from the box's hostname (the "on the Pi and back" half of
  task 1.6).
- Firefox and Safari as devices over each transport (tasks 1.4 and 1.5).
