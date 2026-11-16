"use strict";

// Admin: read one page of a scanned or handwritten course material with Gemini vision,
// so phone scans become clean, structured text before they are indexed.
const { isSameOrigin, isValidAdminSession } = require("../../admin-auth.js");

const MAX_REQUEST_BYTES = 3 * 1024 * 1024;
const MODEL = process.env.GEMINI_VISION_MODEL || "gemini-3.5-flash-lite";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

async function readBody(request) {
  if (request.body !== undefined) {
    const body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
    if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new RangeError("This page image is too large.");
    return typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  }
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > MAX_REQUEST_BYTES) throw new RangeError("This page image is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const PROMPT = `You are transcribing one page of a university Economics course material (lecture notes, a past question paper, or a student's handwritten answers) so students can read it in an app.
Write out everything on the page, typed and handwritten, in reading order.
- Keep the structure: headings, question numbers like 1., (a), (i), and line breaks between items.
- Write maths in plain text, e.g. Qd = 68 - 1.6Px + 0.6Py + 0.08M, dQ/dP, TC = 20 + 52Q - 10Q^2 + Q^3.
- Leave out printed booklet margins such as "Do not write on this margin", "Candidate's No." and "Page".
- If a handwritten answer section starts, put a line "Handwritten answer:" before it.
- Write [unclear] for any word you cannot read. Never invent content.
Return only the transcription, no commentary.`;

module.exports = async function adminTranscribeHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  if (!isSameOrigin(request)) {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }
  if (!isValidAdminSession(request, process.env.FOLDBOOK_ADMIN_SESSION_SECRET)) {
    sendJson(response, 401, { error: "Sign in with the admin passcode before reading scans." });
    return;
  }
  let payload;
  try {
    payload = await readBody(request);
  } catch (error) {
    const tooLarge = error instanceof RangeError;
    sendJson(response, tooLarge ? 413 : 400, { error: tooLarge ? error.message : "Request body must be valid JSON." });
    return;
  }
  const mimeType = String(payload?.mimeType || "");
  const data = String(payload?.data || "");
  if (!IMAGE_TYPES.has(mimeType) || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) {
    sendJson(response, 400, { error: "Send one page as a JPEG, PNG or WEBP image." });
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: "The Gemini service is not configured. Set the GEMINI_API_KEY environment variable." });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: PROMPT }, { inlineData: { mimeType, data } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      }),
      signal: controller.signal,
    });
    const result = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error("Gemini transcription failed:", upstream.status);
      sendJson(response, 502, { error: `Dr. Eco couldn’t read this page just now (${upstream.status}).` });
      return;
    }
    const text = (result?.candidates?.[0]?.content?.parts || []).map((part) => part?.text || "").join("").trim();
    sendJson(response, 200, { text });
  } catch (error) {
    sendJson(response, error.name === "AbortError" ? 504 : 502, {
      error: error.name === "AbortError" ? "Reading this page timed out." : "Dr. Eco couldn’t read this page just now.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
