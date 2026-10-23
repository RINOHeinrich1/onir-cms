import test from "node:test";
import assert from "node:assert/strict";
import { ENCLOSURE, enclosureLayout } from "../src/lib/enclosure-layout.js";

test("enceinte : 4 côtés complets et portail de deux modules", () => {
  const l = enclosureLayout();
  assert.equal(l.perSide, 12);
  assert.equal(l.pillars.length, 48);
  assert.equal(l.panels.length, 48 - 2);
  assert.equal(l.gate.width, ENCLOSURE.gate);
  assert.deepEqual(l.gate.center, [0, l.half]);
});

test("enceinte : aucun panneau dans l'ouverture du portail", () => {
  const l = enclosureLayout();
  const inGate = l.panels.filter((p) => p.side === "front" && Math.abs(p.x) < l.gate.width / 2);
  assert.equal(inGate.length, 0);
  const hinges = l.pillars.filter((p) => p.side === "front" && Math.abs(Math.abs(p.x) - l.gate.width / 2) < 1e-9);
  assert.equal(hinges.length, 2);
});

test("enceinte : piliers régulièrement espacés sur chaque côté", () => {
  const l = enclosureLayout();
  for (const side of l.sides) {
    const xs = l.pillars.filter((p) => p.side === side.id);
    assert.equal(xs.length, l.perSide);
    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i].x - xs[i - 1].x;
      const dz = xs[i].z - xs[i - 1].z;
      assert.ok(Math.abs(Math.hypot(dx, dz) - l.module) < 1e-9);
    }
  }
  assert.equal(l.length, l.perSide * l.module);
});
