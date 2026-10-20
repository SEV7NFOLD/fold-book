"use strict";

const { isSameOrigin } = require("../../lib/admin-auth.js");

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
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) throw new RangeError("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

module.exports = async function resultsLookupHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!isSameOrigin(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  let payload;
  try { payload = await readBody(request); } catch {
    return sendJson(response, 400, { error: "Enter a registration number and full name." });
  }
  const registration = String(payload?.registration || "").trim().toUpperCase().replace(/\s+/g, "");
  const fullName = String(payload?.fullName || "").trim();
  if (!/^\d{2}\/SS\/EC\/\d{1,4}$/.test(registration) || fullName.length < 3 || fullName.length > 120) {
    return sendJson(response, 400, { error: "Enter a valid registration number and full name." });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return sendJson(response, 503, { error: "The results service is not configured." });
  try {
    const query = new URLSearchParams({
      select: "reg_number,full_name,course_code,course_title,ca,exam,total,grade,remark",
      reg_number: `eq.${registration}`,
      limit: "200",
    });
    const upstream = await fetch(`${url.replace(/\/$/, "")}/rest/v1/student_results?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!upstream.ok) throw new Error("Supabase results lookup failed.");
    const rows = await upstream.json();
    if (!rows.length || rows.some((row) => normalizeName(row.full_name) !== normalizeName(fullName))) {
      return sendJson(response, 404, { error: "We could not find results matching those details." });
    }
    return sendJson(response, 200, {
      student: {
        name: rows[0].full_name,
        results: rows.map((row) => ({
          course: row.course_code,
          course_title: row.course_title,
          ca: row.ca,
          exam: row.exam,
          total: row.total,
          grade: row.grade,
          remark: row.remark,
        })),
      },
    });
  } catch (error) {
    console.error("Public results lookup failed:", error.message);
    return sendJson(response, 502, { error: "Results could not be loaded. Please try again shortly." });
  }
};
