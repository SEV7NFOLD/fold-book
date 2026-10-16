"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const servingBuiltSite = process.argv.includes("--built");
const siteRoot = servingBuiltSite ? path.join(projectRoot, "dist") : projectRoot;
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const files = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/assets/brand/mark.svg", "assets/brand/mark.svg"],
  ["/assets/css/styles.css", "assets/css/styles.css"],
  ["/assets/js/app.js", "assets/js/app.js"],
]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a valid TCP port between 1 and 65535.");
  process.exit(1);
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed.");
    return;
  }

  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  const relativePath = files.get(pathname);
  if (!relativePath) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found.");
    return;
  }

  const file = path.join(siteRoot, relativePath);
  fs.readFile(file, (error, content) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 503 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Requested site file is unavailable.");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentTypes.get(path.extname(file)),
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

server.listen(port, host, () => {
  console.log(`Fold Book ${servingBuiltSite ? "production preview" : "development preview"} running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(`The preview server could not start: ${error.message}`);
  process.exitCode = 1;
});
