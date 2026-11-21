"use strict";

// Admin: add, edit and switch off quiz hosts (lecturers and class reps).
const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../admin-data.js");
const { emailConfigured, sendEmail, emailLayout } = require("../../email.js");

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const LEVEL = /^(100L|200L|300L|400L)$/;
const COURSE = /^[A-Z]{2,5} ?\d{3,4}$/;
const ID = /^[0-9a-f-]{36}$/i;
const FIELDS = "id,email,name,role,courses,level,status,created_at,last_login_at";

function cleanCourses(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,;\n]/);
  // "eco211" and "ECO  211" both become "ECO 211".
  return [...new Set(list.map((item) => String(item).trim().toUpperCase().replace(/\s+/g, "").replace(/^([A-Z]+)(\d)/, "$1 $2")).filter(Boolean))].slice(0, 20);
}

function siteOrigin(request) {
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return host ? `https://${host}` : "";
}

module.exports = async function adminHostsHandler(request, response) {
  if (!authorizeAdmin(request, response)) return;
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return sendJson(response, 405, { error: "Method not allowed." }); }
  let payload;
  try { payload = await readBody(request); } catch { return sendJson(response, 400, { error: "Enter valid host details." }); }
  try {
    if (payload.action === "list") {
      const hosts = await supabaseRequest(`foldbook_hosts?select=${FIELDS}&order=created_at.desc&limit=200`);
      return sendJson(response, 200, { hosts: hosts || [], emailReady: emailConfigured() });
    }
    if (payload.action === "create") {
      const email = String(payload.email || "").trim().toLowerCase();
      const name = String(payload.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
      const role = payload.role === "rep" ? "rep" : "lecturer";
      const courses = cleanCourses(payload.courses);
      const level = role === "rep" ? String(payload.level || "") : null;
      if (!EMAIL.test(email) || name.length < 2) return sendJson(response, 400, { error: "Enter the host’s name and a valid email." });
      if (role === "rep" && !LEVEL.test(level)) return sendJson(response, 400, { error: "Choose the rep’s level." });
      if (courses.some((course) => !COURSE.test(course))) return sendJson(response, 400, { error: "Write courses like ECO 210, separated by commas." });
      const existing = await supabaseRequest(`foldbook_hosts?select=id&email=eq.${encodeURIComponent(email)}&limit=1`);
      if (existing?.length) return sendJson(response, 409, { error: "That email is already a host." });
      const rows = await supabaseRequest("foldbook_hosts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        email, name, role, courses: role === "lecturer" ? courses : [], level,
      }) });
      let invited = false;
      if (payload.invite !== false && emailConfigured()) {
        const link = `${siteOrigin(request)}/#host`;
        await sendEmail({
          to: email,
          subject: "You can now host quizzes on FoldBook",
          text: `Hello ${name},\n\nYou've been added as a FoldBook quiz host${role === "rep" ? ` for ${level}` : ""}. Open ${link}, enter this email, and we'll send you a sign-in code.\n\nFoldBook by SEV7N FOLD`,
          html: emailLayout({
            heading: "You can now host quizzes",
            lines: [
              `Hello ${name}, you've been added as a FoldBook quiz host${role === "rep" ? ` for ${level} students` : ""}.`,
              "Create live quizzes for class, let Dr. Eco draft questions from your notes, and see which questions your class found hardest.",
              "Open the link, enter this email, and we'll send you a sign-in code.",
            ],
            button: { href: link, label: "Open FoldBook host studio" },
          }),
        }).then(() => { invited = true; }).catch((error) => console.error("Host invite email failed:", error.message));
      }
      return sendJson(response, 201, { host: rows?.[0] || null, invited });
    }
    const id = String(payload.id || "");
    if (!ID.test(id)) return sendJson(response, 400, { error: "Choose a valid host." });
    if (payload.action === "update") {
      const patch = {};
      if (["active", "disabled"].includes(payload.status)) patch.status = payload.status;
      if (payload.courses !== undefined) {
        const courses = cleanCourses(payload.courses);
        if (courses.some((course) => !COURSE.test(course))) return sendJson(response, 400, { error: "Write courses like ECO 210, separated by commas." });
        patch.courses = courses;
      }
      if (payload.level !== undefined) {
        if (!LEVEL.test(String(payload.level))) return sendJson(response, 400, { error: "Choose a valid level." });
        patch.level = payload.level;
      }
      if (!Object.keys(patch).length) return sendJson(response, 400, { error: "Nothing to change." });
      const rows = await supabaseRequest(`foldbook_hosts?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      return sendJson(response, 200, { host: rows?.[0] || null });
    }
    return sendJson(response, 400, { error: "Choose a valid host action." });
  } catch (error) {
    console.error("Admin host request failed:", error.message);
    return sendJson(response, 502, { error: "Couldn’t save the host. If this is the first time, run supabase/2026-11-21-quiz-hosts.sql." });
  }
};
