"use strict";

const { embedTexts } = require("../../lib/gemini-embeddings.js");

const MAX_BODY_BYTES = 8 * 1024;
const COURSE_PATTERN = /^[A-Z]{2,5}\s?\d{3,4}$/i;

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
  if (request.body !== undefined) return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large."), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = async function searchCourseMaterialsHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  let origin;
  try { origin = new URL(request.headers.origin).host; } catch {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }
  if (!request.headers.host || origin.toLowerCase() !== request.headers.host.toLowerCase()) {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }
  let payload;
  try { payload = await readBody(request); } catch (error) {
    sendJson(response, error.status || 400, { error: error.message === "Unexpected end of JSON input" ? "Request body must be valid JSON." : error.message });
    return;
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_BODY_BYTES) {
    sendJson(response, 413, { error: "Request body is too large." });
    return;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || !/^(100L|200L|300L|400L)$/.test(payload.level || "")
    || typeof payload.courseCode !== "string" || !COURSE_PATTERN.test(payload.courseCode)
    || typeof payload.query !== "string" || !payload.query.trim() || payload.query.length > 2000) {
    sendJson(response, 400, { error: "Provide a valid course, academic level, and short search question." });
    return;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(response, 503, { error: "The server-side course materials database is not configured." });
    return;
  }
  try {
    const [embedding] = await embedTexts([payload.query.trim()], "RETRIEVAL_QUERY");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/match_course_materials`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          match_embedding: embedding,
          match_course: payload.courseCode.trim().toUpperCase().replace(/\s+/g, " "),
          match_level: payload.level,
          match_count: Math.max(1, Math.min(Number(payload.count) || 5, 8)),
        }),
        signal: controller.signal,
      });
      if (!upstream.ok) {
        console.error("Supabase course material search failed:", upstream.status);
        sendJson(response, 502, { error: "Course materials could not be searched. Check the course materials database schema and RPC." });
        return;
      }
      const matches = await upstream.json();
      sendJson(response, 200, {
        materials: Array.isArray(matches) ? matches
          .filter((row) => row && typeof row.content === "string")
          .map((row) => ({ title: typeof row.title === "string" ? row.title : "Course material", content: row.content })) : [],
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (error.status) {
      sendJson(response, error.status, { error: error.message });
      return;
    }
    console.error("Course material search failed:", error.name === "AbortError" ? "request timed out" : error.name);
    sendJson(response, error.name === "AbortError" ? 504 : 502, {
      error: error.name === "AbortError" ? "Course material search timed out." : "Course material search is temporarily unavailable.",
    });
  }
};
