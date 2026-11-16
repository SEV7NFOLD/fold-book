"use strict";

// Admin: notes students asked Dr. Eco for that FoldBook doesn't have yet,
// grouped by course and topic, most requested first. No student identities are returned.
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

module.exports = async function adminMaterialRequestsHandler(request, response) {
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
    sendJson(response, 401, { error: "Sign in with the admin passcode to view notes requests." });
    return;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(response, 503, { error: "The server-side database is not configured." });
    return;
  }
  try {
    const upstream = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/material_requests?select=registration,course_code,query,keywords,created_at&order=created_at.desc&limit=2000`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      signal: AbortSignal.timeout(12000),
    });
    if (upstream.status === 404 || upstream.status === 400) {
      const text = await upstream.text();
      if (/material_requests|PGRST205|42P01/.test(text)) {
        sendJson(response, 503, { error: "The notes requests table isn't set up yet. Run supabase/2026-11-16-material-requests.sql in the Supabase SQL Editor." });
        return;
      }
    }
    if (!upstream.ok) {
      console.error("Supabase material requests query failed:", upstream.status);
      sendJson(response, 502, { error: "Could not load notes requests." });
      return;
    }
    const rows = await upstream.json();
    const groups = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const course = row.course_code || "";
      const topic = String(row.keywords || "").trim();
      const key = `${course}\u0000${topic.toLowerCase()}`;
      const group = groups.get(key) || { courseCode: course, topic, requests: 0, students: new Set(), lastAsked: row.created_at, examples: [] };
      group.requests += 1;
      if (row.registration) group.students.add(row.registration);
      if (row.created_at > group.lastAsked) group.lastAsked = row.created_at;
      if (group.examples.length < 3 && row.query && !group.examples.includes(row.query)) group.examples.push(row.query);
      groups.set(key, group);
    }
    const requests = [...groups.values()]
      .map((group) => ({ courseCode: group.courseCode, topic: group.topic, requests: group.requests, students: group.students.size, lastAsked: group.lastAsked, examples: group.examples }))
      .sort((a, b) => b.students - a.students || b.requests - a.requests || String(b.lastAsked).localeCompare(String(a.lastAsked)))
      .slice(0, 100);
    sendJson(response, 200, { total: Array.isArray(rows) ? rows.length : 0, requests });
  } catch (error) {
    console.error("Material requests admin request failed:", error.name);
    sendJson(response, 502, { error: "Notes requests are temporarily unavailable." });
  }
};
