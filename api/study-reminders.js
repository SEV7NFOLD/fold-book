"use strict";

const { sendWebPush } = require("./lib/web-push.js");

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
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
  if (!response.ok) throw new Error("Reminder delivery state could not be updated.");
  return response;
}

function lagosDate(value) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}

module.exports = async function studyRemindersHandler(request, response) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.authorization !== "Bearer " + cronSecret) {
    return response.status(401).json({ error: "Unauthorized" });
  }
  if (request.method !== "GET") return response.status(405).json({ error: "Method not allowed." });
  const database = config();
  if (!database || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return response.status(503).json({ error: "Reminder delivery is not configured." });
  }

  try {
    const rows = await databaseRequest(database, "student_push_subscriptions?select=endpoint,subscription,last_sent_at&limit=500");
    const subscriptions = await rows.json();
    const today = lagosDate(new Date());
    let sent = 0;
    let removed = 0;
    let skipped = 0;

    for (const row of subscriptions) {
      if (row.last_sent_at && lagosDate(new Date(row.last_sent_at)) === today) {
        skipped += 1;
        continue;
      }
      const nudge = {
        title: "Your FoldBook streak is waiting 🔥",
        body: "Just five minutes can move you forward. Ready for today’s mini-quest?",
        url: "/",
        tag: "foldbook-daily-study",
      };
      try {
        const delivery = await sendWebPush(row.subscription, nudge);
        if (delivery.status === 404 || delivery.status === 410) {
          await databaseRequest(database, "student_push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint), { method: "DELETE" });
          removed += 1;
        } else if (!delivery.ok) {
          skipped += 1;
        } else {
          await databaseRequest(database, "student_push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint), {
            method: "PATCH",
            prefer: "return=minimal",
            body: { last_sent_at: new Date().toISOString() },
          });
          sent += 1;
        }
      } catch (error) {
        console.error("Study reminder delivery failed:", error.message);
        skipped += 1;
      }
    }
    return response.status(200).json({ ok: true, sent, removed, skipped });
  } catch (error) {
    console.error("Scheduled study reminders could not run:", error.message);
    return response.status(503).json({ error: "Study reminders could not run." });
  }
};
