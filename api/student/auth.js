"use strict";

const { createHmac, randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { isSameOrigin } = require("../../lib/admin-auth.js");

const scryptAsync = promisify(scrypt);
const COOKIE = "foldbook_student";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_BYTES = 64;

function isSameOriginRequest(request) {
  if (request.headers.origin) return isSameOrigin(request);
  return request.headers["sec-fetch-site"] === "same-origin" && Boolean(request.headers.host);
}

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

function normalizeRegistration(value) {
  const registration = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  return /^\d{2}\/SS\/EC\/\d{1,4}$/.test(registration) ? registration : "";
}

function nameTokens(value) {
  return String(value || "").trim().toLocaleLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((part) => part.length > 1);
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const formatted = digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
  return /^234[789]\d{9}$/.test(formatted) ? formatted : "";
}

function normalizeLevel(value) {
  return /^(100L|200L|300L|400L)$/.test(value) ? value : "";
}

function sessionSecret() {
  const secret = process.env.FOLDBOOK_ADMIN_SESSION_SECRET;
  return typeof secret === "string" && secret.length >= 32 ? secret : "";
}

function encodeSession(student) {
  const payload = Buffer.from(JSON.stringify({
    role: "student",
    registration: student.reg_number,
    name: student.full_name,
    phoneNumber: student.phone_number,
    level: student.academic_level || "100L",
    levelChangeCount: Number.isInteger(student.level_change_count) ? student.level_change_count : 0,
    expiresAt: Date.now() + SESSION_SECONDS * 1000,
  })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readSession(request) {
  const secret = sessionSecret();
  if (!secret) return null;
  const entry = (request.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!entry) return null;
  const [payload, signature, ...extra] = entry.slice(COOKIE.length + 1).split(".");
  if (!payload || !signature || extra.length) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let received;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return value.role === "student" && value.expiresAt > Date.now() ? value : null;
  } catch { return null; }
}

function cookie(value, request, maxAge = SESSION_SECONDS) {
  const secure = process.env.NODE_ENV === "production" || request.headers["x-forwarded-proto"] === "https";
  return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api/student; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function restConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function supabaseRequest(config, table, query, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* provider returned a non-JSON error */ }
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || "Database request failed.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function derivePassword(password, salt) {
  return scryptAsync(password, salt, PASSWORD_BYTES, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

module.exports = async function studentAuthHandler(request, response) {
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  const secret = sessionSecret();
  const config = restConfig();
  if (!secret || !config) return sendJson(response, 503, { error: "Student sign-in is not configured on the server." });

  if (request.method === "GET") {
    const session = readSession(request);
    if (!session) return sendJson(response, 401, { error: "Please sign in again." });
    try {
      const rows = await supabaseRequest(config, "student_accounts",
        `?select=reg_number,full_name,phone_number,academic_level,level_change_count&reg_number=eq.${encodeURIComponent(session.registration)}&limit=1`);
      const account = rows?.[0];
      if (!account) return sendJson(response, 401, { error: "Please sign in again." });
      response.setHeader("Set-Cookie", cookie(encodeSession(account), request));
      return sendJson(response, 200, { student: {
        role: "student",
        registration: account.reg_number,
        name: account.full_name,
        phoneNumber: account.phone_number,
        level: account.academic_level || "100L",
        levelChangeCount: Number.isInteger(account.level_change_count) ? account.level_change_count : 0,
      } });
    } catch (error) {
      console.error("Student session refresh failed:", error.message);
      return sendJson(response, 503, { error: "Could not load your saved student profile. Please try again shortly." });
    }
  }
  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", cookie("", request, 0));
    return sendJson(response, 200, { ok: true });
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  let payload;
  try { payload = await readBody(request); } catch {
    return sendJson(response, 400, { error: "Enter valid sign-in details." });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return sendJson(response, 400, { error: "Enter valid sign-in details." });
  }
  const mode = payload.mode;

  if (mode === "change-level") {
    const session = readSession(request);
    const level = normalizeLevel(payload.level);
    if (!session) return sendJson(response, 401, { error: "Please sign in again before updating your level." });
    if (!level) return sendJson(response, 400, { error: "Choose a valid academic level." });
    try {
      const result = await supabaseRequest(config, "rpc/change_foldbook_student_level", "", {
        method: "POST",
        body: { p_reg_number: session.registration, p_academic_level: level },
      });
      if (!result || !normalizeLevel(result.level) || !Number.isInteger(result.levelChangeCount)) {
        throw new Error("Student level update returned an invalid response.");
      }
      const account = {
        reg_number: session.registration,
        full_name: session.name,
        phone_number: session.phoneNumber || "",
        academic_level: result.level,
        level_change_count: result.levelChangeCount,
      };
      response.setHeader("Set-Cookie", cookie(encodeSession(account), request));
      return sendJson(response, 200, { student: {
        role: "student",
        registration: account.reg_number,
        name: account.full_name,
        phoneNumber: account.phone_number,
        level: account.academic_level,
        levelChangeCount: account.level_change_count,
      } });
    } catch (error) {
      const message = String(error.message || "");
      if (/level change limit reached/i.test(message)) {
        return sendJson(response, 409, { error: "You have used all 6 academic level changes for this account." });
      }
      if (/invalid academic level/i.test(message)) {
        return sendJson(response, 400, { error: "Choose a valid academic level." });
      }
      if (/student account not found/i.test(message)) {
        return sendJson(response, 404, { error: "Your student account could not be found." });
      }
      console.error("Student level update failed:", message);
      return sendJson(response, 503, { error: "Could not save your level right now. Please try again shortly." });
    }
  }

  const registration = normalizeRegistration(payload.registration);
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!registration || password.length < 8 || password.length > 128) {
    return sendJson(response, 400, { error: "Enter your registration number and a password of at least 8 characters." });
  }

  try {
    let account;
    if (mode === "signup") {
      const fullName = typeof payload.fullName === "string" ? payload.fullName.trim().replace(/\s+/g, " ") : "";
      const phone = normalizePhone(payload.phone);
      const level = normalizeLevel(payload.level);
      if (fullName.length < 3 || fullName.length > 120 || nameTokens(fullName).length < 2 || !phone || !level || payload.consent !== true) {
        return sendJson(response, 400, { error: "Enter your full name, level, a valid WhatsApp number, and agree to study reminders." });
      }
      const salt = randomBytes(16).toString("hex");
      const hash = (await derivePassword(password, salt)).toString("hex");
      account = { reg_number: registration, full_name: fullName, phone_number: phone, academic_level: level, password_salt: salt, password_hash: hash };
      await supabaseRequest(config, "rpc/create_foldbook_student_account", "", {
        method: "POST",
        body: {
          p_reg_number: registration,
          p_full_name: fullName,
          p_phone_number: phone,
          p_academic_level: level,
          p_password_salt: salt,
          p_password_hash: hash,
        },
      });
      response.setHeader("Set-Cookie", cookie(encodeSession(account), request));
      return sendJson(response, 200, {
        student: { role: "student", registration, name: fullName, phoneNumber: phone, level, levelChangeCount: 0 },
        contactSaved: true,
      });
    }

    if (mode !== "login") return sendJson(response, 400, { error: "Choose create account or log in." });
    const found = await supabaseRequest(config, "student_accounts",
      `?select=reg_number,full_name,phone_number,academic_level,level_change_count,password_salt,password_hash&reg_number=eq.${encodeURIComponent(registration)}&limit=1`);
    account = found?.[0];
    if (!account) return sendJson(response, 401, { error: "No account found for that matric number. Choose Create account first." });
    const candidate = await derivePassword(password, account.password_salt);
    const stored = Buffer.from(account.password_hash, "hex");
    if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
      return sendJson(response, 401, { error: "That password does not match this account." });
    }
    response.setHeader("Set-Cookie", cookie(encodeSession(account), request));
    return sendJson(response, 200, {
      student: { role: "student", registration: account.reg_number, name: account.full_name, phoneNumber: account.phone_number, level: account.academic_level || "100L", levelChangeCount: Number.isInteger(account.level_change_count) ? account.level_change_count : 0 },
      contactSaved: true,
    });
  } catch (error) {
    console.error("Student authentication failed:", error.message);
    const message = String(error.message || "");
    if (/duplicate key|already exists/i.test(message)) {
      return sendJson(response, 409, { error: "An account already exists for this matric number. Choose Log in instead." });
    }
    if (/already connected to another student/i.test(message)) {
      return sendJson(response, 409, { error: "That WhatsApp number is already connected to another student account." });
    }
    return sendJson(response, 503, { error: "Could not reach the student database. Please try again shortly." });
  }
};

module.exports.readSession = readSession;
module.exports.isSameOriginRequest = isSameOriginRequest;
module.exports.sendJson = sendJson;
