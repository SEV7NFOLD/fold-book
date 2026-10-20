"use strict";

const {
  adminCookie,
  createAdminSession,
  isSameOrigin,
  secureEqual,
} = require("../../admin-auth.js");

const MAX_REQUEST_BYTES = 1024;

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

async function readBody(request) {
  if (request.body !== undefined) {
    const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new RangeError("Request body is too large.");
    return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  }
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > MAX_REQUEST_BYTES) throw new RangeError("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = async function adminSessionHandler(request, response) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    response.setHeader("Allow", "POST, DELETE");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!isSameOrigin(request)) {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }

  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", adminCookie("", request, 0));
    sendJson(response, 200, { ok: true });
    return;
  }

  const passcode = process.env.FOLDBOOK_ADMIN_PASSCODE;
  const sessionSecret = process.env.FOLDBOOK_ADMIN_SESSION_SECRET;
  if (!passcode || !sessionSecret || sessionSecret.length < 32) {
    sendJson(response, 503, { error: "Admin access is not configured on the server." });
    return;
  }

  let payload;
  try {
    payload = await readBody(request);
  } catch (error) {
    const tooLarge = error instanceof RangeError;
    sendJson(response, tooLarge ? 413 : 400, {
      error: tooLarge ? error.message : "Request body must be valid JSON.",
    });
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || typeof payload.passcode !== "string" || !secureEqual(payload.passcode, passcode)) {
    sendJson(response, 401, { error: "The admin passcode is incorrect." });
    return;
  }

  response.setHeader("Set-Cookie", adminCookie(createAdminSession(sessionSecret), request));
  sendJson(response, 200, { ok: true });
};