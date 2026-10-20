"use strict";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_REQUEST_BYTES = 24 * 1024;
const REQUEST_TIMEOUT_MS = 30000;

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
    if (typeof request.body === "string") {
      if (Buffer.byteLength(request.body) > MAX_REQUEST_BYTES) throw new RangeError("Request body is too large.");
      return JSON.parse(request.body);
    }
    return request.body;
  }

  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > MAX_REQUEST_BYTES) throw new RangeError("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const instruction = payload.system_instruction?.parts;
  const contents = payload.contents;
  if (!Array.isArray(instruction) || instruction.length !== 1 || !Array.isArray(contents) || contents.length !== 1) return false;
  if (!instruction.every((part) => typeof part?.text === "string" && part.text.length <= 4000)) return false;
  const userContent = contents[0];
  if (userContent?.role !== "user" || !Array.isArray(userContent.parts) || userContent.parts.length !== 1) return false;
  const question = userContent.parts[0]?.text;
  return typeof question === "string" && question.length > 0 && question.length <= 20000;
}

module.exports = async function drEcoHandler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }

  const requestOrigin = request.headers.origin;
  const requestHost = request.headers.host;
  let originHost = "";
  try {
    originHost = new URL(requestOrigin).host;
  } catch {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }
  if (!requestHost || originHost.toLowerCase() !== requestHost.toLowerCase()) {
    sendJson(response, 403, { error: "A same-origin request is required." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    sendJson(response, 503, { error: "The Gemini service is not configured. Set the GEMINI_API_KEY environment variable." });
    return;
  }

  let payload;
  try {
    payload = await readBody(request);
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 400;
    sendJson(response, status, { error: error instanceof RangeError ? error.message : "Request body must be valid JSON." });
    return;
  }
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_REQUEST_BYTES) {
    sendJson(response, 413, { error: "Request body is too large." });
    return;
  }
  if (!validatePayload(payload)) {
    sendJson(response, 400, { error: "The Gemini request has an invalid format or exceeds the size limits." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseText = await upstream.text();
    if (!upstream.ok) {
      let providerMessage = "";
      try {
        const failure = JSON.parse(responseText);
        providerMessage = typeof failure.error?.message === "string" ? failure.error.message : "";
      } catch { /* Do not reflect arbitrary provider response bodies. */ }
      const detail = providerMessage.replace(/[\r\n\t]+/g, " ").slice(0, 320);
      console.error("Gemini provider rejected the request:", upstream.status, detail || "no provider detail");
      sendJson(response, 502, {
        error: `Gemini request failed (${upstream.status})${detail ? `: ${detail}` : "."}`,
      });
      return;
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      sendJson(response, 502, { error: "Gemini returned an invalid response." });
      return;
    }
    sendJson(response, 200, result);
  } catch (error) {
    console.error("Gemini proxy request failed:", error.name === "AbortError" ? "request timed out" : error.name);
    sendJson(response, 502, { error: error.name === "AbortError" ? "Gemini request timed out." : "Gemini service is temporarily unavailable." });
  } finally {
    clearTimeout(timeout);
  }
};
