# Spike 1.10, the software half: ACME DNS-01 through the registry

**Question.** Can the box obtain a certificate for its hostname in the
project zone over ACME with the DNS-01 challenge, answered through an
acme-dns-style challenge service run by the registry, and renew it
unattended? The real certificate authority, the real zone, and the browser
trust check need the rig and a registered hostname; this half proves the
box's client and the challenge service against Pebble, Let's Encrypt's test
CA, with its challenge test DNS server standing in for the zone.

**Method.** `npm install`, then `npm start` with `PEBBLE_BIN` and
`CHALLTESTSRV_BIN` pointing at the two binaries, built with
`go install github.com/letsencrypt/pebble/v2/cmd/pebble@latest` and
`.../cmd/pebble-challtestsrv@latest`. The script starts both, starts the
challenge service (an HTTP endpoint that publishes or clears the
`_acme-challenge` TXT record for a hostname, writing to the test DNS here
and to the zone in production), and runs the box's client twice for a
random hostname under `boxes.trellis.test`: first issuance, then a forced
renewal with the same account and a new key.

## Results (Pebble in strict mode, Node 22)

| Step                                             | Outcome                                  |
| ------------------------------------------------ | ---------------------------------------- |
| Account registration, order, DNS-01 challenge, issuance | certificate for the hostname in 104 ms |
| Challenge service                                | received set, clear, set, clear, and nothing but the hostname and the challenge value |
| Forced renewal, same account, new key            | new serial in 63 ms, no interaction      |
| Private keys                                     | generated on the box, never sent anywhere |

**Findings.**

1. The box's client is `acme-client` with the DNS-01 challenge delegated to
   the registry's endpoint; nothing else is needed, and the registry sees
   only the hostname and the challenge value, as the secure-context spec
   requires of it.
2. **The box must keep its ACME account URL** from install (with the account
   key already in the recovery bundle): a renewal that registers again is
   refused by a strict CA. The design's recovery bundle should carry the
   account URL beside the account key.
3. **The box must not pre-verify the challenge with its own resolver.**
   acme-client checks the TXT record itself before asking the CA; the box's
   resolver cannot see the project zone from behind a school network, so
   that check is skipped and the CA's validation is the one that counts.
4. Pebble logs that its directory is available shortly before it listens;
   the harness polls the directory rather than trusting the log line.

## What the rig still has to answer

- Let's Encrypt itself, over the real project zone, from the Pi (task 1.10
  as written): the registry's zone update path, propagation time, and the
  rate-limit and Public Suffix List questions from the secure-context spec.
- Chrome on Windows loading a page from the Pi's hostname with no warning
  and registering a service worker; Pebble's root is not trusted anywhere.
- Renewal at one third of the remaining lifetime with daily retries, and
  the warnings at 30, 14, and 7 days, as scheduling on the box.
