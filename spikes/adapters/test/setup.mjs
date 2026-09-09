import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initializeWasm } from "@automerge/automerge/slim";

const require = createRequire(import.meta.url);
await initializeWasm(await readFile(require.resolve("@automerge/automerge/automerge.wasm")));
