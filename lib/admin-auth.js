"use strict";

const { createHmac, timingSafeEqual } = require("node:crypto");

const ADMIN_COOKIE = "foldbook_admin";
const ADMIN_SESSION_SECONDS = 2 * 60 * 60;

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isSameOrigin(request) {
  const host = request.headers.host;
  if (!host) return false;

  // Browsers commonly omit Origin on same-origin GET requests. Prefer an
  // explicit Origin when present, then use Fetch Metadata or Referer as the
  // same-origin signal for those requests.
  if (request.headers.origin) {
    try {
      const origin = new URL(request.headers.origin).host;
      return origin.toLowerCase() === host.toLowerCase();
    } catch {
      return false;
    }
  }

  if (request.headers["sec-fetch-site"] === "same-origin") return true;

  try {
    const refererHost = new URL(request.headers.referer).host;
    return refererHost.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function createAdminSession(secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: now + ADMIN_SESSION_SECONDS * 1000,
    role: "admin",
  })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function isValidAdminSession(request, secret, now = Date.now()) {
  if (!secret) return false;
  const cookieHeader = request.headers.cookie || "";
  const cookie = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  if (!cookie) return false;
  const token = cookie.slice(ADMIN_COOKIE.length + 1);
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length || !secureEqual(signature, sign(payload, secret))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return session.role === "admin" && Number.isFinite(session.expiresAt) && session.expiresAt > now;
  } catch {
    return false;
  }
}

function adminCookie(value, request, maxAge = ADMIN_SESSION_SECONDS) {
  const secure = process.env.NODE_ENV === "production" || request.headers["x-forwarded-proto"] === "https";
  return `${ADMIN_COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

module.exports = {
  ADMIN_SESSION_SECONDS,
  adminCookie,
  createAdminSession,
  isSameOrigin,
  isValidAdminSession,
  secureEqual,
};
