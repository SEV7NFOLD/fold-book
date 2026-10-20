"use strict";

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const { createClient } = require("@supabase/supabase-js");
const cron = require("node-cron");
const qrcode = require("qrcode-terminal");
const fs = require("node:fs");
const path = require("node:path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOLDBOOK_URL = process.env.FOLDBOOK_URL || "https://foldbook-beta.vercel.app";
const AUTH_DIRECTORY = path.resolve(process.env.WHATSAPP_AUTH_DIRECTORY || "auth_info_baileys");
const BOT_PHONE_NUMBER = process.env.BOT_PHONE_NUMBER || "";
const DEFAULT_NUDGE_INTERVAL_HOURS = 10;
const PAGE_SIZE = 500;
const SEND_DELAY_MS = 3000;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

let socket;
let connected = false;
let reconnectTimer;
let pairingCodeTimer;
let reconnectDelayMs = 5000;
let dispatchInProgress = false;
let shuttingDown = false;
const completedScheduleRuns = new Set();
let reminderSettings = {
  enabled: true,
  morning_time: "07:00",
  evening_time: "19:00",
  min_interval_hours: DEFAULT_NUDGE_INTERVAL_HOURS,
  audience: "all",
  morning_message: "☀️ Good morning, {{name}}! {{streak}}. Today's mini-quest: five minutes of {{course}}.\n\nOpen FoldBook → {{link}}\nReply STOP any time to pause reminders.",
  evening_message: "🌙 Evening checkpoint, {{name}}! {{streak}}. Your mini-quest: one quick {{course}} question before you call it a day.\n\nOpen FoldBook → {{link}}\nReply STOP any time to pause reminders.",
};

function validateConfiguration() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the worker environment.");
  }
  try {
    new URL(FOLDBOOK_URL);
  } catch {
    throw new Error("FOLDBOOK_URL must be an absolute URL.");
  }
  if (BOT_PHONE_NUMBER && !/^234[789]\d{9}$/.test(BOT_PHONE_NUMBER.replace(/\D/g, ""))) {
    throw new Error("BOT_PHONE_NUMBER must be a Nigerian WhatsApp number in international format, e.g. 2348012345678.");
  }
}

function getMessageText(message) {
  const content = message.message;
  return content?.conversation
    || content?.extendedTextMessage?.text
    || content?.imageMessage?.caption
    || content?.videoMessage?.caption
    || "";
}

async function handleIncomingMessage(message) {
  const remoteJid = message.key?.remoteJid || "";
  if (message.key?.fromMe || !remoteJid.endsWith("@s.whatsapp.net")) return;

  const text = getMessageText(message).trim();
  const phoneNumber = remoteJid.slice(0, -"@s.whatsapp.net".length);
  if (/^(start|subscribe)$/i.test(text)) {
    const { data, error } = await supabase
      .from("whatsapp_optins")
      .update({ opted_in: true, last_nudged_at: null })
      .eq("phone_number", phoneNumber)
      .select("phone_number");
    if (error) {
      console.error("Could not record a WhatsApp subscription:", error.message);
      return;
    }
    const reply = data?.length
      ? "You are subscribed to FoldBook study reminders. Reply STOP at any time to unsubscribe."
      : "We couldn't find a saved FoldBook opt-in for this number. Use the FoldBook result-card form to subscribe.";
    await socket.sendMessage(remoteJid, { text: reply });
    return;
  }
  if (!/^(stop|unsubscribe|opt\s*out)$/i.test(text)) return;

  const { error } = await supabase
    .from("whatsapp_optins")
    .update({ opted_in: false })
    .eq("phone_number", phoneNumber);
  if (error) {
    console.error("Could not record a WhatsApp opt-out:", error.message);
    return;
  }
  await socket.sendMessage(remoteJid, { text: "You are unsubscribed from FoldBook study reminders. Reply START if you want reminders again." });
}

function generateNudgeMessage(name, streak, courseCode, session = "morning") {
  const firstName = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  const greeting = firstName || "there";
  const streakDays = Number.isInteger(streak) && streak > 0 ? streak : 0;
  const course = typeof courseCode === "string" && courseCode.trim() ? courseCode.trim() : "Economics";
  const streakLine = streakDays
    ? `Your ${streakDays}-day streak is looking strong. Keep it glowing with one tiny win.`
    : "Your next streak starts with one tiny win. Five minutes is plenty.";
  const messages = session === "evening" ? [
    `🌙 Evening checkpoint, ${greeting}! ${streakLine}\n\nYour mini-quest: answer one quick ${course} question before you call it a day. You’ve got this ✨`,
    `✨ ${greeting}, one last little win? Give ${course} five focused minutes and let tomorrow-you wake up proud.\n\nNo marathon required.`,
    `🐾 Dr. Eco’s evening mission for ${greeting}: open ${course}, tackle one idea, then enjoy your night. Small steps count!`,
  ] : [
    `☀️ Good morning, ${greeting}! ${streakLine}\n\nToday's mini-quest: warm up with five minutes of ${course}. Ready, set, learn! 🎯`,
    `🚀 Rise and shine, ${greeting}! Dr. Eco has a bite-sized ${course} quest waiting. One lesson now; main-character energy all day.`,
    `🐱 Your morning study streak is calling, ${greeting}! Pop into ${course} for one quick lesson and collect a little win before the day gets busy.`,
  ];
  const message = messages[Math.floor(Math.random() * messages.length)];
  const footer = `\n\nOpen FoldBook → ${FOLDBOOK_URL}\nReply STOP any time to pause reminders.`;
  return `${message}${footer}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function renderAdminMessage(template, name, streak, courseCode) {
  const firstName = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  const streakDays = Number.isInteger(streak) && streak > 0 ? streak : 0;
  const streakText = streakDays
    ? `Your ${streakDays}-day streak is glowing. Keep it going with one tiny win`
    : "Your next streak starts with one tiny win";
  const values = {
    name: firstName || "there",
    streak: streakText,
    course: typeof courseCode === "string" && courseCode.trim() ? courseCode.trim() : "Economics",
    link: FOLDBOOK_URL,
  };
  return template.replace(/\{\{(name|streak|course|link)\}\}/g, (_, key) => values[key]);
}

async function refreshReminderSettings() {
  const { data, error } = await supabase.from("whatsapp_bot_settings")
    .select("enabled,morning_time,evening_time,min_interval_hours,audience,morning_message,evening_message")
    .eq("id", 1).maybeSingle();
  if (error) throw error;
  if (data) reminderSettings = { ...reminderSettings, ...data };
  return reminderSettings;
}

async function updateWorkerHeartbeat(isConnected) {
  const { error } = await supabase.from("whatsapp_bot_heartbeat").upsert({
    id: 1,
    connected: isConnected,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) console.warn("Could not update WhatsApp worker heartbeat:", error.message);
}

async function dispatchDailyNudges(session = "morning") {
  if (dispatchInProgress) {
    console.warn("Skipping nudge run because a previous dispatch is still in progress.");
    return;
  }
  if (!connected || !socket) {
    console.warn("Skipping nudge run because WhatsApp is not connected.");
    return;
  }
  dispatchInProgress = true;
  const cutoff = new Date(Date.now() - reminderSettings.min_interval_hours * 60 * 60 * 1000).toISOString();
  let afterPhone = "";
  let recipientCount = 0;
  let failures = 0;
  try {
    while (connected && socket) {
      let query = supabase
        .from("whatsapp_optins")
        .select("phone_number,full_name,streak_count,course_code,last_activity_at")
        .eq("opted_in", true)
        .or(`last_nudged_at.is.null,last_nudged_at.lt.${cutoff}`)
        .not("phone_number", "is", null)
        .order("phone_number")
        .limit(PAGE_SIZE);
      if (afterPhone) query = query.gt("phone_number", afterPhone);
      const { data: optIns, error } = await query;
      if (error) throw error;
      const pageLastPhone = optIns?.at(-1)?.phone_number || "";
      const pageCount = optIns?.length || 0;
      if (reminderSettings.audience === "inactive") {
        const inactiveCutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
        const inactiveUsers = (optIns || []).filter((user) => !user.last_activity_at || Date.parse(user.last_activity_at) < inactiveCutoff);
        optIns.splice(0, optIns.length, ...inactiveUsers);
      }
      if (!optIns || optIns.length === 0) {
        if (pageLastPhone && pageCount === PAGE_SIZE) {
          afterPhone = pageLastPhone;
          continue;
        }
        break;
      }
      afterPhone = pageLastPhone;

      for (const user of optIns) {
        if (!connected || !socket) break;
        if (!/^234[789]\d{9}$/.test(user.phone_number || "")) {
          console.warn("Skipping a reminder record with an invalid phone number.");
          continue;
        }
        try {
          const jid = `${user.phone_number}@s.whatsapp.net`;
          await socket.sendMessage(jid, {
            text: renderAdminMessage(
              session === "evening" ? reminderSettings.evening_message : reminderSettings.morning_message,
              user.full_name, user.streak_count, user.course_code,
            ),
          });
          recipientCount += 1;
          const { error: updateError } = await supabase
            .from("whatsapp_optins")
            .update({ last_nudged_at: new Date().toISOString() })
            .eq("phone_number", user.phone_number)
            .eq("opted_in", true);
          if (updateError) {
            console.error("Reminder sent but its timestamp could not be saved:", updateError.message);
          }
          await delay(SEND_DELAY_MS);
        } catch (error) {
          failures += 1;
          console.error("Could not send a study reminder:", error.message);
        }
      }
      if (optIns.length < PAGE_SIZE) break;
    }
  } catch (error) {
    failures += 1;
    console.error("Daily WhatsApp nudge dispatch failed:", error.message);
  } finally {
    const { error: logError } = await supabase.from("whatsapp_bot_delivery_log").insert({
      session,
      status: failures ? (recipientCount ? "sent" : "failed") : "sent",
      recipient_count: recipientCount,
      detail: failures ? `${failures} send or dispatch error(s)` : null,
    });
    if (logError) console.warn("Could not log reminder delivery:", logError.message);
    dispatchInProgress = false;
  }
}

function minutesOfDay(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : -1;
}

async function runConfiguredReminderCheck() {
  try {
    await refreshReminderSettings();
    await updateWorkerHeartbeat(connected);
    const lagosDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
    const currentMinute = lagosDate.getHours() * 60 + lagosDate.getMinutes();
    const session = [["morning", reminderSettings.morning_time], ["evening", reminderSettings.evening_time]]
      .find(([, time]) => minutesOfDay(time) === currentMinute)?.[0];
    if (session && reminderSettings.enabled) {
      const runKey = `${lagosDate.getFullYear()}-${lagosDate.getMonth()}-${lagosDate.getDate()}:${session}`;
      if (!completedScheduleRuns.has(runKey)) {
        completedScheduleRuns.add(runKey);
        await dispatchDailyNudges(session);
      }
    }
  } catch (error) {
    console.error("Could not check configured WhatsApp reminder schedule:", error.message);
  }
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  const waitMs = reconnectDelayMs;
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, 60000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectToWhatsApp();
  }, waitMs);
}

async function connectToWhatsApp() {
  if (shuttingDown) return;
  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIRECTORY);
    const activeSocket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["Ubuntu", "Chrome", "110.0.5563.56"],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      logger: require("pino")({ level: "silent" }),
    });
    socket = activeSocket;
    activeSocket.ev.on("creds.update", saveCreds);
    activeSocket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        try {
          await handleIncomingMessage(message);
        } catch (error) {
          console.error("Could not process a WhatsApp reply:", error.message);
        }
      }
    });
    if (BOT_PHONE_NUMBER && !state.creds.registered) {
      pairingCodeTimer = setTimeout(async () => {
        pairingCodeTimer = null;
        if (shuttingDown || socket !== activeSocket) return;
        try {
          if (typeof activeSocket.requestPairingCode !== "function") {
            throw new Error("This Baileys version does not support pairing codes.");
          }
          const phoneNumber = BOT_PHONE_NUMBER.replace(/\D/g, "");
          const pairingCode = await activeSocket.requestPairingCode(phoneNumber);
          console.log("\n==================================================");
          console.log(`YOUR WHATSAPP PAIRING CODE IS: ${pairingCode}`);
          console.log("==================================================\n");
          console.warn("Treat this pairing code as a password; do not share or publish worker logs.");
        } catch (error) {
          console.error("Could not request a WhatsApp pairing code:", error.message);
        }
      }, 4000);
    }
    activeSocket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr && !BOT_PHONE_NUMBER) {
        console.log("\n==================================================");
        console.log("SCAN THIS QR CODE WITH YOUR WHATSAPP BOT PHONE:");
        console.log("==================================================\n");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") {
        connected = true;
        void updateWorkerHeartbeat(true);
        reconnectDelayMs = 5000;
        console.log("FoldBook WhatsApp worker connected.");
      } else if (connection === "close") {
        connected = false;
        void updateWorkerHeartbeat(false);
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldResetAuth = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        if (pairingCodeTimer) {
          clearTimeout(pairingCodeTimer);
          pairingCodeTimer = null;
        }
        if (socket === activeSocket) socket = null;
        console.warn(`WhatsApp connection closed (status: ${statusCode}).`);
        if (shouldResetAuth) {
          try {
            fs.rmSync(AUTH_DIRECTORY, { recursive: true, force: true });
            console.warn("Saved WhatsApp auth state removed; a fresh QR scan is required.");
          } catch (error) {
            console.error("Could not remove the saved WhatsApp auth state:", error.message);
            return;
          }
        }
        scheduleReconnect();
      }
    });
  } catch (error) {
    connected = false;
    console.error("WhatsApp connection could not be initialized:", error.message);
    scheduleReconnect();
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Stopping worker after ${signal}.`);
  for (const task of cronTasks) task.stop();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (pairingCodeTimer) clearTimeout(pairingCodeTimer);
  connected = false;
  void updateWorkerHeartbeat(false);
  if (socket) socket.end(undefined);
}

validateConfiguration();
const cronTasks = [
  cron.schedule("* * * * *", () => { void runConfiguredReminderCheck(); }, { timezone: "Africa/Lagos" }),
];

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
void connectToWhatsApp();
