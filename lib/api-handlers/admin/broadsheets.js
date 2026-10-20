"use strict";

const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../admin-data.js");

const LEVELS = new Set(["100L", "200L", "300L", "400L"]);
const COURSE_CODE = /^[A-Z]{2,5}\s?\d{3,4}$/i;

function validRecord(record) {
  return record && typeof record === "object" && !Array.isArray(record)
    && typeof record.reg_number === "string" && record.reg_number.length <= 40
    && typeof record.full_name === "string" && record.full_name.trim().length > 1 && record.full_name.length <= 120
    && typeof record.course_code === "string" && COURSE_CODE.test(record.course_code)
    && typeof record.course_title === "string" && record.course_title.trim().length > 0 && record.course_title.length <= 160
    && Number.isInteger(record.ca) && record.ca >= 0 && record.ca <= 30
    && Number.isInteger(record.exam) && record.exam >= 0 && record.exam <= 70
    && Number.isInteger(record.total) && record.total >= 0 && record.total <= 100
    && typeof record.grade === "string" && /^[A-F]$/.test(record.grade)
    && ["PASS", "FAIL"].includes(record.remark)
    && LEVELS.has(record.level);
}

module.exports = async function adminBroadsheetsHandler(request, response) {
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
  if (payload?.action === "list") {
    try {
      const rows = await supabaseRequest("student_results?select=reg_number,full_name,course_code,course_title,ca,exam,total,grade,remark&order=full_name.asc&limit=5000");
      const students = new Map();
      for (const row of rows) {
        if (!students.has(row.reg_number)) students.set(row.reg_number, { name: row.full_name, results: [] });
        students.get(row.reg_number).results.push({
          course: row.course_code, course_title: row.course_title, ca: row.ca,
          exam: row.exam, total: row.total, grade: row.grade, remark: row.remark,
        });
      }
      sendJson(response, 200, { students: Object.fromEntries(students) });
    } catch (error) {
      sendJson(response, 502, { error: error.message || "Broadsheets could not be loaded." });
    }
    return;
  }
  const records = payload?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 5000 || !records.every(validRecord)) {
    sendJson(response, 400, { error: "The broadsheet contains invalid records or exceeds the 5,000 row limit." });
    return;
  }
  try {
    await supabaseRequest("student_results?on_conflict=reg_number,course_code", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(records),
    });
    sendJson(response, 200, { ok: true, imported: records.length });
  } catch (error) {
    sendJson(response, 502, { error: error.message || "Broadsheet import failed." });
  }
};
