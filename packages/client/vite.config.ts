import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The new worker waits until the application is next opened; nothing
      // reloads under a teacher mid-lesson.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/*.png"],
      manifest: {
        name: "Trellis",
        short_name: "Trellis",
        description: "Offline-first classroom platform",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#fbfaf7",
        theme_color: "#1f6f5f",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Everything the shell needs offline, including the Automerge WASM
        // module and the language catalogues.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm,json,webmanifest}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: false,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: [
      // Everything goes through the slim entries; main.tsx loads the WASM once.
      { find: /^@automerge\/automerge$/, replacement: "@automerge/automerge/slim" },
      { find: /^@automerge\/automerge-repo$/, replacement: "@automerge/automerge-repo/slim" },
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
    host: "127.0.0.1",
  },
});
