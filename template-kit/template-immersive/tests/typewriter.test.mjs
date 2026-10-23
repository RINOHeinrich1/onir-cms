// Rythme de frappe du dialogue (pur, sans DOM) : pas de caractère, pauses de
// ponctuation forte, pause de paragraphe. Voir `src/lib/typewriter.js`.
import assert from "node:assert/strict";
import test from "node:test";

import {
  TYPE_CHAR_MS,
  TYPE_PARAGRAPH_PAUSE_MS,
  TYPE_SENTENCE_PAUSE_MS,
  charDelay,
  isSentenceEnd,
} from "../src/lib/typewriter.js";

test("pas de frappe : 18 ms par caractère par défaut", () => {
  assert.equal(TYPE_CHAR_MS, 18);
  assert.equal(charDelay("a"), TYPE_CHAR_MS);
  assert.equal(charDelay("a", "b"), TYPE_CHAR_MS);
  assert.equal(charDelay(" "), TYPE_CHAR_MS);
});

test("pause après la ponctuation forte", () => {
  for (const ch of [".", "!", "?", "…"]) {
    assert.equal(isSentenceEnd(ch), true, `« ${ch} » est une fin de phrase`);
    assert.equal(charDelay(ch, " "), TYPE_SENTENCE_PAUSE_MS);
  }
  assert.equal(TYPE_SENTENCE_PAUSE_MS, 260);
});

test("pas de double pause sur la ponctuation enchaînée (« ?! », « … »)", () => {
  assert.equal(charDelay("?", "!"), TYPE_CHAR_MS);
  assert.equal(charDelay("!", "?"), TYPE_CHAR_MS);
  assert.equal(charDelay("…", "."), TYPE_CHAR_MS);
  assert.equal(charDelay(".", "…"), TYPE_CHAR_MS);
});

test("pause de paragraphe sur le saut de ligne", () => {
  assert.equal(charDelay("\n"), TYPE_PARAGRAPH_PAUSE_MS);
  assert.equal(charDelay("\r"), TYPE_PARAGRAPH_PAUSE_MS);
  assert.equal(TYPE_PARAGRAPH_PAUSE_MS, 200);
});

test("ponctuation faible : pas de pause", () => {
  for (const ch of [",", ";", ":", ")"]) assert.equal(charDelay(ch), TYPE_CHAR_MS);
});
