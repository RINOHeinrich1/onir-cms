import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../onirtech.template.json", import.meta.url), "utf8"));
const contracts = manifest.data?.contracts ?? [];

test("album et library sont deux contrats distincts", () => {
  const library = contracts.find((contract) => contract.key === "library");
  const album = contracts.find((contract) => contract.key === "album");
  assert.ok(library, "contrat library présent");
  assert.ok(album, "contrat album présent");
  assert.notEqual(library, album);
  assert.deepEqual(album.required, undefined);
  assert.deepEqual(album.schema.required, ["pages"]);
  assert.equal(album.schema.properties.pages.maxItems, 100);
  assert.equal(album.schema.properties.title.maxLength, 120);
  assert.equal(album.schema.properties.pages.items.properties.text.maxLength, 2000);
  assert.equal(album.schema.properties.pages.items.properties.caption.maxLength, 300);
});

test("la catégorie de l'album est un paramètre de lien texte", () => {
  const param = (manifest.params ?? []).find((entry) => entry.key === "categorie");
  assert.ok(param, "paramètre categorie présent");
  assert.equal(param.type, "string");
  assert.equal(param.default, "");
});
