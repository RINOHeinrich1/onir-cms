// Plan de l'enceinte extérieure : cour carrée, modules de clôture et portail.
// Pur (aucune dépendance THREE) → testable sous node:test.

/** Cotes de la cour et du module de clôture (mètres). */
export const ENCLOSURE = {
  half: 12.6,
  module: 2.1,
  panel: 1.8,
  pillar: 0.3,
  height: 1.1,
  gate: 4.2,
  hedgeHeight: 1.75,
  hedgeDepth: 0.6,
};

/**
 * Découpe du pourtour : 4 côtés orientés dans le sens horaire, piliers à chaque
 * module et panneaux entre deux piliers. Les deux modules centraux de la façade
 * avant sont remplacés par le portail.
 */
export function enclosureLayout({ half = ENCLOSURE.half, module = ENCLOSURE.module, gateModules = 2 } = {}) {
  const perSide = Math.round((2 * half) / module);
  const length = perSide * module;
  const gateWidth = gateModules * module;
  const sides = [
    { id: "back", origin: [-half, -half], dir: [1, 0], ry: 0 },
    { id: "right", origin: [half, -half], dir: [0, 1], ry: -Math.PI / 2 },
    { id: "front", origin: [half, half], dir: [-1, 0], ry: Math.PI },
    { id: "left", origin: [-half, half], dir: [0, -1], ry: Math.PI / 2 },
  ];
  const gateStart = Math.round((perSide - gateModules) / 2);

  const pillars = [];
  const panels = [];
  for (const side of sides) {
    for (let j = 0; j < perSide; j++) {
      const t = j * module;
      const x = side.origin[0] + side.dir[0] * t;
      const z = side.origin[1] + side.dir[1] * t;
      pillars.push({ x, z, ry: side.ry, side: side.id, index: j });
      const inGate = side.id === "front" && j >= gateStart && j < gateStart + gateModules;
      if (!inGate) {
        panels.push({ x, z, ry: side.ry, side: side.id, index: j, length: module - ENCLOSURE.pillar });
      }
    }
  }

  return {
    half,
    length,
    perSide,
    module,
    gateWidth,
    gate: {
      center: [0, half],
      hingeLeft: [-(gateWidth / 2), half],
      hingeRight: [gateWidth / 2, half],
      leaf: gateWidth / 2 - 0.03,
      width: gateWidth,
      start: gateStart,
    },
    sides,
    pillars,
    panels,
  };
}
