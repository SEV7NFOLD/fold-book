"use strict";

// Host sign-in by email code: the host enters their email, gets a 6-digit code, enters it.
const crypto = require("node:crypto");
const { isSameOrigin } = require("../../admin-auth.js");
const { readBody, sendJson, supabaseRequest } = require("../../admin-data.js");
const { HOST_FIELDS, authorizeHost, createHostSession, hostCookie } = require("../../host-auth.js");
const { sendEmail, emailLayout } = require("../../email.js");

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CODE_MINUTES = 10;
const MAX_CODES_PER_15_MIN = 3;
const MAX_ATTEMPTS = 5;

function codeHash(email, code) {
  return crypto.createHmac("sha256", process.env.FOLDBOOK_ADMIN_SESSION_SECRET || "").update(`${email}:${code}`).digest("hex");
}

function publicHost(host) {
  return { name: host.name, email: host.email, role: host.role, courses: host.courses || [], level: host.level || null };
}

module.exports = async function hostAuthHandler(request, response) {
  if (request.method === "GET") {
    const host = await authorizeHost(request, response).catch(() => null);
    if (host) sendJson(response, 200, { host: publicHost(host) });
    else if (!response.headersSent && !response.writableEnded) sendJson(response, 401, { error: "Not signed in." });
    return;
  }
  if (request.method === "DELETE") {
    response.setHeader("Set-Cookie", hostCookie("", request, 0));
    return sendJson(response, 200, { ok: true });
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST, DELETE");
    return sendJson(response, 405, { error: "Method not allowed." });
  }
  if (!isSameOrigin(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  if (!process.env.FOLDBOOK_ADMIN_SESSION_SECRET) return sendJson(response, 503, { error: "Host sign-in isn’t configured." });

  let payload;
  try { payload = await readBody(request); } catch { return sendJson(response, 400, { error: "Enter your email." }); }
  const email = String(payload?.email || "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 160) return sendJson(response, 400, { error: "Enter a valid email address." });
  const emailFilter = `email=eq.${encodeURIComponent(email)}`;

  try {
    if (payload.action === "send-code") {
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const recent = await supabaseRequest(`foldbook_host_codes?select=id&${emailFilter}&created_at=gte.${since}&limit=10`);
      if ((recent || []).length >= MAX_CODES_PER_15_MIN) {
        return sendJson(response, 429, { error: "Too many codes requested. Wait 15 minutes and try again." });
      }
      const host = (await supabaseRequest(`foldbook_hosts?select=${HOST_FIELDS}&${emailFilter}&limit=1`))?.[0];
      // The same reply whether or not the email is a host, so the form can't be used to find hosts.
      const reply = { ok: true, message: `If ${email} is a FoldBook host, a sign-in code is on its way. Check your inbox and spam folder.` };
      if (!host || host.status !== "active") return sendJson(response, 200, reply);
      const code = String(crypto.randomInt(100000, 1000000));
      await supabaseRequest("foldbook_host_codes", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ email, code_hash: codeHash(email, code), expires_at: new Date(Date.now() + CODE_MINUTES * 60 * 1000).toISOString() }),
      });
      await sendEmail({
        to: email,
        subject: `${code} is your FoldBook sign-in code`,
        text: `Hello ${host.name},\n\nYour FoldBook host sign-in code is ${code}. It expires in ${CODE_MINUTES} minutes.\n\nIf you didn't ask for it, you can ignore this email.\n\nFoldBook by SEV7N FOLD`,
        html: emailLayout({
          heading: "Your sign-in code",
          lines: [`Hello ${host.name}, use this code to sign in and host quizzes on FoldBook. It expires in ${CODE_MINUTES} minutes.`],
          code,
        }),
      });
      return sendJson(response, 200, reply);
    }

    if (payload.action === "verify") {
      const code = String(payload.code || "").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) return sendJson(response, 400, { error: "Enter the 6-digit code from your email." });
      const now = new Date().toISOString();
      const row = (await supabaseRequest(
        `foldbook_host_codes?select=id,code_hash,attempts&${emailFilter}&used=eq.false&expires_at=gt.${now}&order=created_at.desc&limit=1`,
      ))?.[0];
      if (!row || row.attempts >= MAX_ATTEMPTS) return sendJson(response, 400, { error: "This code has expired. Ask for a new one." });
      if (row.code_hash !== codeHash(email, code)) {
        await supabaseRequest(`foldbook_host_codes?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ attempts: row.attempts + 1 }) });
        return sendJson(response, 400, { error: "That code isn’t right. Check the email and try again." });
      }
      const host = (await supabaseRequest(`foldbook_hosts?select=${HOST_FIELDS}&${emailFilter}&limit=1`))?.[0];
      if (!host || host.status !== "active") return sendJson(response, 401, { error: "This host account isn’t active. Ask the FoldBook admin." });
      await supabaseRequest(`foldbook_host_codes?id=eq.${row.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ used: true }) });
      await supabaseRequest(`foldbook_hosts?id=eq.${host.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_login_at: now }) });
      response.setHeader("Set-Cookie", hostCookie(createHostSession(host.id, process.env.FOLDBOOK_ADMIN_SESSION_SECRET), request));
      return sendJson(response, 200, { host: publicHost(host) });
    }
    return sendJson(response, 400, { error: "Choose a valid sign-in step." });
  } catch (error) {
    console.error("Host sign-in failed:", error.message);
    return sendJson(response, error.status || 502, { error: error.status === 503 ? error.message : "Sign-in isn’t working just now. Try again shortly." });
  }
};
