import { NetworkAdapter } from "@automerge/automerge-repo/slim";

/** Shared readiness plumbing for the spike adapters. */
export class SpikeAdapter extends NetworkAdapter {
  #ready = false;
  #resolveReady;
  #readyPromise = new Promise((resolve) => {
    this.#resolveReady = resolve;
  });

  isReady() {
    return this.#ready;
  }

  whenReady() {
    return this.#readyPromise;
  }

  markReady() {
    if (!this.#ready) {
      this.#ready = true;
      this.#resolveReady();
      this.emit("ready", { network: this });
    }
  }
}
