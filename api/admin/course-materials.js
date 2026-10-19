"use strict";

const { isSameOrigin, isValidAdminSession } = require("../../lib/admin-auth.js");

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_CONTENT_LENGTH = 12000;

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

module.exports = async function adminCourseMaterialsHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!isSameOrigin(request)) {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }

  const sessionSecret = process.env.FOLDBOOK_ADMIN_SESSION_SECRET;
  if (!isValidAdminSession(request, sessionSecret)) {
    sendJson(response, 401, { error: "Sign in with the admin passcode before indexing materials." });
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
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_REQUEST_BYTES) {
    sendJson(response, 413, { error: "Request body is too large." });
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !/^(100L|200L|300L|400L)$/.test(payload.level || "")
    || typeof payload.courseCode !== "string" || !/^[A-Z]{2,5}\s?\d{3,4}$/i.test(payload.courseCode)
    || typeof payload.title !== "string" || !payload.title.trim() || payload.title.trim().length > 160
    || typeof payload.content !== "string" || !payload.content.trim() || payload.content.length > MAX_CONTENT_LENGTH) {
    sendJson(response, 400, { error: "Provide a valid level, course code, title, and bounded material text." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(response, 503, { error: "The server-side materials database is not configured." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/course_materials`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        level: payload.level,
        course_code: payload.courseCode.trim().toUpperCase().replace(/\s+/g, " "),
        title: payload.title.trim(),
        content: payload.content.trim(),
      }),
      signal: controller.signal,
    });
    if (!upstream.ok) {
      console.error("Supabase course material insert failed:", upstream.status);
      sendJson(response, 502, { error: "Supabase could not index this material." });
      return;
    }
    sendJson(response, 201, { ok: true });
  } catch (error) {
    console.error("Supabase course material request failed:", error.name === "AbortError" ? "request timed out" : error.name);
    sendJson(response, 502, {
      error: error.name === "AbortError" ? "Supabase materials request timed out." : "Supabase is temporarily unavailable.",
    });
  } finally {
    clearTimeout(timeout);
  }
};