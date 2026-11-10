"use strict";
const crypto = require("crypto");

const { authorizeAdmin, readBody, sendJson, supabaseRequest } = require("../../admin-data.js");

const REG = /^(?:[0-9]{12}[A-Z]{2}|[0-9]{2}\/SS\/EC\/[0-9]{1,4})$/;
const ID = /^[0-9a-f-]{36}$/i;
const TYPES = new Set(["open", "contest"]);
// Students see a short "get ready" countdown before each contest question opens.
const LEAD_IN_MS = 3000;

function cleanQuestions(value) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 30) return null;
  const out = [];
  for (const item of value) {
    if (!item || typeof item.prompt !== "string" || item.prompt.trim().length < 5 || item.prompt.length > 500
      || !Array.isArray(item.options) || item.options.length < 2 || item.options.length > 6
      || item.options.some((option) => typeof option !== "string" || !option.trim() || option.length > 180)
      || !Number.isInteger(item.answerIndex) || item.answerIndex < 0 || item.answerIndex >= item.options.length) return null;
    out.push({
      prompt: item.prompt.trim(),
      options: item.options.map((x) => x.trim()),
      answerIndex: item.answerIndex,
      explanation: typeof item.explanation === "string" ? item.explanation.trim().slice(0, 400) : "",
    });
  }
  return out;
}

function cleanSeconds(value) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 5 && seconds <= 120 ? seconds : 20;
}

const QUIZ_FIELDS = "id,join_code,title,course_code,target_type,target_level,target_registrations,quiz_type,status,phase,current_question,question_seconds,question_started_at,created_at,started_at,finished_at,questions";

async function loadQuiz(id) {
  const rows = await supabaseRequest(`foldbook_quizzes?select=${QUIZ_FIELDS}&id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows?.[0] || null;
}

// Ranks by score, then by who answered more correctly, then by who joined first.
function rankPlayers(players) {
  return [...players].sort((a, b) => (b.score - a.score) || (b.correct_count - a.correct_count)
    || String(a.joined_at).localeCompare(String(b.joined_at)));
}

async function hostState(quiz) {
  const participants = (await supabaseRequest(
    `foldbook_quiz_participants?select=reg_number,display_name,score,answered_count,correct_count,joined_at,last_answered_at&quiz_id=eq.${encodeURIComponent(quiz.id)}&order=joined_at.asc&limit=1000`,
  )) || [];
  const players = participants.map((row) => ({
    reg_number: row.reg_number,
    display_name: row.display_name || "Student",
    score: Number(row.score) || 0,
    answered_count: Number(row.answered_count) || 0,
    correct_count: Number(row.correct_count) || 0,
    joined_at: row.joined_at,
    last_answered_at: row.last_answered_at,
  }));

  const total = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
  const index = Number.isInteger(quiz.current_question) ? quiz.current_question : -1;
  let distribution = [];
  let answeredCount = 0;
  const roundPoints = new Map();
  if (quiz.quiz_type === "contest" && quiz.status !== "draft" && index >= 0 && quiz.questions?.[index]) {
    const answers = (await supabaseRequest(
      `foldbook_quiz_answers?select=reg_number,answer_index,points&quiz_id=eq.${encodeURIComponent(quiz.id)}&question_index=eq.${index}&limit=1000`,
    )) || [];
    distribution = quiz.questions[index].options.map(() => 0);
    for (const answer of answers) {
      if (Number.isInteger(answer.answer_index) && answer.answer_index < distribution.length) distribution[answer.answer_index] += 1;
      roundPoints.set(answer.reg_number, Number(answer.points) || 0);
    }
    answeredCount = answers.length;
  }

  const ranked = rankPlayers(players);
  // Previous ranking = everyone's score before this question's points, for the ▲/▼ markers.
  const previous = rankPlayers(players.map((player) => ({ ...player, score: player.score - (roundPoints.get(player.reg_number) || 0) })));
  const previousRank = new Map(previous.map((player, position) => [player.reg_number, position + 1]));
  const leaderboard = ranked.map((player, position) => ({
    ...player,
    rank: position + 1,
    previous_rank: previousRank.get(player.reg_number) || position + 1,
    round_points: roundPoints.get(player.reg_number) || 0,
    finished: total > 0 && player.answered_count >= total,
  }));

  return {
    quiz,
    players: leaderboard,
    playerCount: players.length,
    answeredCount,
    distribution,
    totalQuestions: total,
    serverNow: Date.now(),
  };
}

// Applies a phase change only when the quiz is still where the host saw it, so a double tap
// or an auto-advance racing a click can't skip a question.
async function guardedPatch(quiz, filters, patch) {
  const query = Object.entries(filters).map(([key, value]) => `&${key}=eq.${encodeURIComponent(value)}`).join("");
  const rows = await supabaseRequest(`foldbook_quizzes?id=eq.${encodeURIComponent(quiz.id)}${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return rows?.[0] || null;
}

async function control(quiz, step, expectedQuestion) {
  const now = new Date();
  const total = quiz.questions?.length || 0;
  const expected = Number.isInteger(expectedQuestion) ? expectedQuestion : quiz.current_question;
  switch (step) {
    case "open_lobby":
      if (quiz.quiz_type !== "contest" || quiz.status !== "draft") return { error: "Only a draft contest can open a lobby." };
      return { quiz: await guardedPatch(quiz, { status: "draft" }, { status: "lobby", current_question: -1, phase: "question" }) };
    case "publish":
      if (quiz.quiz_type !== "open" || quiz.status !== "draft") return { error: "Only a draft open quiz can be published." };
      return { quiz: await guardedPatch(quiz, { status: "draft" }, { status: "live", current_question: 0, phase: "question", started_at: now.toISOString() }) };
    case "start":
      if (quiz.quiz_type !== "contest" || quiz.status !== "lobby") return { error: "Open the lobby before starting." };
      return { quiz: await guardedPatch(quiz, { status: "lobby" }, {
        status: "live", current_question: 0, phase: "question", started_at: now.toISOString(),
        question_started_at: new Date(now.getTime() + LEAD_IN_MS).toISOString(),
      }) };
    case "reveal":
      if (quiz.status !== "live" || quiz.quiz_type !== "contest") return { error: "The contest isn’t running." };
      return { quiz: await guardedPatch(quiz, { status: "live", phase: "question", current_question: expected }, { phase: "reveal" }) };
    case "leaderboard":
      if (quiz.status !== "live" || quiz.quiz_type !== "contest") return { error: "The contest isn’t running." };
      return { quiz: await guardedPatch(quiz, { status: "live", phase: "reveal", current_question: expected }, { phase: "leaderboard" }) };
    case "next": {
      if (quiz.status !== "live" || quiz.quiz_type !== "contest") return { error: "The contest isn’t running." };
      if (expected + 1 >= total) return { error: "That was the last question. Show the final results instead." };
      return { quiz: await guardedPatch(quiz, { status: "live", current_question: expected }, {
        current_question: expected + 1, phase: "question",
        question_started_at: new Date(now.getTime() + LEAD_IN_MS).toISOString(),
      }) };
    }
    case "finish":
      if (quiz.status === "finished") return { quiz };
      if (quiz.status === "draft") return { error: "A draft hasn’t started yet. Delete it instead." };
      return { quiz: await guardedPatch(quiz, {}, { status: "finished", finished_at: now.toISOString() }) };
    default:
      return { error: "Choose a valid quiz action." };
  }
}

module.exports = async function adminQuizHandler(request, response) {
  if (!authorizeAdmin(request, response)) return;
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return sendJson(response, 405, { error: "Method not allowed." }); }
  let payload;
  try { payload = await readBody(request); } catch { return sendJson(response, 400, { error: "Enter valid quiz details." }); }
  try {
    const action = payload?.action;
    if (action === "list") {
      const rows = await supabaseRequest(`foldbook_quizzes?select=${QUIZ_FIELDS},foldbook_quiz_participants(display_name,score)&order=created_at.desc&limit=40`);
      return sendJson(response, 200, { quizzes: rows || [] });
    }
    if (action === "create") {
      const questions = cleanQuestions(payload.questions);
      const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 120) : "";
      const type = TYPES.has(payload.quiz_type) ? payload.quiz_type : "open";
      const target = ["all", "level", "students"].includes(payload.target_type) ? payload.target_type : "all";
      const registrations = Array.isArray(payload.target_registrations)
        ? [...new Set(payload.target_registrations.map((x) => String(x).trim().toUpperCase()).filter(Boolean))] : [];
      if (title.length < 3 || !questions || !(/^[A-Z]{2,5}\s?\d{3,4}$/i.test(payload.course_code || ""))
        || (target === "level" && !/^(100L|200L|300L|400L)$/.test(payload.target_level || ""))
        || registrations.some((x) => !REG.test(x)) || (target === "students" && !registrations.length))
        return sendJson(response, 400, { error: "Check title, course, audience and questions." });
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const joinCode = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
      const rows = await supabaseRequest("foldbook_quizzes", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
        join_code: joinCode, title, course_code: payload.course_code.trim().toUpperCase(), target_type: target,
        target_level: target === "level" ? payload.target_level : null, target_registrations: target === "students" ? registrations : [],
        quiz_type: type, status: "draft", phase: "question", questions, current_question: -1,
        question_seconds: cleanSeconds(payload.question_seconds),
      }) });
      return sendJson(response, 201, { quiz: rows?.[0] || null });
    }

    const id = String(payload?.id || "");
    if (!ID.test(id)) return sendJson(response, 400, { error: "Choose a valid quiz." });
    const quiz = await loadQuiz(id);
    if (!quiz) return sendJson(response, 404, { error: "That quiz no longer exists." });

    if (action === "host_state") return sendJson(response, 200, await hostState(quiz));
    if (action === "control") {
      const result = await control(quiz, String(payload.step || ""), Number.isInteger(payload.expected_question) ? payload.expected_question : undefined);
      if (result.error) return sendJson(response, 409, { error: result.error });
      // A guarded update that matched nothing means someone already moved the quiz on; report where it is now.
      return sendJson(response, 200, await hostState(result.quiz || await loadQuiz(id)));
    }
    if (action === "update") {
      // Questions can change until the quiz is under way: drafts, open lobbies, or an open quiz nobody has answered yet.
      const answered = await supabaseRequest(`foldbook_quiz_answers?select=id&quiz_id=eq.${encodeURIComponent(id)}&limit=1`);
      const editable = quiz.status === "draft" || quiz.status === "lobby" || (quiz.quiz_type === "open" && quiz.status === "live" && !answered?.length);
      if (!editable) return sendJson(response, 409, { error: "This quiz has already started, so its questions can’t be changed." });
      const questions = cleanQuestions(payload.questions);
      const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 120) : quiz.title;
      if (title.length < 3 || !questions) return sendJson(response, 400, { error: "Check the title and questions." });
      const patch = { title, questions };
      if (payload.question_seconds !== undefined) patch.question_seconds = cleanSeconds(payload.question_seconds);
      const rows = await supabaseRequest(`foldbook_quizzes?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
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
      await supabaseRequest(`foldbook_quizzes?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return sendJson(response, 200, { ok: true });
    }
    return sendJson(response, 400, { error: "Choose a valid admin quiz action." });
  } catch (error) {
    console.error("Admin quiz request failed:", error.message);
    return sendJson(response, 502, { error: "The quiz service could not complete this request." });
  }
};
