import wasmUrl from "@automerge/automerge/automerge.wasm?url";
import { initializeWasm } from "@automerge/automerge/slim";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { initialiseI18n } from "./i18n";
import { registerShell } from "./shell/register";
import "./styles.css";

/**
 * The shell's entry point. The service worker registers first so the shell
 * is cached for offline launches from the first visit; Automerge's WASM
 * module is loaded from the shell's own assets, so it too comes from the
 * cache when the network is gone; and the interface language is settled
 * before anything renders.
 */
const container = document.getElementById("app");
if (container === null) {
  throw new Error("the shell markup has no #app element");
}

registerShell();
await Promise.all([initializeWasm(wasmUrl), initialiseI18n()]);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
