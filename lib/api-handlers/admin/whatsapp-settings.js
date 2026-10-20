"use strict";

const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../admin-data.js");

const DEFAULTS = {
  enabled: true,
  morning_time: "07:00",
  evening_time: "19:00",
  min_interval_hours: 10,
  audience: "all",
  morning_message: "☀️ Good morning, {{name}}! {{streak}}. Your next mini-quest: {{activity}} on {{course}} — {{focus}}. One small step toward {{goal}}.\n\nOpen FoldBook → {{link}}\nReply STOP any time to pause reminders.",
  evening_message: "🌙 Evening checkpoint, {{name}}! {{streak}}. Take one small step: {{activity}} on {{focus}} for {{course}}. You’re moving toward {{goal}}.\n\nOpen FoldBook → {{link}}\nReply STOP any time to pause reminders.",
};

const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

module.exports = async function whatsappSettingsHandler(request, response) {
  if (!authorizeAdmin(request, response)) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  let payload;
  try { payload = await readBody(request); } catch (error) {
    return sendJson(response, error.status || 400, { error: "Enter valid bot settings." });
  }

  try {
    if (payload?.action === "status") {
      let settings = DEFAULTS;
      let settingsAvailable = true;
      try {
        const rows = await supabaseRequest("whatsapp_bot_settings?select=id,enabled,morning_time,evening_time,min_interval_hours,audience,morning_message,evening_message,updated_at&id=eq.1&limit=1");
        if (rows?.[0]) settings = rows[0];
      } catch {
        settingsAvailable = false;
      }
      let workerConnected = false;
      let workerLastSeen = null;
      try {
        const rows = await supabaseRequest("whatsapp_bot_heartbeat?select=connected,last_seen_at&id=eq.1&limit=1");
        workerConnected = rows?.[0]?.connected === true
          && Date.now() - Date.parse(rows[0].last_seen_at) < 120000;
        workerLastSeen = rows?.[0]?.last_seen_at || null;
      } catch { /* worker heartbeat migration may not have been applied yet */ }
      let deliveries = [];
      try {
        deliveries = await supabaseRequest("whatsapp_bot_delivery_log?select=session,status,recipient_count,detail,created_at&order=created_at.desc&limit=20");
      } catch { /* delivery log migration may not have been applied yet */ }
      return sendJson(response, 200, { settings, settingsAvailable, workerConnected, workerLastSeen, deliveries });
    }

    const settings = payload?.settings;
    if (payload?.action !== "save" || !settings || typeof settings !== "object"
      || typeof settings.enabled !== "boolean"
      || !TIME.test(settings.morning_time || "") || !TIME.test(settings.evening_time || "")
      || !Number.isInteger(settings.min_interval_hours) || settings.min_interval_hours < 6 || settings.min_interval_hours > 48
      || !["all", "inactive"].includes(settings.audience)
      || typeof settings.morning_message !== "string" || settings.morning_message.trim().length < 10 || settings.morning_message.length > 700
      || typeof settings.evening_message !== "string" || settings.evening_message.trim().length < 10 || settings.evening_message.length > 700) {
      return sendJson(response, 400, { error: "Check the reminder times, interval, audience and message text." });
    }
    const row = {
      id: 1,
      enabled: settings.enabled,
      morning_time: settings.morning_time,
      evening_time: settings.evening_time,
      min_interval_hours: settings.min_interval_hours,
      audience: settings.audience,
      morning_message: settings.morning_message.trim(),
      evening_message: settings.evening_message.trim(),
      updated_at: new Date().toISOString(),
    };
    await supabaseRequest("whatsapp_bot_settings?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    return sendJson(response, 200, { ok: true, settings: row });
  } catch (error) {
    console.error("WhatsApp bot settings request failed:", error.message);
    return sendJson(response, 502, { error: "Bot settings could not be loaded or saved. Apply the WhatsApp bot settings migration in Supabase, then retry." });
  }
};
