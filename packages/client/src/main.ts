import { base64urlEncode } from "@trellis/core";

/**
 * Placeholder entry point for the walking skeleton scaffold.
 *
 * Task 2.6 turns this into the installable shell with its service worker,
 * IndexedDB storage adapter, persistent storage request, and English and
 * Spanish strings. Until then it proves that the client bundles the shared
 * core for the browser.
 */
const app = document.getElementById("app");
if (app) {
  const heading = document.createElement("h1");
  heading.textContent = "Trellis";
  const detail = document.createElement("p");
  detail.textContent = `core loaded: ${base64urlEncode(new TextEncoder().encode("trellis"))}`;
  app.append(heading, detail);
}
