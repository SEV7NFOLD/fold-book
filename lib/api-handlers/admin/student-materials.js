"use strict";

const { isSameOrigin, isValidAdminSession } = require("../../admin-auth.js");

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

module.exports = async function adminStudentMaterialsHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!isSameOrigin(request)) {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }
  if (!isValidAdminSession(request, process.env.FOLDBOOK_ADMIN_SESSION_SECRET)) {
    sendJson(response, 401, { error: "Sign in with the admin passcode to view student submissions." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(response, 503, { error: "The server-side materials database is not configured." });
    return;
  }

  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/student_materials?select=id,title,course_code,course_title,description,level,file_name,extracted_text,created_at&order=created_at.desc&limit=100`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) {
      console.error("Supabase student materials query failed:", upstream.status);
      sendJson(response, 502, { error: "Could not load student material submissions." });
      return;
    }
    const materials = await upstream.json();
    sendJson(response, 200, { materials });
  } catch (error) {
    console.error("Student material admin request failed:", error.name);
    sendJson(response, 502, { error: "Student material submissions are temporarily unavailable." });
  }
};
