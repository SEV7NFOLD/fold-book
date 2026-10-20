"use strict";

const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../lib/admin-data.js");

const LEVELS = new Set(["100L", "200L", "300L", "400L"]);
const COURSE_CODE = /^[A-Z]{2,5}\s?\d{3,4}$/i;

module.exports = async function adminCourseCatalogHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!authorizeAdmin(request, response)) return;
  let payload;
  try { payload = await readBody(request); } catch (error) {
    sendJson(response, error.status || 400, { error: error.status ? error.message : "Request body must be valid JSON." });
    return;
  }

  try {
    if (payload?.action === "list") {
      const courses = await supabaseRequest("course_catalog?select=level,course_code,title,credit_units&order=level.asc,course_code.asc");
      sendJson(response, 200, { courses });
      return;
    }
    const { level, courseCode, title, creditUnits } = payload || {};
    if (!LEVELS.has(level) || typeof courseCode !== "string" || !COURSE_CODE.test(courseCode)
      || typeof title !== "string" || !title.trim() || title.trim().length > 120
      || !Number.isInteger(creditUnits) || creditUnits < 1 || creditUnits > 12) {
      if (payload?.action !== "delete") {
        sendJson(response, 400, { error: "Provide a valid level, course code, title, and credit unit count." });
        return;
      }
    }
    const normalizedCode = typeof courseCode === "string" ? courseCode.trim().toUpperCase().replace(/\s+/g, " ") : "";
    if (payload?.action === "upsert") {
      await supabaseRequest("course_catalog?on_conflict=level,course_code", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ level, course_code: normalizedCode, title: title.trim(), credit_units: creditUnits }),
      });
      sendJson(response, 200, { ok: true });
      return;
    }
    if (payload?.action === "delete" && LEVELS.has(level) && COURSE_CODE.test(courseCode || "")) {
      await supabaseRequest(`course_catalog?level=eq.${encodeURIComponent(level)}&course_code=eq.${encodeURIComponent(normalizedCode)}`, { method: "DELETE" });
      sendJson(response, 200, { ok: true });
      return;
    }
    sendJson(response, 400, { error: "Choose a supported course catalog action." });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Course catalog request failed." });
  }
};
