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

module.exports = async function publicCourseCatalogHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return sendJson(response, 503, { error: "The course catalog is temporarily unavailable." });
  try {
    const query = new URLSearchParams({
      select: "level,course_code,title,credit_units",
      order: "level.asc,course_code.asc",
      limit: "1000",
    });
    const upstream = await fetch(`${url.replace(/\/$/, "")}/rest/v1/course_catalog?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!upstream.ok) throw new Error("Course catalog request failed.");
    return sendJson(response, 200, { courses: await upstream.json() });
  } catch (error) {
    console.error("Public course catalog request failed:", error.name);
    return sendJson(response, 502, { error: "The course catalog is temporarily unavailable." });
  }
};
