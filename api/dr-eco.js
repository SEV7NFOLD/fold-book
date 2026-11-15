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

// Natural-sounding "Listen" playback: Gemini text-to-speech with the same voices as
// Dr. Eco's live calls. Lives in this function because the Vercel Hobby plan allows
// only 12 serverless functions and FoldBook already uses all of them.
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";
const TTS_VOICES = new Set(["Orus", "Kore", "Aoede", "Leda", "Puck", "Charon", "Fenrir", "Zephyr"]);
const TTS_MAX_CHARS = 2400;
const TTS_TIMEOUT_MS = 45000;

function isTtsPayload(payload) {
  return Boolean(payload && typeof payload === "object" && payload.mode === "tts");
}

function cleanSpeechText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`]+/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TTS_MAX_CHARS);
}

// Older TTS models return raw 16-bit PCM; wrap it in a WAV header so browsers can play it.
function pcmToWav(pcm, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function handleTts(payload, apiKey, response) {
  const text = cleanSpeechText(payload.text);
  if (!text) {
    sendJson(response, 400, { error: "Nothing to read aloud." });
    return;
  }
  const voice = TTS_VOICES.has(payload.voice) ? payload.voice : "Orus";
  // Newer TTS models take voiceConfig.voice; preview/2.5 models take prebuiltVoiceConfig.
  const legacyVoiceConfig = /preview|2\.5/.test(TTS_MODEL);
  const body = {
    contents: [{
      role: "user",
      parts: legacyVoiceConfig
        ? [{ text: `Read this aloud warmly and clearly, like a friendly Nigerian economics tutor explaining to a student: ${text}` }]
        : [{ text, speech_metadata: { style: "warm, clear and encouraging, like a friendly economics tutor explaining to a student" } }],
    }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: legacyVoiceConfig ? { prebuiltVoiceConfig: { voiceName: voice } } : { voice } },
    },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await upstream.text();
    if (!upstream.ok) {
      let detail = "";
      try { detail = String(JSON.parse(responseText).error?.message || ""); } catch { /* ignore */ }
      console.error("Gemini TTS rejected the request:", upstream.status, detail.replace(/[\r\n\t]+/g, " ").slice(0, 320) || "no provider detail");
      sendJson(response, 502, { error: `Speech generation failed (${upstream.status}).` });
      return;
    }
    const part = JSON.parse(responseText)?.candidates?.[0]?.content?.parts?.find((item) => item?.inlineData?.data);
    if (!part) {
      sendJson(response, 502, { error: "Speech generation returned no audio." });
      return;
    }
    const mimeType = String(part.inlineData.mimeType || "").toLowerCase();
    let audio = Buffer.from(part.inlineData.data, "base64");
    if (!(audio.length > 12 && audio.toString("ascii", 0, 4) === "RIFF")) {
      const rate = Number(mimeType.match(/rate=(\d+)/)?.[1] || 24000);
      audio = pcmToWav(audio, rate);
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": audio.length,
      "Content-Type": "audio/wav",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(audio);
  } catch (error) {
    console.error("Gemini TTS request failed:", error.name === "AbortError" ? "request timed out" : error.name);
    sendJson(response, 502, { error: error.name === "AbortError" ? "Speech generation timed out." : "Speech generation is temporarily unavailable." });
  } finally {
    clearTimeout(timeout);
  }
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
  if (isTtsPayload(payload)) {
    await handleTts(payload, apiKey, response);
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
