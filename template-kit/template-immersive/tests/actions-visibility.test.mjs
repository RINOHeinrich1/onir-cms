import test from "node:test";
import assert from "node:assert/strict";
import { roomActionsVisible, outsideActionsVisible } from "../src/lib/actions-visibility.js";

const base = { ready: true, entered: false, door: "closed", phase: "chat", animating: false, formShown: false };

test("barre de la salle : entré + vue salle + phase chat + prêt", () => {
  assert.equal(roomActionsVisible({ ready: true, entered: true, view: "room", phase: "chat" }), true);
  assert.equal(roomActionsVisible({ ready: true, entered: true, view: "discussion", phase: "chat" }), false);
  assert.equal(roomActionsVisible({ ready: true, entered: false, view: "room", phase: "chat" }), false);
  assert.equal(roomActionsVisible({ ready: false, entered: true, view: "room", phase: "chat" }), false);
  assert.equal(roomActionsVisible({ ready: true, entered: true, view: "room", phase: "identity" }), false);
});

test("actions extérieures : dehors en phase chat", () => {
  assert.equal(outsideActionsVisible(base), true);
});

test("actions extérieures : jamais DANS la salle ni en phase identity", () => {
  assert.equal(outsideActionsVisible({ ...base, entered: true }), false);
  assert.equal(outsideActionsVisible({ ...base, phase: "identity" }), false);
});

test("actions extérieures : jamais pendant le SAS (formulaire) ni pendant l'ouverture de porte", () => {
  assert.equal(outsideActionsVisible({ ...base, formShown: true }), false);
  assert.equal(outsideActionsVisible({ ...base, animating: true }), false);
  assert.equal(outsideActionsVisible({ ...base, door: "opening" }), false);
});

test("actions extérieures : jamais avant les assets prêts", () => {
  assert.equal(outsideActionsVisible({ ...base, ready: false }), false);
});
