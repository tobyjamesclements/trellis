import { registerSW } from "virtual:pwa-register";
import { useSyncExternalStore } from "react";

/**
 * Service worker registration (distribution: "Installable offline-capable
 * client"). The worker precaches the shell so the application opens with no
 * network. When the box serves a newer shell, the new worker installs in the
 * background and takes over the next time the application is opened: a
 * lesson is never interrupted by an update, and local data is untouched.
 */
export type ShellState = "current" | "offline-ready" | "update-ready";

let state: ShellState = "current";
const listeners = new Set<() => void>();

function setState(next: ShellState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

export function registerShell(): void {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  registerSW({
    immediate: true,
    onOfflineReady: () => setState("offline-ready"),
    onNeedRefresh: () => setState("update-ready"),
    onRegisterError: (error: unknown) => {
      console.warn("shell service worker registration failed", error);
    },
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useShellState(): ShellState {
  return useSyncExternalStore(subscribe, () => state);
}
