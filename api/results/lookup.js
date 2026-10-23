"use strict";

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

module.exports = async function resultsLookupHandler(request, response) {
  response.setHeader("Allow", "POST");
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
  return sendJson(response, 410, { error: "Public results lookup is closed. Sign in to FoldBook and open My Results." });
};
