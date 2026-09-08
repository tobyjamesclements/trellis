import { createBoxServer } from "./server";

const port = Number.parseInt(process.env["TRELLIS_PORT"] ?? "8080", 10);
const server = createBoxServer();
server.listen(port, () => {
  console.log(`trellis box listening on http://127.0.0.1:${port}/status`);
});
