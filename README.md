# Trellis

An offline-first, LAN-local classroom platform built on Automerge. A school
buys a box and site licences for content packs; a teacher names a class, gets
a URL and a code, adds packs and their own files, and presses start; students
join by code and take loaned laptops home offline. Data stays on the box.

The specification lives in `openspec/`. Read `openspec/changes/define-offline-classroom-platform/`
for the proposal, design, specs, and delivery tasks of the first release.

## Repository layout

| Package                | What it is                                                                  |
| ---------------------- | --------------------------------------------------------------------------- |
| `packages/core`        | Shared core: operation DSL, fold, share policy, crypto. Identical on every peer. |
| `packages/transports`  | LAN transports authenticated by the site key, each an automerge-repo adapter. |
| `packages/box`         | The box: site key holder, stock room, directory, and sync hub for one site.  |
| `packages/client`      | The installable web application shell that runs on every device.             |

## Working on it

Requires Node 22 or later and pnpm (the version is pinned in `package.json`;
`corepack enable` picks it up).

```sh
pnpm install
pnpm check          # lint, typecheck, build, test: what CI runs
pnpm lint:fix       # apply Biome fixes and formatting
pnpm test:watch     # vitest in watch mode
```

Tests run under Node and again inside headless Chromium for the shared core,
so code meant for both the box and the browser is exercised in both. The
Chromium build comes from `pnpm exec playwright install chromium`.
