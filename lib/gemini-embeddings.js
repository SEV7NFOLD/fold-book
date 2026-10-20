"use strict";

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 768;

async function embedTexts(texts, taskType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("The Gemini embedding service is not configured."), { status: 503 });
  if (!Array.isArray(texts) || !texts.length || texts.some((text) => typeof text !== "string" || !text.trim())) {
    throw Object.assign(new Error("Embedding text must be a non-empty string."), { status: 400 });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ requests: texts.map((text) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        embedContentConfig: {
          taskType,
          outputDimensionality: EMBEDDING_DIMENSIONS,
        },
      })) }),
      signal: controller.signal,
    });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error("Gemini embedding request failed:", upstream.status);
      throw Object.assign(new Error(`Gemini embeddings are temporarily unavailable (${upstream.status}).`), { status: 502 });
    }
    const responseEmbeddings = Array.isArray(payload?.embeddings)
      ? payload.embeddings.map((item) => item?.values)
      : Array.isArray(payload?.embedding?.values) ? [payload.embedding.values] : null;
    if (!Array.isArray(responseEmbeddings) || responseEmbeddings.length !== texts.length
      || responseEmbeddings.some((values) => !Array.isArray(values) || values.length < EMBEDDING_DIMENSIONS
        || values.some((value) => !Number.isFinite(value)))) {
      console.error("Gemini returned an invalid embedding response:", {
        expectedCount: texts.length,
        receivedCount: Array.isArray(responseEmbeddings) ? responseEmbeddings.length : 0,
        dimensions: Array.isArray(responseEmbeddings) ? responseEmbeddings.map((values) => Array.isArray(values) ? values.length : 0) : [],
      });
      throw Object.assign(new Error("Gemini returned invalid course material embeddings."), { status: 502 });
    }
    return responseEmbeddings.map((values) => {
      const reduced = values.slice(0, EMBEDDING_DIMENSIONS);
      const norm = Math.sqrt(reduced.reduce((sum, value) => sum + (value * value), 0));
      if (!Number.isFinite(norm) || norm === 0) {
        throw Object.assign(new Error("Gemini returned an empty course material embedding."), { status: 502 });
      }
      return reduced.map((value) => value / norm);
    });
  } catch (error) {
    if (error.name === "AbortError") throw Object.assign(new Error("Gemini embedding request timed out."), { status: 504 });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { EMBEDDING_DIMENSIONS, embedTexts };
