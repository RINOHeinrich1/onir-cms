import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatToolField,
  formatToolFieldValue,
  isKnownContractVersion,
  renderFallbackText,
  resolveBlock,
} from "../src/blocks.js";

const FIELDS = [
  { key: "titre", label: "Titre", type: "text", value: "Maison A" },
  { key: "loyer", label: "Loyer", type: "number", value: 1200, unit: "€" },
  { key: "disponible", label: "Disponible", type: "date", value: "2026-01-02" },
  { key: "site", label: "Site", type: "url", value: "https://exemple.mg" },
  { key: "email", label: "Email", type: "email", value: "a@exemple.mg" },
  { key: "tags", label: "Tags", type: "multi", value: ["eau", "électricité"] },
  { key: "photo", label: "Photo", type: "image", value: "https://exemple.mg/a.jpg" },
];

function toolBlock(overrides = {}) {
  return {
    type: "tool_search_result",
    contractVersion: 1,
    tool: "search_fiches",
    layout: "list",
    items: [{ fields: FIELDS }],
    meta: { total: 1, hasMore: false },
    ...overrides,
  };
}

describe("versions et types de champ", () => {
  it("reconnaît uniquement les versions connues", () => {
    assert.equal(isKnownContractVersion(1), true);
    assert.equal(isKnownContractVersion(2), false);
    assert.equal(isKnownContractVersion("1"), false);
  });

  it("formate chaque type générique sans HTML", () => {
    assert.equal(formatToolField(FIELDS[1]), "Loyer : 1200 €");
    assert.equal(formatToolField(FIELDS[2]), "Disponible : 02/01/2026");
    assert.equal(formatToolField(FIELDS[4]), "Email : a@exemple.mg");
    assert.equal(formatToolField(FIELDS[5]), "Tags : eau · électricité");
    assert.equal(formatToolFieldValue({ type: "inconnu", value: "x" }), "x");
  });
});

describe("resolveBlock", () => {
  it("accepte les blocs connus", () => {
    assert.deepEqual(resolveBlock({ type: "text", text: "Bonjour" }), {
      type: "text",
      text: "Bonjour",
    });
    assert.deepEqual(resolveBlock({ type: "image", url: "https://x/y.png", alt: "y" }), {
      type: "image",
      url: "https://x/y.png",
      alt: "y",
    });
    const block = resolveBlock(toolBlock());
    assert.equal(block.type, "tool_search_result");
    assert.equal(block.items[0].fields.length, FIELDS.length);
  });

  it("rejette un type inconnu et une version inconnue", () => {
    assert.equal(resolveBlock({ type: "hologram", data: {} }), null);
    assert.equal(resolveBlock(toolBlock({ contractVersion: 99 })), null);
  });

  it("exclut les champs fichier et tout statut/métadonnée", () => {
    const block = resolveBlock(
      toolBlock({
        items: [
          {
            fields: [
              { key: "titre", label: "Titre", type: "text", value: "A" },
              { key: "cin", label: "CIN", type: "file", value: "secret.pdf" },
            ],
            statusKey: "publie",
            metadata: { owner: "x" },
          },
        ],
      }),
    );
    const keys = block.items[0].fields.map((field) => field.key);
    assert.deepEqual(keys, ["titre"]);
    assert.equal(JSON.stringify(block).includes("secret.pdf"), false);
    assert.equal(JSON.stringify(block).includes("statusKey"), false);
  });
});

describe("renderFallbackText", () => {
  it("retombe sur content quand aucun bloc n'est exploitable", () => {
    assert.equal(renderFallbackText([], "Texte de secours"), "Texte de secours");
    assert.equal(renderFallbackText([{ type: "hologram" }], "Texte de secours"), "Texte de secours");
    assert.equal(
      renderFallbackText([toolBlock({ contractVersion: 99 })], "Texte de secours"),
      "Texte de secours",
    );
  });

  it("rend les blocs texte et les champs typés en texte pur", () => {
    const text = renderFallbackText([{ type: "text", text: "Voici" }, toolBlock()], "");
    assert.match(text, /Voici/);
    assert.match(text, /Loyer : 1200 €/);
    assert.doesNotMatch(text, /secret\.pdf/);
    assert.doesNotMatch(text, /<script/i);
  });
});
