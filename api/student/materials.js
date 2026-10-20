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
  if (!response.ok) throw new Error(data?.message || data?.hint || "Supabase database request failed.");
  return data;
}

async function removeStorage(configValue, path) {
  const client = createClient(configValue.url, configValue.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.storage.from(BUCKET).remove([path]);
  if (error && !/not found/i.test(error.message || "")) throw new Error("Could not remove the stored file.");
}

async function createSignedUpload(configValue, path) {
  const client = createClient(configValue.url, configValue.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) throw new Error(error?.message || "Could not prepare a private upload.");
  return data.token;
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

  try {
    if (request.method === "GET") {
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

      if (body.action === "prepare") {
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
    console.error("Student materials request failed:", error.message);
    return sendJson(response, 502, { error: "Could not save or load your materials right now. Please try again." });
  }
};
