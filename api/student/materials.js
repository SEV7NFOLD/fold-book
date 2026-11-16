"use strict";

const { createHash, randomUUID } = require("node:crypto");
const { readSession, isSameOriginRequest, sendJson } = require("./auth.js");
const { createClient } = require("@supabase/supabase-js");

const BUCKET = "student-materials";
const MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_LENGTH = 12000;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function readBody(request) {
  if (request.body !== undefined) return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65000) throw new RangeError("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function storageOwner(registration) {
  return createHash("sha256").update(registration).digest("hex").slice(0, 32);
}

function safeFileName(value) {
  return String(value || "material").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "material";
}

async function rest(configValue, table, query, options = {}) {
  const response = await fetch(`${configValue.url}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      apikey: configValue.key,
      Authorization: `Bearer ${configValue.key}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* provider error */ }
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || "Supabase database request failed.");
    error.code = data?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

async function removeStorage(configValue, path) {
  const client = createClient(configValue.url, configValue.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error && !/not found/i.test(error.message || "")) {
    error.stage = "storage cleanup";
    throw error;
  }
}

async function createSignedUpload(configValue, path) {
  const client = createClient(configValue.url, configValue.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) {
    if (error) error.stage = "secure upload setup";
    throw error || new Error("Supabase did not return a secure upload token.");
  }
  return data.token;
}

/* ---------- Course notes finder (Dr. Eco "send me the notes") ----------
   Course notes are stored as indexed text sections in public.course_materials (the
   original PDFs are not kept). Students find them by course code or by topic words,
   then read the full notes inside FoldBook. */
const NOTE_STOPWORDS = new Set(("a an and any are as at be can could course courses do does for from get give got have help i in is it me "
  + "my need notes note of on or our pdf pdfs please pls plz send share show some the this to topic up want we where which with you your "
  + "material materials handout handouts slide slides lecture lectures document documents doc docs textbook ebook outline find download link "
  + "drop upload anybody anyone has who what kindly sir ma dr eco foldbook anything something stuff resource resources abeg biko una "
  + "hello hey there about related regarding info information study read reading available").split(" "));

function normalizeCourseCode(value) {
  const match = String(value || "").match(/\b([A-Za-z]{2,5})\s*-?\s*(\d{3,4})\b/);
  return match ? `${match[1].toUpperCase()} ${match[2]}` : "";
}

function noteKeywords(text) {
  return [...new Set(String(text || "").toLowerCase()
    .replace(/\b[a-z]{2,5}\s*-?\s*\d{3,4}\b/g, " ")
    .split(/[^a-z0-9-]+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length >= 3 && !NOTE_STOPWORDS.has(word) && !/^\d+$/.test(word)))]
    .slice(0, 5);
}

// Groups indexed sections into one entry per document (course + level + title).
function groupNotes(rows) {
  const docs = new Map();
  for (const row of rows || []) {
    if (!row || typeof row.title !== "string") continue;
    const key = [row.course_code, row.level, row.title].join("\u0000");
    const doc = docs.get(key) || { courseCode: row.course_code, level: row.level, title: row.title, sections: 0, firstId: Number(row.id) || 0, score: 0, matched: new Set() };
    doc.sections += 1;
    doc.firstId = Math.min(doc.firstId, Number(row.id) || doc.firstId);
    docs.set(key, doc);
  }
  return docs;
}

async function listCourseNotes(configValue, courseCode, keywords) {
  const [letters, digits] = courseCode.split(" ");
  const rows = await rest(configValue, "course_materials", `?select=id,level,course_code,title&course_code=ilike.${encodeURIComponent(`${letters}*${digits}`)}&order=id.asc&limit=3000`);
  const docs = groupNotes(rows);
  // Within a course, documents whose titles mention the topic come first.
  for (const doc of docs.values()) {
    for (const word of keywords) if (doc.title.toLowerCase().includes(word)) { doc.score += 5; doc.matched.add(word); }
  }
  return [...docs.values()];
}

async function searchNotesByTopic(configValue, keywords, courseCode) {
  const select = "select=id,level,course_code,title";
  const courseFilter = courseCode ? `&course_code=ilike.${encodeURIComponent(courseCode.replace(" ", "*"))}` : "";
  const docs = new Map();
  for (const word of keywords) {
    const pattern = encodeURIComponent(`*${word}*`);
    const rows = await rest(configValue, "course_materials", `?${select}&or=(title.ilike.${pattern},content.ilike.${pattern})${courseFilter}&limit=300`);
    for (const [key, doc] of groupNotes(rows)) {
      const existing = docs.get(key) || { ...doc, sections: 0, score: 0, matched: new Set() };
      // More matching sections and a match in the title both rank a document higher.
      existing.score += Math.min(doc.sections, 6) + (doc.title.toLowerCase().includes(word) ? 8 : 0);
      existing.matched.add(word);
      docs.set(key, existing);
    }
  }
  // Short topics ("game theory") need every word, or "theory" alone pulls in Price Theory.
  // Longer ones need at least half, so one stray word doesn't sink a good match.
  const needed = keywords.length <= 2 ? keywords.length : Math.ceil(keywords.length / 2);
  const matches = [...docs.values()].filter((doc) => doc.matched.size >= needed);
  if (!matches.length) return [];
  // Count every section of the matched documents (the topic queries only saw matching ones).
  const titles = [...new Set(matches.map((doc) => doc.title))].slice(0, 20);
  const list = titles.map((title) => `"${title.replace(/["\\]/g, "")}"`).join(",");
  const rows = await rest(configValue, "course_materials", `?${select}&title=in.(${encodeURIComponent(list)})&limit=3000`);
  const full = groupNotes(rows);
  for (const doc of matches) {
    const whole = full.get([doc.courseCode, doc.level, doc.title].join("\u0000"));
    doc.sections = whole ? whole.sections : doc.sections;
  }
  return matches;
}

async function findNotes(configValue, body) {
  const query = String(body.query || "").slice(0, 300);
  const courseCode = normalizeCourseCode(query) || normalizeCourseCode(body.courseCode);
  const namedCourse = Boolean(normalizeCourseCode(query));
  const keywords = noteKeywords(query);
  let docs = [];
  if (keywords.length) docs = await searchNotesByTopic(configValue, keywords, namedCourse ? courseCode : "");
  // A named course with no topic match (or no topic at all) lists that course's notes.
  let topicMissed = false;
  if (!docs.length && courseCode && (namedCourse || !keywords.length)) {
    docs = await listCourseNotes(configValue, courseCode, keywords);
    topicMissed = keywords.length > 0 && docs.length > 0;
  }
  if (!docs.length && !keywords.length && !courseCode) return { needsTopic: true, materials: [] };
  const level = /^(100L|200L|300L|400L)$/.test(String(body.level || "")) ? body.level : "";
  let ranked = docs
    .filter((doc) => doc.sections > 0)
    .sort((a, b) => b.matched.size - a.matched.size || b.score - a.score || a.firstId - b.firstId);
  // A topic search stays at the student's level. Notes from other levels are offered only
  // when their level has none, and flagged so the student knows. A course the student
  // names explicitly is shown whatever its level.
  let otherLevel = false;
  if (level && !namedCourse) {
    const own = ranked.filter((doc) => doc.level === level);
    otherLevel = !own.length && ranked.length > 0;
    if (own.length) ranked = own;
  }
  const materials = ranked
    .slice(0, 8)
    .map((doc) => ({ courseCode: doc.courseCode, level: doc.level, title: doc.title, sections: doc.sections }));
  // Report the course when the student named it, or when it was the only thing searched.
  const usedCourse = namedCourse || !keywords.length ? courseCode : "";
  return { courseCode: usedCourse, keywords, level, otherLevel, topicMissed, materials };
}

async function readNotes(configValue, body) {
  const courseCode = String(body.courseCode || "").slice(0, 20);
  const level = String(body.level || "");
  const title = String(body.title || "").slice(0, 200);
  if (!courseCode || !/^(100L|200L|300L|400L)$/.test(level) || !title) {
    const error = new Error("Choose a course material to open.");
    error.status = 400;
    throw error;
  }
  const query = new URLSearchParams({ select: "id,content", course_code: `eq.${courseCode}`, level: `eq.${level}`, title: `eq.${title}`, order: "id.asc", limit: "800" });
  const rows = await rest(configValue, "course_materials", `?${query}`);
  return { courseCode, level, title, sections: (rows || []).filter((row) => typeof row.content === "string" && row.content.trim()).map((row) => ({ id: row.id, text: row.content })) };
}

async function logNotesRequest(configValue, body, session) {
  try {
    await rest(configValue, "material_requests", "", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        registration: session.registration,
        course_code: normalizeCourseCode(body.courseCode || body.query) || null,
        query: String(body.query || "").slice(0, 300),
        keywords: noteKeywords(body.query).join(" "),
      },
    });
    return { logged: true };
  } catch (error) {
    // The requests table is optional: run supabase/2026-11-16-material-requests.sql to collect them.
    console.warn("Notes request was not logged:", error.code || error.status || error.message);
    return { logged: false };
  }
}

function ownerQuery(session) {
  return `owner_registration=eq.${encodeURIComponent(session.registration)}`;
}

module.exports = async function studentMaterialsHandler(request, response) {
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "A same-origin request is required." });
  const session = readSession(request);
  if (!session) return sendJson(response, 401, { error: "Please sign in to manage your study materials." });
  const supabase = config();
  if (!supabase) return sendJson(response, 503, { error: "Private material uploads are not configured on the server." });

  let operation = "processing your materials request";
  try {
    if (request.method === "GET") {
      operation = "loading your materials";
      const query = new URLSearchParams({
        select: "id,title,course_code,course_title,description,level,file_name,storage_path,mime_type,extracted_text,created_at",
        owner_registration: `eq.${session.registration}`,
        order: "created_at.desc",
        limit: "100",
      });
      const materials = await rest(supabase, "student_materials", `?${query}`);
      return sendJson(response, 200, { materials });
    }
    if (request.method === "POST") {
      const body = await readBody(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) return sendJson(response, 400, { error: "Invalid material request." });

      if (body.action === "notes-find") {
        operation = "finding course notes";
        return sendJson(response, 200, await findNotes(supabase, body));
      }
      if (body.action === "notes-read") {
        operation = "opening the course notes";
        return sendJson(response, 200, await readNotes(supabase, body));
      }
      if (body.action === "notes-request") {
        operation = "logging the notes request";
        return sendJson(response, 200, await logNotesRequest(supabase, body, session));
      }

      if (body.action === "prepare") {
        operation = "preparing the secure upload";
        const mimeType = String(body.mimeType || "");
        const size = Number(body.size);
        if (!MIME_TYPES.has(mimeType) || !Number.isFinite(size) || size < 1 || size > MAX_FILE_SIZE) {
          return sendJson(response, 400, { error: "Choose a PDF or clear JPG, PNG, or WebP image under 10 MB." });
        }
        const id = randomUUID();
        const fileName = safeFileName(body.fileName);
        const path = `${storageOwner(session.registration)}/${id}/${fileName}`;
        const token = await createSignedUpload(supabase, path);
        return sendJson(response, 200, { id, path, token });
      }

      if (body.action === "finalize") {
        operation = "saving the material details";
        const id = String(body.id || "");
        const path = String(body.path || "");
        const expectedPrefix = `${storageOwner(session.registration)}/${id}/`;
        const title = String(body.title || "").trim();
        const courseCode = String(body.courseCode || "").trim().toUpperCase().replace(/\s+/g, " ");
        const courseTitle = String(body.courseTitle || "").trim();
        const description = String(body.description || "").trim();
        const mimeType = String(body.mimeType || "");
        const extractedText = String(body.extractedText || "").slice(0, MAX_TEXT_LENGTH);
        if (!/^[0-9a-f-]{36}$/i.test(id) || !path.startsWith(expectedPrefix) || path.split("/").length !== 3
          || path !== `${expectedPrefix}${safeFileName(path.split("/").pop())}` || !MIME_TYPES.has(mimeType)
          || title.length < 1 || title.length > 100 || courseCode.length < 2 || courseCode.length > 20
          || courseTitle.length > 120 || description.length > 500 || !extractedText.trim()) {
          return sendJson(response, 400, { error: "Check the material title, course details, and processed document text." });
        }
        const fileName = safeFileName(path.split("/").pop());
        const row = {
          id,
          owner_id: null,
          owner_registration: session.registration,
          title,
          course_code: courseCode,
          course_title: courseTitle,
          description,
          level: /^(100L|200L|300L|400L)$/.test(session.level) ? session.level : "100L",
          file_name: fileName,
          storage_path: path,
          mime_type: mimeType,
          extracted_text: extractedText,
        };
        try {
          await rest(supabase, "student_materials", "", { method: "POST", body: row, prefer: "return=minimal" });
        } catch (error) {
          await removeStorage(supabase, path).catch(() => {});
          throw error;
        }
        return sendJson(response, 201, { ok: true });
      }

      if (body.action === "delete") {
        operation = "deleting the material";
        const id = String(body.id || "");
        if (!/^[0-9a-f-]{36}$/i.test(id)) return sendJson(response, 400, { error: "Invalid material id." });
        const found = await rest(supabase, "student_materials", `?select=id,storage_path&id=eq.${encodeURIComponent(id)}&${ownerQuery(session)}&limit=1`);
        const material = found?.[0];
        if (!material) return sendJson(response, 404, { error: "Material not found." });
        await removeStorage(supabase, material.storage_path);
        await rest(supabase, "student_materials", `?id=eq.${encodeURIComponent(id)}&${ownerQuery(session)}`, { method: "DELETE" });
        return sendJson(response, 200, { ok: true });
      }

      if (body.action === "abort") {
        operation = "cleaning up the incomplete upload";
        const id = String(body.id || "");
        const path = String(body.path || "");
        const expectedPrefix = `${storageOwner(session.registration)}/${id}/`;
        if (!/^[0-9a-f-]{36}$/i.test(id) || !path.startsWith(expectedPrefix) || path.split("/").length !== 3
          || path !== `${expectedPrefix}${safeFileName(path.split("/").pop())}`) return sendJson(response, 400, { error: "Invalid upload reference." });
        await removeStorage(supabase, path);
        return sendJson(response, 200, { ok: true });
      }
      return sendJson(response, 400, { error: "Unknown material action." });
    }
    response.setHeader("Allow", "GET, POST");
    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    if (error.status === 400 && /course material/.test(error.message || "")) return sendJson(response, 400, { error: error.message });
    const details = String(error.message || "");
    console.error("Student materials request failed:", {
      operation: error.stage || operation,
      status: error.status || error.statusCode || null,
      code: error.code || null,
      message: details,
    });
    if (/owner_registration|PGRST204|42703|student_materials.*does not exist|42P01/i.test(`${error.code || ""} ${details}`)) {
      return sendJson(response, 503, { error: "The Supabase upload database update is missing or incomplete. Run supabase/student_materials_server_uploads.sql in the FoldBook project's SQL Editor, then retry." });
    }
    if (/bucket.*not found|bucket.*does not exist/i.test(details)) {
      return sendJson(response, 503, { error: "The private student-materials bucket is missing. Run supabase/student_materials_server_uploads.sql in the FoldBook project's SQL Editor, then retry." });
    }
    if (error.status === 401 || error.status === 403 || error.statusCode === 401 || error.statusCode === 403) {
      return sendJson(response, 503, { error: "Supabase rejected the server's private upload credentials. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel." });
    }
    const stage = error.stage || operation;
    return sendJson(response, 502, { error: `FoldBook could not complete ${stage}. Please try again; the server has logged the provider error.` });
  }
};
