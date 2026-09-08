import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { initializeWasm } from "@automerge/automerge/slim";

// The box runtime: load the Automerge WASM module from the package's own file,
// the same way the single-file box build will embed it.
const require = createRequire(import.meta.url);
await initializeWasm(await readFile(require.resolve("@automerge/automerge/automerge.wasm")));
