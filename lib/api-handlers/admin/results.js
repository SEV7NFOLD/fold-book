"use strict";

const { isSameOrigin, isValidAdminSession } = require("../../admin-auth.js");

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

module.exports = async function adminResultsHandler(request, response) {
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
  if (!url || !key) return sendJson(response, 503, { error: "Admin results are not configured on the server." });
  try {
    const query = new URLSearchParams({
      select: "reg_number,full_name,course_code,course_title,ca,exam,total,grade,remark",
      order: "full_name.asc,course_code.asc",
      limit: "5000",
    });
    const upstream = await fetch(`${url.replace(/\/$/, "")}/rest/v1/student_results?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!upstream.ok) throw new Error("Supabase admin results request failed.");
    const rows = await upstream.json();
    const students = Object.create(null);
    for (const row of rows) {
      if (!students[row.reg_number]) students[row.reg_number] = { name: row.full_name, results: [] };
      students[row.reg_number].results.push({
        course: row.course_code,
        course_title: row.course_title,
        ca: row.ca,
        exam: row.exam,
        total: row.total,
        grade: row.grade,
        remark: row.remark,
      });
    }
    return sendJson(response, 200, { students });
  } catch (error) {
    console.error("Admin results could not be loaded:", error.message);
    return sendJson(response, 502, { error: "Admin results could not be loaded. Please try again." });
  }
};
