"use strict";

const { readSession, isSameOriginRequest, sendJson } = require("./auth.js");

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function databaseRequest(database, query) {
  const response = await fetch(database.url + "/rest/v1/student_push_campaigns" + query, {
    headers: {
      apikey: database.key,
      Authorization: "Bearer " + database.key,
    },
  });
  if (!response.ok) throw new Error("Student reminders could not be loaded.");
  return response.json();
}

module.exports = async function studentNotificationsHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  const session = readSession(request);
  if (!session) return sendJson(response, 401, { error: "Please sign in again." });
  const database = config();
  if (!database) return sendJson(response, 503, { error: "Student reminders are unavailable." });

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const query = "?select=id,message,target_type,registrations,created_at"
      + "&status=in.(queued,processing,sent)"
      + "&created_at=gte." + encodeURIComponent(since)
      + "&order=created_at.desc&limit=30";
    const rows = await databaseRequest(database, query);
    const registration = String(session.registration || "").trim().toUpperCase();
    const notifications = (Array.isArray(rows) ? rows : [])
      .filter((row) => row.target_type === "all"
        || (row.target_type === "selected" && Array.isArray(row.registrations)
          && row.registrations.some((entry) => String(entry).trim().toUpperCase() === registration)))
      .map((row) => {
        const firstName = String(session.name || "student").trim().split(/\s+/)[0] || "student";
        const message = typeof row.message === "string" ? row.message.slice(0, 500)
          .replace(/\{\{\s*name\s*\}\}/gi, firstName)
          .replace(/\{\{\s*link\s*\}\}/gi, "https://foldbook-beta.vercel.app") : "";
        return { id: String(row.id), message, createdAt: row.created_at };
      })
      .filter((row) => row.message);
    return sendJson(response, 200, { notifications });
  } catch (error) {
    console.error("Student inbox reminders could not be loaded:", error.message);
    return sendJson(response, 503, { error: "Student reminders could not be loaded." });
  }
};
