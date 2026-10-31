"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const drEcoHandler = require("../api/dr-eco.js");
const geminiLiveTokenHandler = require("../api/gemini/live-token.js");
const adminApiRouter = require("../api/admin.js");
const studentAuthHandler = require("../api/student/auth.js");
const studentLearningProfileHandler = require("../api/student/learning-profile.js");
const courseCatalogHandler = require("../api/course-catalog.js");
const searchCourseMaterialsHandler = require("../api/course-materials/search.js");
const resultsLookupHandler = require("../api/results/lookup.js");

const projectRoot = path.join(__dirname, "..");
const servingBuiltSite = process.argv.includes("--built");
const siteRoot = servingBuiltSite ? path.join(projectRoot, "dist") : projectRoot;
const host = "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const files = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/sw.js", "sw.js"],
  ["/assets/js/pwa.js", "assets/js/pwa.js"],
  ["/assets/css/design-tokens.css", "assets/css/design-tokens.css"],
  ["/assets/css/styles.css", "assets/css/styles.css"],
  ["/assets/js/app.js", "assets/js/app.js"],
  ["/assets/lottie/manifest.json", "assets/lottie/manifest.json"],
  ["/data/announcements.csv", "data/announcements.csv"],
  ["/data/timetable.csv", "data/timetable.csv"],
]);
const brandDirectory = path.join(projectRoot, "assets", "brand");
for (const entry of fs.readdirSync(brandDirectory, { withFileTypes: true })) {
  if (entry.isFile()) {
    files.set(`/assets/brand/${encodeURIComponent(entry.name)}`, path.join("assets", "brand", entry.name));
  }
}
const lottieDirectory = path.join(projectRoot, "assets", "lottie");
for (const entry of fs.readdirSync(lottieDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
    files.set(`/assets/lottie/${encodeURIComponent(entry.name)}`, path.join("assets", "lottie", entry.name));
  }
}
const sfxDirectory = path.join(projectRoot, "assets", "sfx");
for (const entry of fs.readdirSync(sfxDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp3")) {
    files.set(`/assets/sfx/${encodeURIComponent(entry.name)}`, path.join("assets", "sfx", entry.name));
  }
}
const contentTypes = new Map([
  [".mp3", "audio/mpeg"],
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be a valid TCP port between 1 and 65535.");
  process.exit(1);
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  if (pathname === "/api/dr-eco") {
    void drEcoHandler(request, response);
    return;
  }
  if (pathname === "/api/gemini/live-token") {
    void geminiLiveTokenHandler(request, response);
    return;
  }
  if (pathname.startsWith("/api/admin/")) {
    request.query = { route: pathname.slice("/api/admin/".length) };
    void adminApiRouter(request, response);
    return;
  }
  if (pathname === "/api/student/auth") {
    void studentAuthHandler(request, response);
    return;
  }
  if (pathname === "/api/student/learning-profile") {
    void studentLearningProfileHandler(request, response);
    return;
  }
  if (pathname === "/api/course-catalog") {
    void courseCatalogHandler(request, response);
    return;
  }
  if (pathname === "/api/results/lookup") {
    void resultsLookupHandler(request, response);
    return;
  }
  if (pathname === "/api/course-materials/search") {
    void searchCourseMaterialsHandler(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed.");
    return;
  }

  if (pathname === "/assets/lottie/manifest.json" && !servingBuiltSite) {
    const manifest = fs.readdirSync(lottieDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => `/assets/lottie/${encodeURIComponent(entry.name)}`);
    response.writeHead(200, { "Cache-Control": "no-cache", "Content-Type": "application/json; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : JSON.stringify(manifest));
    return;
  }
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
  console.log(`FoldBook ${servingBuiltSite ? "production preview" : "development preview"} running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error(`The preview server could not start: ${error.message}`);
  process.exitCode = 1;
});
