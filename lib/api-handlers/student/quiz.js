"use strict";
const { readSession, isSameOriginRequest, sendJson } = require("../../../api/student/auth.js");

const MAX_BODY = 18000;
// Network grace after the timer hits zero, so an answer tapped at 0.2 s still counts.
const ANSWER_GRACE_MS = 1500;

async function readBody(request) {
  if (request.body !== undefined) {
    const text = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(text) > MAX_BODY) throw new RangeError();
    return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  }
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY) throw new RangeError(); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function dbConfig() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Database unavailable");
  return { url: url.replace(/\/$/, ""), key };
}

async function db(path, options = {}) {
  const config = dbConfig();
  const result = await fetch(`${config.url}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
  });
  const text = await result.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* minimal responses are empty */ }
  if (!result.ok) {
    console.error("Student quiz database error:", result.status, text.slice(0, 300));
    throw new Error("Database request failed");
  }
  return json;
}

function joinCode(value) {
  return typeof value === "string" && /^[A-Z0-9]{6}$/.test(value.toUpperCase()) ? value.toUpperCase() : "";
}

function publicQuiz(quiz) {
  return {
    id: quiz.id, join_code: quiz.join_code, title: quiz.title, course_code: quiz.course_code,
    quiz_type: quiz.quiz_type, status: quiz.status, phase: quiz.phase || "question",
    current_question: quiz.current_question, question_seconds: quiz.question_seconds || 20,
    question_started_at: quiz.question_started_at, total_questions: Array.isArray(quiz.questions) ? quiz.questions.length : 0,
  };
}

function canSee(quiz, session, registration) {
  if (quiz.target_type === "level") return quiz.target_level === session.level;
  if (quiz.target_type === "students") return Boolean(quiz.target_registrations?.includes(registration));
  return true;
}

function rankPlayers(players) {
  return [...players].sort((a, b) => (b.score - a.score) || (b.correct_count - a.correct_count)
    || String(a.joined_at).localeCompare(String(b.joined_at)));
}

async function standings(quiz, registration) {
  const rows = (await db(`foldbook_quiz_participants?select=reg_number,display_name,score,correct_count,joined_at&quiz_id=eq.${encodeURIComponent(quiz.id)}&limit=1000`)) || [];
  const ranked = rankPlayers(rows.map((row) => ({ ...row, score: Number(row.score) || 0, correct_count: Number(row.correct_count) || 0 })));
  const position = ranked.findIndex((row) => row.reg_number === registration);
  return {
    playerCount: ranked.length,
    myRank: position >= 0 ? position + 1 : null,
    top: ranked.slice(0, 5).map((row, index) => ({ rank: index + 1, name: row.display_name || "Student", score: row.score, me: row.reg_number === registration })),
  };
}

function questionFor(quiz, index, reveal) {
  const question = quiz.questions?.[index];
  if (!question) return null;
  const out = { prompt: question.prompt, options: question.options };
  if (reveal) { out.answerIndex = question.answerIndex; out.explanation = question.explanation || ""; }
  return out;
}

module.exports = async function studentQuiz(request, response) {
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  const session = readSession(request);
  if (!session) return sendJson(response, 401, { error: "Please sign in again." });
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
  let payload;
  try { payload = await readBody(request); } catch { return sendJson(response, 400, { error: "Enter valid quiz details." }); }
  const registration = String(session.registration || "").toUpperCase();
  const action = payload?.action;

  try {
    if (action === "list") {
      const level = String(payload.level || session.level || "");
      const course = String(payload.courseCode || "").toUpperCase();
      const rows = await db("foldbook_quizzes?select=id,join_code,title,course_code,quiz_type,status,phase,current_question,question_seconds,question_started_at,target_type,target_level,target_registrations,questions&status=in.(lobby,live)&order=created_at.desc&limit=50");
      const quizzes = (rows || [])
        .filter((quiz) => canSee(quiz, { ...session, level }, registration))
        .filter((quiz) => !course || !quiz.course_code || quiz.course_code === course)
        .map(publicQuiz);
      return sendJson(response, 200, { quizzes });
    }

    const code = joinCode(payload?.joinCode);
    if (!code) return sendJson(response, 400, { error: "Enter the six-character quiz code." });
    const quiz = (await db(`foldbook_quizzes?select=*&join_code=eq.${encodeURIComponent(code)}&limit=1`))?.[0];
    if (!quiz) return sendJson(response, 404, { error: "We couldn’t find that quiz code." });
    if (quiz.target_type === "level" && quiz.target_level !== session.level) return sendJson(response, 403, { error: "This quiz is for a different level." });
    if (quiz.target_type === "students" && !quiz.target_registrations?.includes(registration)) return sendJson(response, 403, { error: "Your account isn’t on this quiz’s invite list." });

    if (action === "join") {
      if (quiz.status === "draft") return sendJson(response, 409, { error: "This quiz hasn’t opened yet. Ask your host to open the lobby." });
      if (quiz.status === "finished") return sendJson(response, 409, { error: "This quiz has ended." });
      await db("foldbook_quiz_participants?on_conflict=quiz_id,reg_number", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ quiz_id: quiz.id, reg_number: registration, display_name: String(session.name || "Student").slice(0, 100) }),
      });
      return sendJson(response, 200, { quiz: publicQuiz(quiz) });
    }

    const me = (await db(`foldbook_quiz_participants?select=score,answered_count,correct_count&quiz_id=eq.${encodeURIComponent(quiz.id)}&reg_number=eq.${encodeURIComponent(registration)}&limit=1`))?.[0];
    if (!me) return sendJson(response, 403, { error: "You’re not in this quiz right now. Enter the code to join again." });
    const mine = { score: Number(me.score) || 0, answered: Number(me.answered_count) || 0, correct: Number(me.correct_count) || 0 };
    const total = Array.isArray(quiz.questions) ? quiz.questions.length : 0;

    if (action === "state") {
      const out = { quiz: publicQuiz(quiz), me: mine, serverNow: Date.now() };
      if (quiz.status === "lobby") {
        out.playerCount = (await standings(quiz, registration)).playerCount;
        return sendJson(response, 200, out);
      }
      if (quiz.status === "finished") {
        Object.assign(out, await standings(quiz, registration));
        return sendJson(response, 200, out);
      }
      if (quiz.quiz_type === "open") {
        const answered = (await db(`foldbook_quiz_answers?select=question_index&quiz_id=eq.${encodeURIComponent(quiz.id)}&reg_number=eq.${encodeURIComponent(registration)}`)) || [];
        const done = new Set(answered.map((row) => row.question_index));
        const next = (quiz.questions || []).findIndex((_, index) => !done.has(index));
        out.questionIndex = next;
        out.studentFinished = next < 0;
        if (next >= 0) out.question = questionFor(quiz, next, false);
        else Object.assign(out, await standings(quiz, registration));
        return sendJson(response, 200, out);
      }
      // Live contest: the question is always visible; the answer only once the host reveals it.
      const index = quiz.current_question;
      const phase = quiz.phase || "question";
      out.questionIndex = index;
      out.question = questionFor(quiz, index, phase !== "question");
      const answer = (await db(`foldbook_quiz_answers?select=answer_index,is_correct,points&quiz_id=eq.${encodeURIComponent(quiz.id)}&reg_number=eq.${encodeURIComponent(registration)}&question_index=eq.${index}&limit=1`))?.[0];
      out.myAnswer = answer
        ? (phase === "question" ? { answerIndex: answer.answer_index } : { answerIndex: answer.answer_index, correct: answer.is_correct, points: answer.points })
        : null;
      // Hold back this question's points until the reveal, so the score can't give the answer away.
      if (answer && phase === "question") {
        out.me = { ...mine, score: mine.score - (Number(answer.points) || 0), correct: mine.correct - (answer.is_correct ? 1 : 0) };
      }
      if (phase === "leaderboard") Object.assign(out, await standings(quiz, registration));
      out.isLastQuestion = index >= total - 1;
      return sendJson(response, 200, out);
    }

    if (action === "answer") {
      const questionIndex = Number(payload.questionIndex);
      const answerIndex = Number(payload.answerIndex);
      if (quiz.status !== "live" || !Number.isInteger(questionIndex)) return sendJson(response, 409, { error: "That question is no longer open." });
      const question = quiz.questions?.[questionIndex];
      if (!question || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.options.length)
        return sendJson(response, 400, { error: "Choose one of the available answers." });

      let points = 0;
      let responseMs = null;
      const correct = answerIndex === question.answerIndex;
      if (quiz.quiz_type === "contest") {
        if (questionIndex !== quiz.current_question || (quiz.phase || "question") !== "question")
          return sendJson(response, 409, { error: "That question is no longer open." });
        const limitMs = (quiz.question_seconds || 20) * 1000;
        const opensAt = quiz.question_started_at ? Date.parse(quiz.question_started_at) : Date.now();
        responseMs = Date.now() - opensAt;
        if (responseMs < -250) return sendJson(response, 409, { error: "Hold on — the question hasn’t opened yet." });
        if (responseMs > limitMs + ANSWER_GRACE_MS) return sendJson(response, 409, { error: "Time’s up for this question." });
        responseMs = Math.max(0, Math.min(responseMs, limitMs));
        // Speed scoring: an instant correct answer earns 1000, a last-second one 500.
        if (correct) points = Math.round(1000 * (1 - (responseMs / limitMs) / 2));
      } else if (correct) {
        points = 100;
      }

      const inserted = await db("foldbook_quiz_answers?on_conflict=quiz_id,reg_number,question_index", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ quiz_id: quiz.id, reg_number: registration, question_index: questionIndex, answer_index: answerIndex, is_correct: correct, points, response_ms: responseMs }),
      });
      if (!inserted?.length) return sendJson(response, 409, { error: "You’ve already answered this question." });
      const newScore = await db("rpc/foldbook_quiz_record_result", {
        method: "POST",
        body: JSON.stringify({ p_quiz_id: quiz.id, p_reg_number: registration, p_points: points, p_correct: correct }),
      });
      const score = Number.isFinite(Number(newScore)) ? Number(newScore) : mine.score + points;
      if (quiz.quiz_type === "open") {
        return sendJson(response, 200, { ok: true, correct, points, score, answerIndex: question.answerIndex, explanation: question.explanation || "" });
      }
      return sendJson(response, 200, { ok: true, locked: true });
    }

    return sendJson(response, 400, { error: "Choose a valid quiz action." });
  } catch (error) {
    console.error("Student quiz request failed:", error.message);
    return sendJson(response, 503, { error: "The quiz is temporarily unavailable." });
  }
};
