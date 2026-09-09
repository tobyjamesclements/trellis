# Phase 1 spikes

Each directory is one spike from `openspec/changes/define-offline-classroom-platform/tasks.md`,
with its own dependencies (`npm install` inside it; the spikes are not part of
the pnpm workspace so the product's install stays lean) and a README that
records the question, the method, the results, and what the hardware rig
still has to answer. Nothing here is product code: task 2.5 builds the real
transports from what these found.

| Spike | Directory | Status |
| ----- | --------- | ------ |
| 1.2 hash-pinned WebTransport | `webtransport-hash/` | passed on Chromium; rig checks remain |
| 1.5 signalling-free WebRTC | `webrtc-icelite/` | passed on Chromium with werift; Firefox and Safari remain |
| 1.6 automerge-repo adapters | `adapters/` | both transports pass the adapter acceptance suite and a Chromium round trip |
| 1.7 box capacity | `capacity/` | measured on x86; the Pi numbers remain |
| 1.10 certificate path | `acme-dns01/` | box client and challenge service pass against Pebble; the real CA, zone, and browser trust remain |

The rig-only spikes (1.1, 1.3, 1.4, 1.8, 1.9) and the real half of 1.10
need the Raspberry Pi, the laptops, the phone, the smart plug, Firefox, and a
DNS zone; they are not attempted here.
