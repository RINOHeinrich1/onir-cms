// Politique de pagination du dialogue (pure, sans DOM) : découpe au mot,
// résolution de la navigation ‹ › et folio. Voir `src/lib/pagination.js`.
import assert from "node:assert/strict";
import test from "node:test";

import { PAGE_MARK, pageLabel, resolveNav, splitAtWord } from "../src/lib/pagination.js";

test("marqueur de continuation", () => {
  assert.equal(PAGE_MARK, "…");
});

test("splitAtWord : coupe au mot quand la coupe est assez tardive", () => {
  // « Bonjour tout le monde » : dernier espace dans les 12 premiers caractères → index 7 (≥ 50 %).
  assert.equal(splitAtWord("Bonjour tout le monde", 12), 7);
  assert.equal("Bonjour tout le monde".slice(0, 7), "Bonjour");
});

test("splitAtWord : ne coupe jamais un mot", () => {
  // Un unique mot très long : aucune frontière → le bloc entier passe à la page suivante.
  assert.equal(splitAtWord("anticonstitutionnellement", 8), 0);
  // Espace trop tôt (index 1 < 50 % de 10) : on préfère déplacer le bloc.
  assert.equal(splitAtWord("a bbbbbbbbbbbb", 10), 0);
  // WhatsApp ne doit jamais devenir « wha » / « sapp ».
  assert.equal(splitAtWord("Voir WhatsApp", 10), 0);
});

test("splitAtWord : reconnaît les espaces insécables Unicode", () => {
  assert.equal(splitAtWord("Bonjour\u00a0tout le monde", 12), 7);
});

test("splitAtWord : texte plus court que la limite", () => {
  assert.equal(splitAtWord("court", 40), 5);
  assert.equal(splitAtWord("", 10), 0);
});

test("splitAtWord : gestion des bornes", () => {
  assert.equal(splitAtWord("abc def", 0), 0);
  assert.equal(splitAtWord("abc def", 3), 0);
  assert.equal(splitAtWord("abc\ndef ghi", 6), 3);
  assert.equal(splitAtWord(null, 10), 0);
});

test("resolveNav : une frappe en cours se termine d'abord", () => {
  assert.equal(resolveNav({ typing: true, delta: 1 }), "finish");
  assert.equal(resolveNav({ typing: true, delta: -1 }), "finish");
});

test("resolveNav : pages du message courant avant de changer de message", () => {
  assert.equal(resolveNav({ pageIdx: 0, pageCount: 3, msgIdx: 0, msgCount: 5, delta: 1 }), "page");
  assert.equal(resolveNav({ pageIdx: 1, pageCount: 3, msgIdx: 0, msgCount: 5, delta: -1 }), "page");
});

test("resolveNav : borne de page franchie → message suivant/précédent", () => {
  assert.equal(resolveNav({ pageIdx: 2, pageCount: 3, msgIdx: 2, msgCount: 5, delta: 1 }), "message");
  assert.equal(resolveNav({ pageIdx: 0, pageCount: 3, msgIdx: 2, msgCount: 5, delta: -1 }), "message");
});

test("resolveNav : bornes globales", () => {
  assert.equal(resolveNav({ pageIdx: 2, pageCount: 3, msgIdx: 4, msgCount: 5, delta: 1 }), "none");
  assert.equal(resolveNav({ pageIdx: 0, pageCount: 1, msgIdx: 0, msgCount: 5, delta: -1 }), "none");
  assert.equal(resolveNav({ delta: 0 }), "none");
});

test("pageLabel : folio message simple puis paginé", () => {
  assert.equal(pageLabel({ msgIdx: 2, msgCount: 7, pageIdx: 0, pageCount: 1 }), "3 / 7");
  assert.equal(pageLabel({ msgIdx: 2, msgCount: 7, pageIdx: 1, pageCount: 3 }), "3 / 7 · 2/3");
  assert.equal(pageLabel({ msgCount: 0 }), "0 / 0");
});
