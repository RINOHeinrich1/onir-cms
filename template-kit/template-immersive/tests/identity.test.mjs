import test from "node:test";
import assert from "node:assert/strict";
import { isValidEmail, identityKey, loadIdentity, saveIdentity, clearIdentity } from "../src/lib/identity.js";

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("isValidEmail", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("  a@b.co  "), true);
  assert.equal(isValidEmail("a@b"), false);
  assert.equal(isValidEmail("a b@c.co"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail(null), false);
});

test("identityKey dépend du pathname", () => {
  assert.equal(identityKey("/x"), "onirtech.identity.v1:/x");
  assert.notEqual(identityKey("/x"), identityKey("/y"));
});

test("save/load/clear roundtrip", () => {
  const storage = memoryStorage();
  const key = identityKey("/demo");
  saveIdentity(storage, key, { nom: "Ada", email: "ada@example.com", consentement: true });
  assert.deepEqual(loadIdentity(storage, key), { nom: "Ada", email: "ada@example.com", consentement: true });
  clearIdentity(storage, key);
  assert.equal(loadIdentity(storage, key), null);
});

test("JSON invalide ou email invalide → null", () => {
  const storage = memoryStorage();
  storage.setItem("k1", "{pas du json");
  assert.equal(loadIdentity(storage, "k1"), null);
  storage.setItem("k2", JSON.stringify({ nom: "Ada", email: "invalide" }));
  assert.equal(loadIdentity(storage, "k2"), null);
  storage.setItem("k3", JSON.stringify({ nom: "", email: "a@b.co" }));
  assert.equal(loadIdentity(storage, "k3"), null);
});

test("stockage indisponible → aucune exception", () => {
  const broken = {
    getItem() { throw new Error("refusé"); },
    setItem() { throw new Error("refusé"); },
    removeItem() { throw new Error("refusé"); },
  };
  assert.equal(loadIdentity(broken, "k"), null);
  assert.doesNotThrow(() => saveIdentity(broken, "k", { nom: "A", email: "a@b.co" }));
  assert.doesNotThrow(() => clearIdentity(broken, "k"));
});
