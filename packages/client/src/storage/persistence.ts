/**
 * Persistent storage (storage-lifecycle: "Persistent storage on devices").
 * The device asks the browser to protect its storage from eviction on first
 * run and reports the outcome; the report to the box at each contact arrives
 * with sync. When the browser declines, the shell warns the user.
 */
export interface StorageState {
  readonly supported: boolean;
  readonly persistent: boolean;
  readonly quota?: number;
  readonly usage?: number;
}

export async function requestPersistentStorage(): Promise<StorageState> {
  const storage = navigator.storage;
  if (storage === undefined || typeof storage.persist !== "function") {
    return { supported: false, persistent: false };
  }
  const persistent = (await storage.persisted()) || (await storage.persist());
  const estimate = typeof storage.estimate === "function" ? await storage.estimate() : {};
  return {
    supported: true,
    persistent,
    ...(estimate.quota !== undefined ? { quota: estimate.quota } : {}),
    ...(estimate.usage !== undefined ? { usage: estimate.usage } : {}),
  };
}
