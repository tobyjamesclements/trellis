import { automergeWasmBase64 } from "@automerge/automerge/automerge.wasm.base64";
import { initializeBase64Wasm } from "@automerge/automerge/slim";

// The device runtime: initialise Automerge from the embedded module, as the
// shell's assets will.
await initializeBase64Wasm(automergeWasmBase64);
