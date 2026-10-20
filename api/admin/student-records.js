"use strict";

const { isSameOrigin, isValidAdminSession } = require("../../lib/admin-auth.js");

function isSameOriginRequest(request) {
  if (request.headers.origin) return isSameOrigin(request);
  return request.headers["sec-fetch-site"] === "same-origin" && Boolean(request.headers.host);
}

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

module.exports = async function adminStudentRecordsHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  if (!isValidAdminSession(request, process.env.FOLDBOOK_ADMIN_SESSION_SECRET)) {
    return sendJson(response, 401, { error: "Admin sign-in has expired. Please sign in again." });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return sendJson(response, 503, { error: "Student records are not configured on the server." });
  try {
    const upstream = await fetch(`${url.replace(/\/$/, "")}/rest/v1/whatsapp_optins?select=full_name,reg_number,phone_number,streak_count,last_nudged_at&opted_in=eq.true&order=full_name.asc&limit=2000`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!upstream.ok) throw new Error("Supabase student contacts request failed.");
    return sendJson(response, 200, { students: await upstream.json() });
  } catch (error) {
    console.error("Admin student records could not be loaded:", error.message);
    return sendJson(response, 502, { error: "Student contacts could not be loaded. Try again." });
  }
};
