import test from "node:test";
import assert from "node:assert/strict";
import { createHostAdapter } from "../src/host/adapter.js";

test("ctx absent : valeurs par défaut et actions no-op", () => {
  const host = createHostAdapter(undefined);
  assert.equal(host.phase, "identity");
  assert.deepEqual(host.messages, []);
  assert.deepEqual(host.photos, []);
  assert.deepEqual(host.liens, []);
  assert.equal(host.consent, null);
  assert.equal(host.brand, null);
  assert.deepEqual(host.params, {});
  assert.equal(host.title, "Album");
  assert.equal(host.capabilities.size, 0);
  assert.equal(host.has("media"), false);
  assert.equal(host.actions.submitIdentity({}), undefined);
  assert.equal(host.actions.sendMessage("x"), undefined);
  assert.equal(host.actions.openMedia("u"), undefined);
  assert.doesNotThrow(() => host.actions.finish());
  assert.doesNotThrow(() => host.actions.resize());
  assert.doesNotThrow(() => host.actions.ready());
});

test("titre : paramètre trimé, puis marque, puis Album", () => {
  assert.equal(createHostAdapter({ params: { titre_de_livre: "  Mon album  " } }).title, "Mon album");
  assert.equal(createHostAdapter({ brand: { name: "Marque" } }).title, "Marque");
  assert.equal(createHostAdapter({ params: { titre_de_livre: "   " }, brand: { name: "Marque" } }).title, "Marque");
  assert.equal(createHostAdapter({ params: { titre_de_livre: "" } }).title, "Album");
});

test("messages, photos, liens et consentement", () => {
  const ctx = {
    state: { phase: "chat", messages: [{ id: "m1" }] },
    resources: { media: { photos: [{ url: "p1" }], liens: [{ url: "l1" }] } },
    consent: { texte: "OK", lien: "https://example.com" },
  };
  const host = createHostAdapter(ctx);
  assert.equal(host.phase, "chat");
  assert.equal(host.messages.length, 1);
  assert.equal(host.photos.length, 1);
  assert.equal(host.liens.length, 1);
  assert.equal(host.consent.texte, "OK");
});

test("capabilities exposées comme Set", () => {
  const host = createHostAdapter({ capabilities: ["messages", "media"] });
  assert.equal(host.capabilities instanceof Set, true);
  assert.equal(host.has("messages"), true);
  assert.equal(host.has("knowledge"), false);
  // capabilities invalides → Set vide
  assert.equal(createHostAdapter({ capabilities: "media" }).capabilities.size, 0);
});

test("actions transmises avec leurs arguments", () => {
  const calls = [];
  const host = createHostAdapter({
    actions: {
      submitIdentity: (payload) => calls.push(["submit", payload]),
      sendMessage: (text) => calls.push(["send", text]),
      finish: () => calls.push(["finish"]),
      openMedia: (url) => calls.push(["open", url]),
      request: (cap) => { calls.push(["request", cap]); return { cap }; },
      resize: () => calls.push(["resize"]),
      ready: () => calls.push(["ready"]),
    },
  });
  host.actions.submitIdentity({ nom: "Ada" });
  host.actions.sendMessage("bonjour");
  host.actions.finish();
  host.actions.openMedia("https://example.com");
  assert.deepEqual(host.actions.request("media"), { cap: "media" });
  host.actions.resize();
  host.actions.ready();
  assert.deepEqual(calls, [
    ["submit", { nom: "Ada" }],
    ["send", "bonjour"],
    ["finish"],
    ["open", "https://example.com"],
    ["request", "media"],
    ["resize"],
    ["ready"],
  ]);
});
