import { createServer, type Server } from "node:http";

/**
 * Placeholder box server for the walking skeleton scaffold.
 *
 * Task 2.4 replaces this with the single-file build serving the embedded
 * shell over HTTPS on the box's own hostname, with the storage adapter and
 * document cache. Until then the box answers a status probe so the package
 * has something to build, run, and test end to end.
 */
export interface BoxStatus {
  readonly name: "trellis-box";
  readonly version: string;
}

export const BOX_VERSION = "0.0.0";

export function boxStatus(): BoxStatus {
  return { name: "trellis-box", version: BOX_VERSION };
}

export function createBoxServer(): Server {
  return createServer((request, response) => {
    if (request.url === "/status") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(boxStatus()));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  });
}
