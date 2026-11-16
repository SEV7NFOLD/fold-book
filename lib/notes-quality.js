"use strict";

// Shared by the browser (copied into app.js) and the server: spot text that came out of a
// phone scan or handwriting OCR as gibberish, and split long notes into readable parts.

const COMMON_WORDS = new Set(("the of and to a in is that for on with as by this be are it an or which what from at its if their when how not "
  + "was were will can has have more less than price demand supply cost market goods good quantity income given find calculate explain "
  + "show where so we x y q p").split(" "));

function notesTextLooksMessy(text) {
  const value = String(text || "");
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length < 40) return false;
  const words = tokens.map((token) => token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")).filter(Boolean);
  if (!words.length) return true;
  let junk = 0;
  let common = 0;
  for (const word of words) {
    if (COMMON_WORDS.has(word.toLowerCase())) common += 1;
    const plainWord = /^[A-Za-z][a-z]+$/.test(word) || /^[A-Z]{2,6}$/.test(word);
    const number = /^[\d.,%]+$/.test(word);
    const symbol = /^[A-Za-z]{1,3}\d{0,2}$/.test(word);
    if (!plainWord && !number && !symbol) junk += 1;
    else if (plainWord && word.length >= 4 && !/[aeiouy]/i.test(word)) junk += 1;
  }
  // Exam answer booklets: the printed margins repeat on every page.
  const booklet = (value.match(/do not write on this margin|candidate'?s no|question no\.|supplementary sheet/gi) || []).length;
  const junkShare = junk / words.length;
  const commonShare = common / words.length;
  return booklet >= 3 || junkShare > 0.14 || (commonShare < 0.25 && junkShare > 0.08);
}

// Split notes into parts of roughly `target` characters, on paragraph breaks first,
// then lines, then sentences, so a part never ends mid-sentence when it can be helped.
function splitNotesIntoParts(text, target = 1400) {
  const clean = String(text || "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!clean) return [];
  const pieces = [];
  const blocks = /\n\s*\n/.test(clean) ? clean.split(/\n\s*\n/) : clean.split(/\n/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    if (trimmed.length <= target) { pieces.push(trimmed); continue; }
    const sentences = trimmed.match(/[^.!?]+(?:[.!?]+|$)\s*/g) || [trimmed];
    let current = "";
    for (const sentence of sentences) {
      if (current && (current + sentence).length > target) { pieces.push(current.trim()); current = ""; }
      if (sentence.length > target) {
        for (let index = 0; index < sentence.length; index += target) pieces.push(sentence.slice(index, index + target).trim());
      } else {
        current += sentence;
      }
    }
    if (current.trim()) pieces.push(current.trim());
  }
  const parts = [];
  let part = "";
  for (const piece of pieces) {
    if (part && part.length + piece.length + 2 > target) { parts.push(part); part = ""; }
    part = part ? `${part}\n\n${piece}` : piece;
  }
  if (part) parts.push(part);
  return parts;
}

module.exports = { notesTextLooksMessy, splitNotesIntoParts };
