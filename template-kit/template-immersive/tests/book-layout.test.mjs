import test from "node:test";
import assert from "node:assert/strict";
import { wrapLines, paginate } from "../src/lib/book-layout.js";

const ctx = { font: "", measureText: (text) => ({ width: String(text).length * 10 }) };
const geo = { textW: 100, textH: 90, lh: 30, fontPx: 16, fontFamily: "Georgia" };

test("wrapLines découpe selon la largeur mesurée", () => {
  assert.deepEqual(wrapLines("aaaa bbbb cccc dddd", 100, "16px Georgia", ctx), ["aaaa bbbb", "cccc dddd"]);
  assert.equal(ctx.font, "16px Georgia");
});

test("wrapLines conserve un mot long (aucune coupure)", () => {
  assert.deepEqual(wrapLines("supercalifragilistic", 50, "16px Georgia", ctx), ["supercalifragilistic"]);
});

test("wrapLines conserve les retours à la ligne et les lignes vides", () => {
  assert.deepEqual(wrapLines("Ligne 1\r\nLigne 2\n\nParagraphe", 500, "16px Georgia", ctx), [
    "Ligne 1",
    "Ligne 2",
    "",
    "Paragraphe",
  ]);
  assert.deepEqual(wrapLines("\n\nA\n\n", 500, "16px Georgia", ctx), ["A"]);
});

test("paginate transmet les lignes vides à la page", () => {
  const pages = paginate([{ text: "A\n\nB" }], geo, ctx);
  assert.deepEqual(pages[0].lines, ["A", "", "B"]);
});

test("une image forme sa propre page", () => {
  const pages = paginate([{ image: "a.png", caption: "Légende", text: "" }], geo, ctx);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].kind, "image");
  assert.equal(pages[0].image, "a.png");
  assert.equal(pages[0].caption, "Légende");
});

test("le texte s'écoule sans ligne orpheline", () => {
  const pages = paginate([{ text: "aaaa bbbb cccc dddd eeee ffff gggg hhhh", title: "Titre" }], geo, ctx);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].lines.length, 2, "première page : 2 lignes (pas 3 + orpheline)");
  assert.equal(pages[1].lines.length, 2);
  assert.equal(pages[0].title, "Titre");
  assert.equal(pages[1].title, "");
  assert.equal(pages[0].start, 0);
  assert.equal(pages[1].start, 2);
  assert.ok(pages.every((page) => page.lines.length !== 1));
});

test("texte vide → aucune page de texte", () => {
  assert.deepEqual(paginate([{ text: "   ", title: "Vide" }], geo, ctx), []);
});

test("l'index d'entrée est conservé sur les pages de texte", () => {
  const pages = paginate([
    { image: "p1.png", caption: "P1", text: "" },
    { text: "aaaa bbbb cccc dddd", title: "Deux" },
  ], geo, ctx);
  assert.equal(pages[0].kind, "image");
  assert.equal(pages[0].entry, 0);
  assert.equal(pages[1].entry, 1);
  assert.equal(pages[1].kind, "text");
});
