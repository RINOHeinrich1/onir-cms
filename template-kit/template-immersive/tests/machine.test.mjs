import test from "node:test";
import assert from "node:assert/strict";
import { createMachine, checkInvariants, DEFAULT_STATE } from "../src/state/machine.js";

test("état initial", () => {
  const machine = createMachine();
  assert.deepEqual(machine.get(), DEFAULT_STATE);
  assert.equal(machine.snapshot().scene, "outside");
});

test("parcours sas → salle → discussion → livre → extérieur", () => {
  const m = createMachine();
  m.send("HOST_PHASE", { phase: "identity" });
  assert.equal(m.get().phase, "identity");
  m.send("SHOW_IDENTITY");
  assert.equal(m.get().overlay, "identity");
  assert.deepEqual(checkInvariants(m.get()), []);
  m.send("SUBMIT_IDENTITY");
  assert.equal(m.get().door, "opening");
  assert.equal(m.get().scene, "entering");
  m.send("DOOR_OPENED");
  assert.equal(m.get().entered, true);
  assert.equal(m.get().interiorPending, true);
  m.send("INTERIOR_READY");
  assert.equal(m.get().scene, "room");
  assert.equal(m.get().door, "closed");
  assert.equal(m.get().interiorPending, false);
  assert.deepEqual(checkInvariants(m.get()), []);

  m.send("OPEN_DISCUSSION");
  assert.equal(m.get().scene, "discussion");
  assert.equal(m.get().phase, "chat");
  assert.deepEqual(checkInvariants(m.get()), []);
  m.send("CLOSE_DISCUSSION");
  assert.equal(m.get().scene, "room");

  m.send("REQUEST_BOOK");
  assert.equal(m.get().scene, "book");
  assert.equal(m.get().bookPending, true);
  m.send("BOOK_OPENED");
  assert.equal(m.get().overlay, "book");
  assert.equal(m.get().bookPending, false);
  assert.deepEqual(checkInvariants(m.get()), []);
  m.send("OPEN_READER");
  assert.equal(m.get().overlay, "reader");
  m.send("CLOSE_READER");
  assert.equal(m.get().overlay, "book");
  m.send("CLOSE_BOOK");
  assert.equal(m.get().scene, "room");
  assert.equal(m.get().overlay, "none");

  m.send("EXIT_OUTSIDE");
  assert.equal(m.get().scene, "outside");
  assert.equal(m.get().entered, false);
  assert.equal(m.get().exited, true);
  assert.deepEqual(checkInvariants(m.get()), []);
  m.send("ENTER_FROM_OUTSIDE");
  assert.equal(m.get().scene, "entering");
  assert.equal(m.get().door, "opening");
  assert.equal(m.get().exited, false);
});

test("gardes : livre seulement depuis la salle entrée", () => {
  const m = createMachine();
  m.send("REQUEST_BOOK");
  assert.equal(m.get().scene, "outside", "non entré → refusé");
  m.send("BOOK_OPENED");
  assert.equal(m.get().overlay, "none");
  m.send("OPEN_READER");
  assert.equal(m.get().overlay, "none");
});

test("mode dev OPEN_BOOK_DEV conserve la scène", () => {
  const m = createMachine({ scene: "room", entered: true, phase: "chat" });
  m.send("OPEN_BOOK_DEV");
  assert.equal(m.get().scene, "room");
  assert.equal(m.get().overlay, "book");
  assert.equal(m.get().booktest, true);
  assert.deepEqual(checkInvariants(m.get()), [], "booktest = exception documentée");
  m.send("CLOSE_BOOK");
  assert.equal(m.get().overlay, "none");
});

test("événement inconnu sans effet", () => {
  const m = createMachine();
  const before = m.snapshot();
  m.send("INCONNU");
  assert.deepEqual(m.get(), before);
});

test("TEARDOWN réinitialise (booktest conservé)", () => {
  const m = createMachine({ booktest: true, scene: "book", entered: true, overlay: "book" });
  m.send("TEARDOWN");
  assert.equal(m.get().scene, "outside");
  assert.equal(m.get().overlay, "none");
  assert.equal(m.get().booktest, true);
});

test("subscribe est notifié et snapshot est une copie", () => {
  const m = createMachine();
  let count = 0;
  const off = m.subscribe(() => count++);
  m.send("HOST_PHASE", { phase: "identity" });
  assert.equal(count, 1);
  const snap = m.snapshot();
  snap.scene = "book";
  assert.equal(m.get().scene, "outside");
  off();
  m.send("HOST_PHASE", { phase: "chat" });
  assert.equal(count, 1);
});

test("checkInvariants détecte les états incohérents", () => {
  assert.match(checkInvariants({ ...DEFAULT_STATE, scene: "outside", entered: true }).join(), /extérieur avec entered/);
  assert.match(checkInvariants({ ...DEFAULT_STATE, scene: "room", entered: false }).join(), /salle sans entered/);
  assert.match(checkInvariants({ ...DEFAULT_STATE, scene: "book", entered: false }).join(), /livre sans entrée/);
  assert.match(checkInvariants({ ...DEFAULT_STATE, scene: "discussion", phase: "identity", entered: true }).join(), /discussion/);
  assert.match(checkInvariants({ ...DEFAULT_STATE, overlay: "identity", scene: "room", entered: true }).join(), /sas/);
  assert.match(checkInvariants({ ...DEFAULT_STATE, overlay: "reader", overlayPrev: "none" }).join(), /reader/);
  assert.match(checkInvariants({ ...DEFAULT_STATE, overlay: "book", scene: "room", booktest: false }).join(), /overlay livre/);
});
