import test from "node:test";
import assert from "node:assert/strict";
import { easeInOut, lerp } from "../src/lib/math.js";
import { moodFromUserState } from "../src/lib/mood.js";
import { mdToHtml } from "../src/lib/markdown.js";

test("easeInOut / lerp", () => {
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(0.5), 0.5);
  assert.equal(easeInOut(1), 1);
  assert.equal(lerp(0, 10, 0.25), 2.5);
});

test("moodFromUserState : content", () => {
  for (const label of ["content", "heureux", "heureuse", "joie", "happy", "positif", " CONTENT "]) {
    assert.equal(moodFromUserState({ userState: { label } }), "content", label);
  }
});

test("moodFromUserState : triste", () => {
  for (const label of ["triste", "tristesse", "sad", "negatif", "négatif"]) {
    assert.equal(moodFromUserState({ userState: { label } }), "triste", label);
  }
});

test("moodFromUserState : neutral par défaut", () => {
  assert.equal(moodFromUserState({}), "neutral");
  assert.equal(moodFromUserState(null), "neutral");
  assert.equal(moodFromUserState({ userState: { label: "inconnu" } }), "neutral");
  assert.equal(moodFromUserState({ userState: { state: "content" } }), "content");
});

test("mdToHtml échappe le HTML", () => {
  assert.equal(mdToHtml("<script>alert(1)</script>"), "<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
});

test("mdToHtml : gras, italique, code", () => {
  assert.equal(mdToHtml("**gras**"), "<div><strong>gras</strong></div>");
  assert.equal(mdToHtml("__gras__"), "<div><strong>gras</strong></div>");
  assert.equal(mdToHtml("*ital*"), "<div><em>ital</em></div>");
  assert.equal(mdToHtml("`code`"), "<div><code>code</code></div>");
});

test("mdToHtml : liens http(s)", () => {
  assert.equal(
    mdToHtml("[lien](https://example.com)"),
    '<div><a href="https://example.com" target="_blank" rel="noopener">lien</a></div>',
  );
  assert.match(mdToHtml("voir https://example.com"), /<a href="https:\/\/example\.com"/);
});

test("mdToHtml : listes, titres et sauts de ligne", () => {
  assert.equal(mdToHtml("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(mdToHtml("## Titre"), '<div class="md-h">Titre</div>');
  assert.equal(mdToHtml("a\n\nb"), "<div>a</div><br><div>b</div>");
});
