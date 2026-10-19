"use strict";

const http = require("node:http");

const PORT = Number(process.env.PORT || 10000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port between 1 and 65535.");
}

const healthServer = http.createServer((_request, response) => {
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("FoldBook WhatsApp Worker Active\n");
});

healthServer.on("error", (error) => {
  console.error("HTTP health-check server failed:", error.message);
  process.exitCode = 1;
});
healthServer.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP health-check server listening on port ${PORT}`);
});

require("./worker/worker.js");
