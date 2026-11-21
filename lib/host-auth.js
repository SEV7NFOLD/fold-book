"use strict";

// Sessions for quiz hosts (lecturers and class reps). Same signing secret as the admin
// session, but a different cookie and role, so a host session can never pass as admin.
const { createHmac } = require("node:crypto");
const { isSameOrigin, secureEqual } = require("./admin-auth.js");
const { sendJson, supabaseRequest } = require("./admin-data.js");

const HOST_COOKIE = "foldbook_host";
const HOST_SESSION_SECONDS = 30 * 24 * 60 * 60;

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function createHostSession(hostId, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ role: "host", hostId, expiresAt: now + HOST_SESSION_SECONDS * 1000 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function readHostSession(request, secret, now = Date.now()) {
  if (!secret) return null;
  const cookie = (request.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${HOST_COOKIE}=`));
  if (!cookie) return null;
  const [payload, signature, ...extra] = cookie.slice(HOST_COOKIE.length + 1).split(".");
  if (!payload || !signature || extra.length || !secureEqual(signature, sign(payload, secret))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (session.role !== "host" || !/^[0-9a-f-]{36}$/i.test(session.hostId || "")) return null;
    return Number.isFinite(session.expiresAt) && session.expiresAt > now ? session : null;
  } catch {
    return null;
  }
}

function hostCookie(value, request, maxAge = HOST_SESSION_SECONDS) {
  const secure = process.env.NODE_ENV === "production" || request.headers["x-forwarded-proto"] === "https";
  return `${HOST_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/admin; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

const HOST_FIELDS = "id,email,name,role,courses,level,status";

// Returns the signed-in, active host, or sends 401/403 and returns null.
async function authorizeHost(request, response) {
  if (!isSameOrigin(request)) {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return null;
  }
  const session = readHostSession(request, process.env.FOLDBOOK_ADMIN_SESSION_SECRET);
  if (!session) {
    sendJson(response, 401, { error: "Sign in with your email code to host quizzes." });
    return null;
  }
  const host = (await supabaseRequest(`foldbook_hosts?select=${HOST_FIELDS}&id=eq.${session.hostId}&limit=1`))?.[0];
  if (!host || host.status !== "active") {
    sendJson(response, 401, { error: "This host account isn’t active. Ask the FoldBook admin." });
    return null;
  }
  return host;
}

module.exports = { HOST_FIELDS, authorizeHost, createHostSession, hostCookie, readHostSession };
