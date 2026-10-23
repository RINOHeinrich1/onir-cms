// Pagination DOM (partie pure, testable sans navigateur) : les `<br>` insérés
// entre deux blocs Markdown ne créent aucune ligne visible et ne doivent pas
// consommer de place mesurée. Voir `src/ui/pagination.js`.
import assert from "node:assert/strict";
import test from "node:test";

import { dropRedundantBreaks } from "../src/ui/pagination.js";

const div = (text = "") => ({ nodeType: 1, tagName: "DIV", text });
const br = () => ({ nodeType: 1, tagName: "BR" });
const textNode = (text) => ({ nodeType: 3, tagName: undefined, text });

test("dropRedundantBreaks : retire le <br> entre deux blocs", () => {
  const nodes = [div("a"), br(), div("b")];
  assert.deepEqual(dropRedundantBreaks(nodes).map((n) => n.tagName ?? "#text"), ["DIV", "DIV"]);
});

test("dropRedundantBreaks : conserve un <br> utile (dans un paragraphe)", () => {
  const nodes = [textNode("a"), br(), textNode("b")];
  assert.equal(dropRedundantBreaks(nodes).length, 3);
});

test("dropRedundantBreaks : conserve les noeuds non <br>", () => {
  const nodes = [div("a"), { nodeType: 1, tagName: "UL", text: "" }, div("b")];
  assert.equal(dropRedundantBreaks(nodes).length, 3);
});

test("dropRedundantBreaks : liste vide", () => {
  assert.deepEqual(dropRedundantBreaks([]), []);
});

test("dropRedundantBreaks : <br> en fin de flux conservé", () => {
  const nodes = [div("a"), br()];
  assert.equal(dropRedundantBreaks(nodes).length, 2);
});
