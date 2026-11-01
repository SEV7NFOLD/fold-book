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
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* PostgREST may return no body. */ }
  if (!response.ok) throw new Error("Reminder database request failed with " + response.status + ".");
  return data;
}

function lagosClock(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: values.year + "-" + values.month + "-" + values.day,
    minute: Number(values.hour) * 60 + Number(values.minute),
  };
}

function dueNow(scheduledTime, clock) {
  if (typeof scheduledTime !== "string" || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(scheduledTime)) return false;
  const parts = scheduledTime.split(":").map(Number);
  const difference = clock.minute - parts[0] * 60 - parts[1];
  return difference >= 0 && difference <= 2;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

function renderMessage(template, student) {
  const name = String(student?.full_name || "student").trim().split(/\s+/)[0] || "student";
  return String(template || "")
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*link\s*\}\}/gi, "https://foldbook-beta.vercel.app");
}

async function loadProfiles(database) {
  const rows = await databaseRequest(database, "student_accounts?select=reg_number,full_name&limit=10000");
  return new Map((rows || []).map((row) => [row.reg_number, row]));
}

async function loadSubscriptions(database) {
  return databaseRequest(database, "student_push_subscriptions?select=endpoint,registration,subscription,last_sent_at,last_morning_sent_date,last_evening_sent_date&limit=10000");
}

async function deleteSubscription(database, endpoint) {
  await databaseRequest(database, "student_push_subscriptions?endpoint=eq." + encodeURIComponent(endpoint), { method: "DELETE" });
}

async function claimScheduledSend(database, row, occasion) {
  const field = occasion === "morning" ? "last_morning_sent_date" : "last_evening_sent_date";
  const today = lagosClock(new Date()).date;
  const filter = encodeURIComponent("(" + field + ".is.null," + field + ".lt." + today + ")");
  const claimed = await databaseRequest(
    database,
    "student_push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint) + "&or=" + filter,
    { method: "PATCH", prefer: "return=representation", body: { [field]: today } }
  );
  return Array.isArray(claimed) && claimed.length > 0;
}

async function releaseScheduledSend(database, row, occasion) {
  const field = occasion === "morning" ? "last_morning_sent_date" : "last_evening_sent_date";
  const today = lagosClock(new Date()).date;
  await databaseRequest(
    database,
    "student_push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint) + "&" + field + "=eq." + today,
    { method: "PATCH", prefer: "return=minimal", body: { [field]: null } }
  ).catch(() => {});
}

async function deliver(database, row, message, profile, occasion) {
  const scheduled = occasion === "morning" || occasion === "evening";
  let claimed = false;
  try {
    if (scheduled) {
      claimed = await claimScheduledSend(database, row, occasion);
      if (!claimed) return "already";
    }
    const response = await sendWebPush(row.subscription, {
      title: occasion === "custom" ? "A FoldBook note for you ✨" : "Your FoldBook streak is waiting 🔥",
      body: renderMessage(message, profile),
      url: "/",
      tag: occasion === "morning" ? "foldbook-morning-study" : occasion === "evening" ? "foldbook-evening-study" : "foldbook-custom-study",
    });
    if (response.status === 404 || response.status === 410) {
      await deleteSubscription(database, row.endpoint);
      return "removed";
    }
    if (!response.ok) {
      if (claimed) await releaseScheduledSend(database, row, occasion);
      return "failed";
    }
    await databaseRequest(database, "student_push_subscriptions?endpoint=eq." + encodeURIComponent(row.endpoint), {
      method: "PATCH",
      prefer: "return=minimal",
      body: { last_sent_at: new Date().toISOString() },
    });
    return "sent";
  } catch (error) {
    if (claimed) await releaseScheduledSend(database, row, occasion);
    console.error("Mobile reminder delivery failed:", error.message);
    return "failed";
  }
}

async function deliverScheduled(database, subscriptions, profiles, settings, occasion, clock) {
  if (!settings.enabled || !settings[occasion + "_enabled"] || !dueNow(settings[occasion + "_time"], clock)) return 0;
  const dateField = occasion === "morning" ? "last_morning_sent_date" : "last_evening_sent_date";
  const message = settings[occasion + "_message"];
  const minimumGap = Math.max(1, Number(settings.min_interval_hours) || 6) * 60 * 60 * 1000;
  const eligible = subscriptions.filter((row) => {
    if (row[dateField] === clock.date) return false;
    if (settings.audience === "selected" && !(settings.selected_registrations || []).includes(row.registration)) return false;
    if (row.last_sent_at && Date.now() - Date.parse(row.last_sent_at) < minimumGap) return false;
    return true;
  });
  const outcomes = await mapLimit(eligible, 20, (row) => deliver(database, row, message, profiles.get(row.registration), occasion));
  return outcomes.filter((result) => result === "sent").length;
}

async function deliverCustomCampaign(database, campaign, subscriptions, profiles) {
  const targets = campaign.target_type === "selected" ? new Set(campaign.registrations || []) : null;
  const eligible = subscriptions.filter((row) => !targets || targets.has(row.registration));
  const outcomes = await mapLimit(eligible, 20, (row) => deliver(database, row, campaign.message, profiles.get(row.registration), "custom"));
  const sent = outcomes.filter((result) => result === "sent").length;
  await databaseRequest(database, "student_push_campaigns?id=eq." + encodeURIComponent(String(campaign.id)), {
    method: "PATCH",
    prefer: "return=minimal",
    body: { status: "sent", sent_count: sent, processed_at: new Date().toISOString() },
  });
  return sent;
}

module.exports = async function studyRemindersHandler(request, response) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.authorization !== "Bearer " + cronSecret) {
    return response.status(401).json({ error: "Unauthorized" });
  }
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed." });
  const database = config();
  if (!database || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return response.status(503).json({ error: "Reminder delivery is not configured." });
  }

  try {
    const settingsRows = await databaseRequest(database, "student_push_settings?select=*&id=eq.1&limit=1");
    const settings = settingsRows?.[0] || { enabled: false };
    const [subscriptions, profiles] = await Promise.all([loadSubscriptions(database), loadProfiles(database)]);
    const clock = lagosClock(new Date());
    const morningSent = await deliverScheduled(database, subscriptions, profiles, settings, "morning", clock);
    const eveningSent = await deliverScheduled(database, subscriptions, profiles, settings, "evening", clock);

    const campaigns = await databaseRequest(database, "rpc/claim_foldbook_push_campaign", {
      method: "POST",
      prefer: "return=representation",
      body: {},
    });
    let campaignSent = 0;
    const campaign = Array.isArray(campaigns) ? campaigns[0] : campaigns;
    if (campaign?.id) {
      try {
        campaignSent = await deliverCustomCampaign(database, campaign, subscriptions, profiles);
      } catch (error) {
        console.error("Queued mobile reminder could not finish:", error.message);
        await databaseRequest(database, "student_push_campaigns?id=eq." + encodeURIComponent(String(campaign.id)), {
          method: "PATCH",
          prefer: "return=minimal",
          body: { status: "failed", processed_at: new Date().toISOString() },
        }).catch(() => {});
      }
    }
    return response.status(200).json({
      ok: true,
      lagosTime: clock.date + " " + String(Math.floor(clock.minute / 60)).padStart(2, "0") + ":" + String(clock.minute % 60).padStart(2, "0"),
      morningSent,
      eveningSent,
      customSent: campaignSent,
    });
  } catch (error) {
    console.error("Scheduled FoldBook reminders could not run:", error.message);
    return response.status(503).json({ error: "Scheduled FoldBook reminders could not run." });
  }
};

module.exports.config = { maxDuration: 60 };
