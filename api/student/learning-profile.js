"use strict";

const { readSession, isSameOriginRequest, sendJson } = require("./auth.js");

const COURSE_CODE = /^[A-Z]{2,5}\s?\d{3,4}$/i;
const ALLOWED_TYPES = new Set(["lesson", "chat", "live", "article", "video", "test"]);

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function readBody(request) {
  if (request.body !== undefined) {
    const text = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(text) > 500000) throw new RangeError("Request is too large.");
    return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 500000) throw new RangeError("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function databaseRequest(database, query, options = {}) {
  const response = await fetch(`${database.url}/rest/v1/student_learning_profiles${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: database.key,
      Authorization: `Bearer ${database.key}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.body ? { Prefer: "resolution=merge-duplicates,return=minimal" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* Provider errors can be plain text. */ }
  if (!response.ok) {
    const error = new Error(data?.message || "The learner profile could not be saved.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanModuleAttempts(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(0, 12).flatMap(([id, record]) => {
    if (!/^[a-z0-9-]{2,100}$/i.test(id) || !record || typeof record !== "object") return [];
    return [[id, {
      attempts: Math.max(0, Math.min(1000, Math.floor(Number(record.attempts) || 0))),
      correct: Math.max(0, Math.min(1000, Math.floor(Number(record.correct) || 0))),
      wrong: Math.max(0, Math.min(1000, Math.floor(Number(record.wrong) || 0))),
      questionResults: Array.isArray(record.questionResults) ? record.questionResults.slice(0, 15).map((answer) => answer === true) : [],
      questionWrongAttempts: Array.isArray(record.questionWrongAttempts)
        ? record.questionWrongAttempts.slice(0, 15).map((attempts) => Math.max(0, Math.min(1000, Math.floor(Number(attempts) || 0))))
        : [],
    }]];
  }));
}

function cleanStudentState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const studyPaths = {};
  const completedByCourse = {};
  const attemptsByCourse = {};
  const sources = {};
  const titles = {};
  const sourcePaths = value.studyPaths && typeof value.studyPaths === "object" && !Array.isArray(value.studyPaths)
    ? Object.entries(value.studyPaths).slice(0, 30) : [];
  for (const [rawCode, modules] of sourcePaths) {
    const code = cleanText(rawCode, 12).toUpperCase();
    if (!COURSE_CODE.test(code)) continue;
    const path = cleanPath(modules, code);
    if (!path.length) continue;
    studyPaths[code] = path;
    const completed = value.courseCompleted?.[rawCode] ?? value.courseCompleted?.[code];
    completedByCourse[code] = Array.isArray(completed)
      ? completed.filter((id) => typeof id === "string" && path.some((module) => module.id === id)).slice(0, 12) : [];
    const attempts = value.moduleAttempts?.[rawCode] ?? value.moduleAttempts?.[code];
    attemptsByCourse[code] = cleanModuleAttempts(attempts);
    const source = value.studyPathSources?.[rawCode] ?? value.studyPathSources?.[code];
    const title = value.studyPathTitles?.[rawCode] ?? value.studyPathTitles?.[code];
    if (typeof source === "string") sources[code] = cleanText(source, 500);
    if (typeof title === "string") titles[code] = cleanText(title, 120);
  }
  const activeCourse = cleanText(value.activeCourse, 12).toUpperCase();
  const learnerProfile = value.learnerProfile && typeof value.learnerProfile === "object" && !Array.isArray(value.learnerProfile)
    ? value.learnerProfile : {};
  return {
    version: 1,
    activeCourse: COURSE_CODE.test(activeCourse) ? activeCourse : Object.keys(studyPaths)[0] || "",
    studyPaths,
    courseCompleted: completedByCourse,
    moduleAttempts: attemptsByCourse,
    studyPathSources: sources,
    studyPathTitles: titles,
    learnerProfile: {
      goal: cleanText(learnerProfile.goal, 100),
      difficulties: cleanText(learnerProfile.difficulties, 600),
      note: cleanText(learnerProfile.note, 600),
      pace: ["gentle", "balanced", "quick"].includes(learnerProfile.pace) ? learnerProfile.pace : "balanced",
    },
    onboardingComplete: value.onboardingComplete === true || Object.keys(studyPaths).length > 0,
    migrationComplete: value.migrationComplete === true,
  };
}

function mergeStudentState(existing, mode, courseCode, completed, attempts, path, payload) {
  const current = cleanStudentState(existing) || {
    version: 1, activeCourse: "", studyPaths: {}, courseCompleted: {}, moduleAttempts: {},
    studyPathSources: {}, studyPathTitles: {},
    learnerProfile: { goal: "", difficulties: "", note: "", pace: "balanced" }, onboardingComplete: false, migrationComplete: false,
  };
  if (mode === "finish_import") return { ...current, activeCourse: courseCode, migrationComplete: true };
  const next = { ...current, activeCourse: courseCode };
  if (path.length) next.studyPaths = { ...current.studyPaths, [courseCode]: path };
  next.courseCompleted = { ...current.courseCompleted, [courseCode]: completed };
  next.moduleAttempts = { ...current.moduleAttempts, [courseCode]: attempts };
  if (mode === "path" || mode === "import_path") {
    next.studyPathSources = { ...current.studyPathSources, [courseCode]: cleanText(payload.pathSource, 500) };
    next.studyPathTitles = { ...current.studyPathTitles, [courseCode]: cleanText(payload.courseTitle, 120) };
    const learnerProfile = payload.learnerProfile && typeof payload.learnerProfile === "object" ? payload.learnerProfile : {};
    next.learnerProfile = {
      goal: cleanText(learnerProfile.goal, 100),
      difficulties: cleanText(learnerProfile.difficulties, 600),
      note: cleanText(learnerProfile.note, 600),
      pace: ["gentle", "balanced", "quick"].includes(learnerProfile.pace) ? learnerProfile.pace : "balanced",
    };
  }
  next.onboardingComplete = next.onboardingComplete || path.length > 0;
  if (mode === "path") next.migrationComplete = true;
  return next;
}

function cleanPath(path, courseCode) {
  if (!Array.isArray(path) || path.length > 12) return [];
  return path.filter((item) => item && typeof item === "object" && !Array.isArray(item)
    && typeof item.id === "string" && /^[a-z0-9-]{2,100}$/i.test(item.id)
    && typeof item.title === "string" && item.title.trim().length > 0 && item.title.length <= 120
    && ALLOWED_TYPES.has(item.activityType))
    .map((item) => ({
      id: item.id,
      title: item.title.trim(),
      lesson: cleanText(item.lesson, 1800),
      question: cleanText(item.question, 500),
      answers: Array.isArray(item.answers) ? item.answers.slice(0, 4).map((answer) => cleanText(answer, 250)) : [],
      correctAnswer: Number.isInteger(item.correctAnswer) && item.correctAnswer >= 0 && item.correctAnswer <= 3 ? item.correctAnswer : 0,
      questions: Array.isArray(item.questions) ? item.questions.slice(0, 15).filter((question) => question && typeof question === "object")
        .map((question) => ({
          question: cleanText(question.question, 500),
          answers: Array.isArray(question.answers) ? question.answers.slice(0, 4).map((answer) => cleanText(answer, 250)) : [],
          correctAnswer: Number.isInteger(question.correctAnswer) && question.correctAnswer >= 0 && question.correctAnswer <= 3 ? question.correctAnswer : 0,
        })).filter((question) => question.question && question.answers.length >= 2 && question.answers.every(Boolean) && question.correctAnswer < question.answers.length) : [],
      activityType: item.activityType,
      activityText: cleanText(item.activityText, 1200),
      chatPrompt: cleanText(item.chatPrompt, 500),
      youtubeSearch: cleanText(item.youtubeSearch, 200),
      courseCode,
    }));
}

module.exports = async function learningProfileHandler(request, response) {
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  const session = readSession(request);
  if (!session) return sendJson(response, 401, { error: "Please sign in again." });
  const database = config();
  if (!database) return sendJson(response, 503, { error: "The learning profile service is not configured." });
  const regNumber = encodeURIComponent(session.registration);

  if (request.method === "GET") {
    try {
      const data = await databaseRequest(database, `?select=*&reg_number=eq.${regNumber}&limit=1`);
      return sendJson(response, 200, { profile: data?.[0] || null });
    } catch (error) {
      console.error("Student learning profile read failed:", error.message);
      return sendJson(response, 503, { error: "Could not load your saved learning profile." });
    }
  }
  if (request.method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  }

  let payload;
  try { payload = await readBody(request); }
  catch (error) { return sendJson(response, error instanceof RangeError ? 413 : 400, { error: "Enter a valid learning profile." }); }
  const courseCode = cleanText(payload?.courseCode, 12).toUpperCase();
  if (!COURSE_CODE.test(courseCode)) return sendJson(response, 400, { error: "Enter a valid course code." });
  const completed = Array.isArray(payload.completedModuleIds)
    ? payload.completedModuleIds.filter((id) => typeof id === "string" && id.length <= 100).slice(0, 12)
    : [];
  const mode = payload.mode;
  if (!["path", "progress", "import_path", "finish_import"].includes(mode)) return sendJson(response, 400, { error: "Choose a valid profile update." });
  const path = cleanPath(payload.studyPath, courseCode);
  if (["path", "import_path"].includes(mode) && !path.length) return sendJson(response, 400, { error: "A valid personalized path is required." });
  const attempts = cleanModuleAttempts(payload.moduleAttempts);
  const row = {
    reg_number: session.registration,
    course_code: courseCode,
    course_title: cleanText(payload.courseTitle, 120),
    completed_module_ids: completed,
    updated_at: new Date().toISOString(),
  };
  if (mode === "path" || mode === "import_path") {
    const learnerProfile = payload.learnerProfile && typeof payload.learnerProfile === "object" ? payload.learnerProfile : {};
    row.learner_goal = cleanText(learnerProfile.goal, 100);
    row.difficulty_topics = cleanText(learnerProfile.difficulties, 600);
    row.learner_note = cleanText(learnerProfile.note, 600);
    row.pace = ["gentle", "balanced", "quick"].includes(learnerProfile.pace) ? learnerProfile.pace : "balanced";
    row.study_path = path;
    row.path_source = cleanText(payload.pathSource, 500);
  } else if (mode === "progress") {
    if (path.length) row.study_path = path;
    if (typeof payload.pathSource === "string") row.path_source = cleanText(payload.pathSource, 500);
  }

  try {
    const existingRows = await databaseRequest(database, `?select=study_state&reg_number=eq.${regNumber}&limit=1`);
    const currentState = existingRows?.[0]?.study_state;
    const nextState = mergeStudentState(currentState, mode, courseCode, completed, attempts, path, payload);
    row.study_state = nextState;
    row.module_attempts = attempts;
    await databaseRequest(database, "?on_conflict=reg_number", { method: "POST", body: row });
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error("Student learning profile write failed:", error.message);
    return sendJson(response, 503, {
      error: "Could not save the shared learning profile. Check that the learning-profile SQL setup has been applied.",
    });
  }
};
