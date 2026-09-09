# Spike 1.2: hash-pinned WebTransport

**Question.** Can a page served from a secure origin open a WebTransport
session to the box's bare LAN address, authenticated by a site-signed schedule
of certificate hashes rather than by the web PKI, and survive certificate
rotation?

**Method.** `node run.mjs` starts an HTTP/3 echo server on Node through
`@fails-components/webtransport` (quiche), with a fresh ECDSA P-256 self-signed
certificate, then drives the bundled Chromium with Playwright from a page on
`http://localhost` (a secure context) to `https://127.0.0.1:4433/echo` using
`serverCertificateHashes`.

## Results (Chromium 141.0.7390.37, Node 22, x86_64 container)

| Check                                              | Outcome                                  |
| -------------------------------------------------- | ---------------------------------------- |
| 14-day P-256 certificate, correct hash             | connects; `ready()` in 7 to 16 ms; echo OK |
| No hash (plain self-signed)                        | refused, as required                     |
| Wrong hash                                         | refused                                  |
| Rotate to a new certificate, new hash              | connects                                 |
| After rotation, old hash                           | refused                                  |
| 15-day certificate, correct hash                   | refused: browsers cap pinned certificates at fourteen days |
| Ten connections in a row                           | `ready()` min 57 ms, median 82 ms, max 116 ms |

**Findings.**

1. Hash pinning works exactly as design decision D12 assumes: a bare IP
   address, no hostname, no CA, the hash from the schedule is enough.
2. The fourteen-day cap is enforced by the browser, so the schedule must be
   cut in pieces of at most fourteen days (the design already says so).
3. `Http3Server.updateCert` is a no-op on the quiche transport: connections
   kept using the old certificate. Rotation therefore restarts the listener,
   which took under a second here and only affects sessions in flight, which
   reconnect with the new hash.
4. Node has no HTTP/3 of its own; this native addon (prebuilt for Linux x64
   and arm64) is the only Node route. It loaded and served without a build
   step. Bun and Node single-executable packaging of a native addon is a
   question for task 1.11 and open question 7.

## What the rig still has to answer

- Chrome and Edge on the Windows laptops against the Pi's LAN address, with
  the page served from the box's real hostname over a valid certificate
  (task 1.2 as written).
- Local Network Access on Chrome 147 and later, when a public-origin page
  connects to a private address (task 1.3); this Chromium is 141.
- Firefox (task 1.4): no Firefox build is available in this environment.
