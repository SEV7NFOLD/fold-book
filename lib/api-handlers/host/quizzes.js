"use strict";

// Quiz Studio for hosts: the same quiz engine as the admin studio, limited to the host's
// own quizzes. Lecturers host for their courses; class reps host for their own level.
const crypto = require("node:crypto");
const { readBody, sendJson, supabaseRequest } = require("../../admin-data.js");
const { authorizeHost } = require("../../host-auth.js");
const { helpers } = require("../admin/quizzes.js");

const { QUIZ_FIELDS, REG, ID, TYPES, cleanQuestions, cleanSeconds, hostState, control, quizReport } = helpers;
const FIELDS = `${QUIZ_FIELDS},host_id`;
const COURSE = /^[A-Z]{2,5}\s?\d{3,4}$/;
const LEVEL = /^(100L|200L|300L|400L)$/;

function normalCourse(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/^([A-Z]+)(\d)/, "$1 $2");
}

// What this host may set as the course and audience of a quiz.
function checkScope(host, payload) {
  const course = normalCourse(payload.course_code);
  if (!COURSE.test(course)) return { error: "Choose a valid course, for example ECO 210." };
  if (host.role === "lecturer") {
    const allowed = (host.courses || []).map(normalCourse);
    if (allowed.length && !allowed.includes(course)) return { error: `You can host quizzes for ${allowed.join(", ")}.` };
    const target = ["all", "level", "students"].includes(payload.target_type) ? payload.target_type : "all";
    if (target === "level" && !LEVEL.test(payload.target_level || "")) return { error: "Choose the level this quiz is for." };
    const registrations = Array.isArray(payload.target_registrations)
      ? [...new Set(payload.target_registrations.map((x) => String(x).trim().toUpperCase()).filter(Boolean))] : [];
    if (target === "students" && (!registrations.length || registrations.some((x) => !REG.test(x)))) return { error: "Check the registration numbers." };
    return { course, target, level: target === "level" ? payload.target_level : null, registrations: target === "students" ? registrations : [] };
  }
  // Class reps: always their own level.
  if (!LEVEL.test(host.level || "")) return { error: "Your host account has no level yet. Ask the FoldBook admin." };
  return { course, target: "level", level: host.level, registrations: [] };
}

module.exports = async function hostQuizHandler(request, response) {
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return sendJson(response, 405, { error: "Method not allowed." }); }
  let host;
  try { host = await authorizeHost(request, response); } catch (error) {
    console.error("Host check failed:", error.message);
    return sendJson(response, 502, { error: "The quiz service could not complete this request." });
  }
  if (!host) return;
  let payload;
  try { payload = await readBody(request); } catch { return sendJson(response, 400, { error: "Enter valid quiz details." }); }
  try {
    const action = payload?.action;
    if (action === "list") {
      const rows = await supabaseRequest(`foldbook_quizzes?select=${FIELDS},foldbook_quiz_participants(display_name,score)&host_id=eq.${host.id}&order=created_at.desc&limit=40`);
      return sendJson(response, 200, { quizzes: rows || [] });
    }
    if (action === "create") {
      const questions = cleanQuestions(payload.questions);
      const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 120) : "";
      if (title.length < 3) return sendJson(response, 400, { error: "Give the quiz a title of at least 3 characters." });
      if (!questions) return sendJson(response, 400, { error: "Add 3 to 30 questions, each with options and a correct answer." });
      const scope = checkScope(host, payload);
      if (scope.error) return sendJson(response, 400, { error: scope.error });
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const joinCode = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
      const rows = await supabaseRequest("foldbook_quizzes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        join_code: joinCode, title, course_code: scope.course, target_type: scope.target, target_level: scope.level,
        target_registrations: scope.registrations, quiz_type: TYPES.has(payload.quiz_type) ? payload.quiz_type : "open",
        status: "draft", phase: "question", questions, current_question: -1,
        question_seconds: cleanSeconds(payload.question_seconds), host_id: host.id,
      }) });
      return sendJson(response, 201, { quiz: rows?.[0] || null });
    }

    const id = String(payload?.id || "");
    if (!ID.test(id)) return sendJson(response, 400, { error: "Choose a valid quiz." });
    const quiz = (await supabaseRequest(`foldbook_quizzes?select=${FIELDS}&id=eq.${encodeURIComponent(id)}&host_id=eq.${host.id}&limit=1`))?.[0];
    if (!quiz) return sendJson(response, 404, { error: "That quiz isn’t one of yours, or it no longer exists." });

    if (action === "host_state") return sendJson(response, 200, await hostState(quiz));
    if (action === "report") return sendJson(response, 200, await quizReport(quiz));
    if (action === "control") {
      const result = await control(quiz, String(payload.step || ""), Number.isInteger(payload.expected_question) ? payload.expected_question : undefined);
      if (result.error) return sendJson(response, 409, { error: result.error });
      const fresh = result.quiz || (await supabaseRequest(`foldbook_quizzes?select=${FIELDS}&id=eq.${encodeURIComponent(id)}&limit=1`))?.[0];
      return sendJson(response, 200, await hostState(fresh));
    }
    if (action === "update") {
      const answered = await supabaseRequest(`foldbook_quiz_answers?select=id&quiz_id=eq.${encodeURIComponent(id)}&limit=1`);
      const editable = quiz.status === "draft" || quiz.status === "lobby" || (quiz.quiz_type === "open" && quiz.status === "live" && !answered?.length);
      if (!editable) return sendJson(response, 409, { error: "This quiz has already started, so its questions can’t be changed." });
      const questions = cleanQuestions(payload.questions);
      const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 120) : quiz.title;
      if (title.length < 3 || !questions) return sendJson(response, 400, { error: "Check the title and questions." });
      const patch = { title, questions };
      if (payload.question_seconds !== undefined) patch.question_seconds = cleanSeconds(payload.question_seconds);
      const rows = await supabaseRequest(`foldbook_quizzes?id=eq.${encodeURIComponent(id)}&host_id=eq.${host.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      return sendJson(response, 200, { quiz: rows?.[0] || null });
    }
    if (action === "remove_participant") {
      const reg = String(payload.reg_number || "").trim().toUpperCase();
      if (!REG.test(reg)) return sendJson(response, 400, { error: "Choose a valid player to remove." });
      const filter = `quiz_id=eq.${encodeURIComponent(id)}&reg_number=eq.${encodeURIComponent(reg)}`;
      await supabaseRequest(`foldbook_quiz_answers?${filter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      await supabaseRequest(`foldbook_quiz_participants?${filter}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return sendJson(response, 200, { ok: true });
    }
    if (action === "delete") {
      if (!["draft", "finished"].includes(quiz.status)) return sendJson(response, 409, { error: "End the quiz before deleting it." });
      await supabaseRequest(`foldbook_quizzes?id=eq.${encodeURIComponent(id)}&host_id=eq.${host.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return sendJson(response, 200, { ok: true });
    }
    return sendJson(response, 400, { error: "Choose a valid quiz action." });
  } catch (error) {
    console.error("Host quiz request failed:", error.message);
    return sendJson(response, 502, { error: "The quiz service could not complete this request." });
  }
};
