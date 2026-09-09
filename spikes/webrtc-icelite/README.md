# Spike 1.5: signalling-free WebRTC to an ICE-lite box

**Question.** Can a browser open a WebRTC data channel to the box with no
signalling server, from parameters the box published once (its LAN address
and port, static ICE credentials, the fingerprint of a long-lived DTLS
certificate, and its DTLS role), the way the class code's QR form would
carry them? Both candidate libraries for the box side were tried.

**Method.** `node run.mjs` starts the box with werift, prints the parameters
a QR would carry, and drives the bundled Chromium with Playwright: the page
creates its own offer, synthesises the box's answer from the parameters
(`a=ice-lite`, the static credentials, the fingerprint, one host candidate),
and opens a data channel. `node run-node-datachannel.mjs` repeats the attempt
with node-datachannel. `node debug.mjs` runs one session with werift's own
logging (`DEBUG=werift*`) and the browser's candidate-pair statistics.

## Results (Chromium 141.0.7390.37, Node 22, x86_64 container, loopback)

| Check                                                       | Outcome |
| ----------------------------------------------------------- | ------- |
| Correct parameters, first device                            | data channel open 123 ms after `setRemoteDescription`; messages both ways |
| Second device after the first left                          | opens (fresh box connection on the same port) |
| Wrong box fingerprint in the device's parameters            | refused by the device: DTLS verification fails, connection state `failed` |
| Wrong ICE password in the device's parameters               | refused: the box answers no check, the device stays in `checking` |
| Five timing runs                                            | open after 68, 68, 72, 78, 79 ms (median 72 ms) |
| Box learns the device's DTLS fingerprint                    | yes, matches the browser's local certificate every time |
| node-datachannel as the box                                 | no ICE-lite mode, no static credentials: the parameters change every session and the browser never leaves `checking` |

**werift can be the box.** It has an ICE-lite mode, answers checks from
any peer whose request validates against the box's password, learns the
device's address as a peer-reflexive candidate, and, as a lite agent, sends
no consent checks (so it never needs the device's ICE password, which it
cannot know). Four things had to be done by hand in `box.mjs`, each a small
upstream ask rather than a design problem:

1. **Static ICE credentials** are set on the ICE connection object before
   answering; there is no configuration option.
2. **Accepting an unknown device certificate.** werift insists on verifying
   the remote fingerprint against the SDP. The box cannot know it in
   advance, so the spike records the fingerprint instead; the device then
   proves its device key at the application layer and that proof binds the
   fingerprint (design decision D12's "app-layer device auth").
3. **The DTLS role.** werift always answers as the active side, and as a DTLS
   client with an ECDSA key it fails to pick a signature scheme against
   Chromium. The box must be passive anyway; rewriting `a=setup` in the local
   answer before applying it is honoured.
4. **One fixed port.** werift needs a port range wider than one; the QR
   carries the port it chose. It also skips loopback when gathering and does
   not bind the container's interface address in a way Chromium could reach,
   so the address to advertise is passed in explicitly.

Its key material wants werift's own enums (`HashAlgorithm.sha256_4`,
`SignatureAlgorithm.ecdsa_3`), which cost an hour to find.

**node-datachannel cannot be the box.** libjuice has no ICE-lite mode and
node-datachannel exposes no way to fix the ICE credentials, so a QR could
never carry them; as a full agent it would also need the device's ICE
password to run its own checks. Its `disableFingerprintVerification` option
does cover point 2 above, and it stays the better library for a full agent.

**What the design gets from this.** The transport in D12's second row is
real on Chromium: no signalling, no certificate authority, the device
authenticates the box by fingerprint and the box authenticates the device
afterwards by its device key. Setup is well under a second.

**Still to build, not in doubt.** One werift connection serves one device on
one port. A box serving a classroom needs a UDP front that hands each new
source address to its own werift connection; werift's ICE transport is
pluggable, so this is engineering, not research.

## What the rig still has to answer

- Edge on the Windows laptops (Chromium, expected to match), and Firefox and
  Safari (task 1.5 names all four): neither is available here. Firefox's
  handling of an ICE-lite peer and Safari's are the open items; the design's
  reason for WebRTC is Safari.
- Wi-Fi rather than loopback, for the timing numbers.
