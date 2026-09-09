// The registry's challenge endpoint, acme-dns style: the box asks it to
// publish or clear the DNS-01 TXT record for its hostname. Here it writes to
// Pebble's challenge test DNS server; in production it writes to the
// project zone. It receives only the hostname and the challenge value.
import { createServer } from "node:http";

export function startChallengeService({ port, dnsManagementUrl }) {
  const log = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const { hostname, value } = JSON.parse(body || "{}");
    const record = `_acme-challenge.${hostname}.`;
    if (request.method === "POST" && request.url === "/challenge") {
      await fetch(`${dnsManagementUrl}/set-txt`, {
        method: "POST",
        body: JSON.stringify({ host: record, value }),
      });
      log.push({ action: "set", record });
      response.writeHead(204).end();
    } else if (request.method === "DELETE" && request.url === "/challenge") {
      await fetch(`${dnsManagementUrl}/clear-txt`, {
        method: "POST",
        body: JSON.stringify({ host: record }),
      });
      log.push({ action: "clear", record });
      response.writeHead(204).end();
    } else {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, log, url: `http://127.0.0.1:${port}` }),
    ),
  );
}
