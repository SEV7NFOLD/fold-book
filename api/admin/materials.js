"use strict";

const { isSameOrigin, isValidAdminSession } = require("../../lib/admin-auth.js");

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
    if (size > 4096) throw new RangeError("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

module.exports = async function adminMaterialsHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!isSameOrigin(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  if (!isValidAdminSession(request, process.env.FOLDBOOK_ADMIN_SESSION_SECRET)) {
    return sendJson(response, 401, { error: "Sign in as an admin to manage course materials." });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return sendJson(response, 503, { error: "The materials database is not configured." });

  let payload;
  try { payload = await readBody(request); } catch {
    return sendJson(response, 400, { error: "Enter a valid materials request." });
  }
  try {
    if (payload?.action === "list") {
      const query = new URLSearchParams({
        select: "id,level,course_code,title,created_at",
        order: "created_at.desc",
        limit: "2000",
      });
      const upstream = await fetch(`${url.replace(/\/$/, "")}/rest/v1/course_materials?${query}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(12000),
      });
      if (!upstream.ok) throw new Error("Course library could not be loaded.");
      const rows = await upstream.json();
      const grouped = new Map();
      for (const row of rows) {
        const keyForItem = [row.level, row.course_code, row.title, row.created_at].join("\u0000");
        if (!grouped.has(keyForItem)) grouped.set(keyForItem, { ...row, chunk_count: 0 });
        grouped.get(keyForItem).chunk_count += 1;
      }
      return sendJson(response, 200, { materials: [...grouped.values()] });
    }
    if (payload?.action === "delete") {
      if (!/^(100L|200L|300L|400L)$/.test(payload.level || "")
        || typeof payload.courseCode !== "string" || payload.courseCode.length > 20
        || typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 160
        || typeof payload.createdAt !== "string" || Number.isNaN(Date.parse(payload.createdAt))) {
        return sendJson(response, 400, { error: "Choose a valid course material to remove." });
      }
      const query = new URLSearchParams({
        level: `eq.${payload.level}`,
        course_code: `eq.${payload.courseCode}`,
        title: `eq.${payload.title.trim()}`,
        created_at: `eq.${payload.createdAt}`,
      });
      const upstream = await fetch(`${url.replace(/\/$/, "")}/rest/v1/course_materials?${query}`, {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" },
        signal: AbortSignal.timeout(12000),
      });
      if (!upstream.ok) throw new Error("Course material could not be removed.");
      return sendJson(response, 200, { ok: true });
    }
    return sendJson(response, 400, { error: "Choose a materials action." });
  } catch (error) {
    console.error("Admin materials action failed:", error.message);
    return sendJson(response, 502, { error: error.message || "Materials could not be loaded." });
  }
};
