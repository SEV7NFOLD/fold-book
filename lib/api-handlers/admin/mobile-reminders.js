"use strict";

const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../admin-data.js");

const TIME = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const REGISTRATION = /^(?:[0-9]{12}[A-Z]{2}|[0-9]{2}\/SS\/EC\/[0-9]{1,4})$/;

function registrations(value) {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
  const list = [...new Set(source.map((entry) => String(entry || "").trim().toUpperCase()).filter(Boolean))];
  if (list.length > 200 || list.some((entry) => !REGISTRATION.test(entry))) return null;
  return list;
}

module.exports = async function mobileRemindersHandler(request, response) {
  if (!authorizeAdmin(request, response)) return;
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  let payload;
  try { payload = await readBody(request); } catch {
    return sendJson(response, 400, { error: "Enter valid mobile reminder settings." });
  }

  try {
    if (payload?.action === "status") {
      const rows = await supabaseRequest("student_push_settings?select=*&id=eq.1&limit=1");
      const subscriptions = await supabaseRequest("student_push_subscriptions?select=registration&limit=10000");
      const campaigns = await supabaseRequest("student_push_campaigns?select=id,target_type,status,sent_count,created_at,processed_at&order=created_at.desc&limit=12");
      const students = new Set((subscriptions || []).map((item) => item.registration));
      return sendJson(response, 200, {
        settings: rows?.[0] || null,
        subscribedDevices: (subscriptions || []).length,
        subscribedStudents: students.size,
        campaigns: campaigns || [],
      });
    }

    if (payload?.action === "save") {
      const settings = payload.settings;
      const selected = registrations(settings?.selected_registrations);
      if (!settings || typeof settings !== "object" || typeof settings.enabled !== "boolean"
        || typeof settings.morning_enabled !== "boolean" || typeof settings.evening_enabled !== "boolean"
        || !TIME.test(settings.morning_time || "") || !TIME.test(settings.evening_time || "")
        || !Number.isInteger(settings.min_interval_hours) || settings.min_interval_hours < 1 || settings.min_interval_hours > 48
        || !["all", "selected"].includes(settings.audience) || !selected
        || (settings.audience === "selected" && selected.length === 0)
        || typeof settings.morning_message !== "string" || settings.morning_message.trim().length < 8 || settings.morning_message.length > 300
        || typeof settings.evening_message !== "string" || settings.evening_message.trim().length < 8 || settings.evening_message.length > 300
        || (settings.morning_enabled && settings.evening_enabled && settings.morning_time === settings.evening_time)) {
        return sendJson(response, 400, { error: "Check the schedule, audience, registration numbers and message text. Morning and evening times must differ." });
      }
      const row = {
        id: 1,
        enabled: settings.enabled,
        morning_enabled: settings.morning_enabled,
        evening_enabled: settings.evening_enabled,
        morning_time: settings.morning_time,
        evening_time: settings.evening_time,
        min_interval_hours: settings.min_interval_hours,
        audience: settings.audience,
        selected_registrations: selected,
        morning_message: settings.morning_message.trim(),
        evening_message: settings.evening_message.trim(),
        updated_at: new Date().toISOString(),
      };
      await supabaseRequest("student_push_settings?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(row),
      });
      return sendJson(response, 200, { ok: true, settings: row });
    }

    if (payload?.action === "queue") {
      const targetType = ["all", "selected"].includes(payload.target_type) ? payload.target_type : "";
      const selected = registrations(payload.registrations);
      const message = typeof payload.message === "string" ? payload.message.trim() : "";
      if (!targetType || !selected || message.length < 1 || message.length > 500
        || (targetType === "selected" && selected.length === 0)) {
        return sendJson(response, 400, { error: "Choose all subscribed students or valid registration numbers, then enter a message up to 500 characters." });
      }
      const rows = await supabaseRequest("student_push_campaigns", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ target_type: targetType, registrations: selected, message, status: "queued" }),
      });
      if (!rows?.[0]?.id) throw new Error("The mobile reminder could not be queued.");
      return sendJson(response, 202, { ok: true, id: rows[0].id, message: "Reminder queued. FoldBook will send it to opted-in devices within about a minute." });
    }

    return sendJson(response, 400, { error: "Choose a valid mobile reminder action." });
  } catch (error) {
    console.error("Admin mobile reminder request failed:", error.message);
    return sendJson(response, 502, { error: "Mobile reminder settings could not be loaded or saved. Check that the mobile reminder database migration is applied." });
  }
};
