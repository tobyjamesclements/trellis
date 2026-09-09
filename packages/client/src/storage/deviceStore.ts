import { Repo } from "@automerge/automerge-repo/slim";
import { IndexedDBStorageAdapter } from "@automerge/automerge-repo-storage-indexeddb";

/**
 * The device's document store: automerge-repo over IndexedDB, one database
 * per site (secure-context-provisioning: "A device SHALL partition its stored
 * data by site identifier"). No network adapter is attached yet, and the
 * share policy refuses everything, until the authenticated LAN transport of
 * task 2.5 and the join flow of task 2.9 arrive.
 */
export function storeNameFor(siteId: string): string {
  return `trellis-${siteId}`;
}

/**
 * Until a device is admitted, the only site identity it has is the hostname
 * that served the shell. Admission replaces this with the site key
 * fingerprint delivered in the class code's QR form.
 */
export function provisionalSiteId(): string {
  return location.hostname;
}

export function openDeviceStore(siteId: string): Repo {
  return new Repo({
    storage: new IndexedDBStorageAdapter(storeNameFor(siteId)),
    network: [],
    sharePolicy: async () => false,
  });
}
