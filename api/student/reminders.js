"use strict";

const { readSession, isSameOriginRequest, sendJson } = require("./auth.js");

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
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

async function databaseRequest(database, path, options = {}) {
  const response = await fetch(database.url + "/rest/v1/" + path, {
    method: options.method || "GET",
    headers: {
      apikey: database.key,
      Authorization: "Bearer " + database.key,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) throw new Error("Reminder settings could not be saved.");
  return response;
}

function validSubscription(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (typeof value.endpoint !== "string" || value.endpoint.length > 2048) return false;
  try {
    const endpoint = new URL(value.endpoint);
    const supported = endpoint.protocol === "https:" && (
      endpoint.hostname === "fcm.googleapis.com" || endpoint.hostname === "android.googleapis.com" ||
      endpoint.hostname === "web.push.apple.com" || endpoint.hostname.endsWith(".push.services.mozilla.com")
    );
    return supported && typeof value.keys?.p256dh === "string" && typeof value.keys?.auth === "string";
  } catch { return false; }
}

module.exports = async function studentRemindersHandler(request, response) {
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  const session = readSession(request);
  if (!session) return sendJson(response, 401, { error: "Please sign in again." });
  const database = config();
  if (!database || !process.env.VAPID_PUBLIC_KEY) return sendJson(response, 503, { error: "Study reminders are not configured yet." });

  if (request.method === "GET") return sendJson(response, 200, { publicKey: process.env.VAPID_PUBLIC_KEY });

  let payload;
  try { payload = await readBody(request); } catch {
    return sendJson(response, 400, { error: "Send valid reminder settings." });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return sendJson(response, 400, { error: "Send valid reminder settings." });
  }
  try {
    if (request.method === "POST") {
      if (!validSubscription(payload.subscription)) return sendJson(response, 400, { error: "This browser does not support FoldBook reminders." });
      const query = "student_push_subscriptions?on_conflict=endpoint";
      await databaseRequest(database, query, {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          endpoint: payload.subscription.endpoint,
          registration: session.registration,
          subscription: payload.subscription,
          updated_at: new Date().toISOString(),
        },
      });
      return sendJson(response, 200, { ok: true });
    }
    if (request.method === "DELETE") {
      if (typeof payload.endpoint !== "string" || payload.endpoint.length > 2048) return sendJson(response, 400, { error: "Choose a valid reminder subscription." });
      const query = "student_push_subscriptions?endpoint=eq." + encodeURIComponent(payload.endpoint) + "&registration=eq." + encodeURIComponent(session.registration);
      await databaseRequest(database, query, { method: "DELETE" });
      return sendJson(response, 200, { ok: true });
    }
    response.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Student reminder preferences could not be saved:", error.message);
    return sendJson(response, 503, { error: "Could not update reminders right now. Please try again shortly." });
  }
};
