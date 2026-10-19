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
const FOLDBOOK_URL = process.env.FOLDBOOK_URL || "https://foldbook.app";
const AUTH_DIRECTORY = path.resolve(process.env.WHATSAPP_AUTH_DIRECTORY || "auth_info_baileys");
const NUDGE_INTERVAL_HOURS = 20;
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
let reconnectDelayMs = 5000;
let dispatchInProgress = false;
let shuttingDown = false;

function validateConfiguration() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the worker environment.");
  }
  try {
    new URL(FOLDBOOK_URL);
  } catch {
    throw new Error("FOLDBOOK_URL must be an absolute URL.");
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

function generateNudgeMessage(name, streak, courseCode) {
  const firstName = typeof name === "string" ? name.trim().split(/\s+/)[0] : "";
  const greeting = firstName || "there";
  const streakDays = Number.isInteger(streak) && streak > 0 ? streak : 1;
  const course = typeof courseCode === "string" && courseCode.trim() ? courseCode.trim() : "your Economics course";
  const messages = [
    `📚 Hi ${greeting}! Keep your ${streakDays}-day study streak going with a quick review of ${course} on FoldBook.\n\n${FOLDBOOK_URL}\n\nReply STOP to unsubscribe.`,
    `⚡ ${greeting}, take a few minutes for ${course} practice today and keep building your study streak.\n\n${FOLDBOOK_URL}\n\nReply STOP to unsubscribe.`,
    `🎓 Your next ${course} review is ready when you are, ${greeting}. Open FoldBook for a short study session.\n\n${FOLDBOOK_URL}\n\nReply STOP to unsubscribe.`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function dispatchDailyNudges() {
  if (dispatchInProgress) {
    console.warn("Skipping nudge run because a previous dispatch is still in progress.");
    return;
  }
  if (!connected || !socket) {
    console.warn("Skipping nudge run because WhatsApp is not connected.");
    return;
  }
  dispatchInProgress = true;
  const cutoff = new Date(Date.now() - NUDGE_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
  let afterPhone = "";
  try {
    while (connected && socket) {
      let query = supabase
        .from("whatsapp_optins")
        .select("phone_number,full_name,streak_count,course_code")
        .eq("opted_in", true)
        .or(`last_nudged_at.is.null,last_nudged_at.lt.${cutoff}`)
        .not("phone_number", "is", null)
        .order("phone_number")
        .limit(PAGE_SIZE);
      if (afterPhone) query = query.gt("phone_number", afterPhone);
      const { data: optIns, error } = await query;
      if (error) throw error;
      if (!optIns || optIns.length === 0) break;
      afterPhone = optIns[optIns.length - 1].phone_number;

      for (const user of optIns) {
        if (!connected || !socket) break;
        if (!/^234[789]\d{9}$/.test(user.phone_number || "")) {
          console.warn("Skipping a reminder record with an invalid phone number.");
          continue;
        }
        try {
          const jid = `${user.phone_number}@s.whatsapp.net`;
          await socket.sendMessage(jid, {
            text: generateNudgeMessage(user.full_name, user.streak_count, user.course_code),
          });
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
          console.error("Could not send a study reminder:", error.message);
        }
      }
      if (optIns.length < PAGE_SIZE) break;
    }
  } catch (error) {
    console.error("Daily WhatsApp nudge dispatch failed:", error.message);
  } finally {
    dispatchInProgress = false;
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
    socket = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      browser: ["FoldBook AI", "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      generateHighQualityLinkPreview: false,
      logger: require("pino")({ level: "silent" }),
    });
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const message of messages) {
        try {
          await handleIncomingMessage(message);
        } catch (error) {
          console.error("Could not process a WhatsApp reply:", error.message);
        }
      }
    });
    socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        console.log("\n==================================================");
        console.log("SCAN THIS QR CODE WITH YOUR WHATSAPP BOT PHONE:");
        console.log("==================================================\n");
        qrcode.generate(qr, { small: true });
      }
      if (connection === "open") {
        connected = true;
        reconnectDelayMs = 5000;
        console.log("FoldBook WhatsApp worker connected.");
      } else if (connection === "close") {
        connected = false;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldResetAuth = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        socket = null;
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
  cronTask.stop();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  connected = false;
  if (socket) socket.end(undefined);
}

validateConfiguration();
const cronTask = cron.schedule("0 8 * * *", () => {
  void dispatchDailyNudges();
}, { timezone: "Africa/Lagos" });

process.once("SIGINT", () => { void shutdown("SIGINT"); });
process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
void connectToWhatsApp();
