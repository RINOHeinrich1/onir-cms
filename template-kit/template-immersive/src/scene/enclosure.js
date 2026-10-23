// Cour fermée : clôture procédurale, portail, haie et rideau d'arbres.
import { ENCLOSURE, enclosureLayout } from "../lib/enclosure-layout.js";

const GATE_LEAF_HEIGHT = 1.45;


/** Rideau d'arbres déterministe autour de la cour (masque l'horizon). */
function treeRing({ count = 34, radius = 18.5, skipFront = 0.22 }) {
  const trunks = [];
  const foliage = [];
  let seed = 0x51ed270b;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let q = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.08;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < skipFront) continue; // couloir du portail
    const r = radius + rnd() * 3.5;
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const h = 4.2 + rnd() * 2.6;
    trunks.push({ x, z, h, s: 0.75 + rnd() * 0.5 });
    for (let k = 0; k < 3; k++) {
      foliage.push({
        x: x + (rnd() - 0.5) * 1.1,
        z: z + (rnd() - 0.5) * 1.1,
        y: h - 1.1 + k * (h * 0.24) - 0.4,
        r: (1.5 - k * 0.32) * (0.8 + rnd() * 0.4),
        tint: 0.72 + rnd() * 0.28,
      });
    }
  }
  return { trunks, foliage };
}

/** Haie : buissons irréguliers tout autour du pourtour (coins compris). */
function hedgeBushes(layout) {
  const bushes = [];
  const step = 0.62;
  let seed = 0x2545f491;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let q = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
  const normals = { back: [0, -1], right: [1, 0], front: [0, 1], left: [-1, 0] };
  for (const side of layout.sides) {
    const [nx, nz] = normals[side.id];
    const out = 0.98;
    for (let t = 0; t <= layout.length; t += step) {
      const x = side.origin[0] + side.dir[0] * t + nx * out;
      const z = side.origin[1] + side.dir[1] * t + nz * out;
      if (side.id === "front" && Math.abs(x) < layout.gate.width / 2 + 0.35) continue;
      const r = 0.55 + rnd() * 0.25;
      bushes.push({
        x: x + (rnd() - 0.5) * 0.24,
        z: z + (rnd() - 0.5) * 0.24,
        y: 0.5 + rnd() * 0.22,
        r,
        h: 1.35 + rnd() * 0.42,
        tint: 0.7 + rnd() * 0.35,
      });
    }
  }
  return bushes;
}

export function buildEnclosure({ THREE, ASSET, mkPBR, TEX_TILE, withAO, uvBox, onDiag, invalidate }) {
  /** Matrice d'un élément : rotation Y + échelle non uniforme + position. */
  const placeMatrix = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4()
    .makeRotationY(ry)
    .scale(new THREE.Vector3(sx, sy, sz))
    .setPosition(x, y, z);

  const group = new THREE.Group();
  const layout = enclosureLayout();
  const zGate = layout.gate.center[1];

  // DoubleSide : les panneaux restent visibles des deux côtés de la cour.
  const panelMat = mkPBR("plaster", { roughness: 0.95, color: 0x9c9587, normalScale: 0.7, side: THREE.DoubleSide });
  const pillarMat = mkPBR("plaster", { roughness: 0.95, color: 0xa8a090, normalScale: 0.8, side: THREE.DoubleSide });
  const gateMat = mkPBR("wood", { roughness: 0.6, color: 0x5a4b3c, side: THREE.DoubleSide });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.45, metalness: 0.75 });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });

  // ---- Clôture : panneaux et piliers procéduraux (aucun asset client) --------
  const dirs = { back: [1, 0], right: [0, 1], front: [-1, 0], left: [0, -1] };
  const panelGeo = new THREE.BoxGeometry(ENCLOSURE.panel, ENCLOSURE.height, 0.08);
  const pillarGeo = new THREE.BoxGeometry(ENCLOSURE.pillar, 1.35, ENCLOSURE.pillar);
  const panelMesh = new THREE.InstancedMesh(panelGeo, panelMat, layout.panels.length);
  const pillarMesh = new THREE.InstancedMesh(pillarGeo, pillarMat, layout.pillars.length);
  layout.panels.forEach((p, i) => {
    const [dx, dz] = dirs[p.side];
    panelMesh.setMatrixAt(
      i,
      placeMatrix(p.x + dx * (ENCLOSURE.module / 2), ENCLOSURE.height / 2, p.z + dz * (ENCLOSURE.module / 2), p.ry),
    );
  });
  layout.pillars.forEach((p, i) => {
    pillarMesh.setMatrixAt(i, placeMatrix(p.x, 0.675, p.z, p.ry));
  });
  panelMesh.castShadow = true; panelMesh.receiveShadow = true;
  pillarMesh.castShadow = true; pillarMesh.receiveShadow = true;
  group.add(panelMesh, pillarMesh);
  onDiag(`clôture: ${layout.panels.length} panneaux, ${layout.pillars.length} piliers`);
  invalidate();

  // ---- Portail : deux piliers maçonnés + deux vantaux bois -------------------
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const stoneParts = [];
  for (const hx of [layout.gate.hingeLeft[0], layout.gate.hingeRight[0]]) {
    stoneParts.push({ x: hx, y: 0.15, z: zGate, sx: 0.62, sy: 0.3, sz: 0.62 });
    stoneParts.push({ x: hx, y: 1.05, z: zGate, sx: 0.5, sy: 1.5, sz: 0.5 });
    stoneParts.push({ x: hx, y: 1.85, z: zGate, sx: 0.64, sy: 0.1, sz: 0.64 });
  }
  stoneParts.push({ x: 0, y: 0.03, z: zGate, sx: layout.gate.width + 0.2, sy: 0.06, sz: 0.42 });
  const stoneMesh = new THREE.InstancedMesh(unitBox, pillarMat, stoneParts.length);
  stoneParts.forEach((p, i) => stoneMesh.setMatrixAt(i, placeMatrix(p.x, p.y, p.z, 0, p.sx, p.sy, p.sz)));
  stoneMesh.castShadow = true; stoneMesh.receiveShadow = true;
  group.add(stoneMesh);

  const leafW = layout.gate.leaf;
  const leafY = 0.1 + GATE_LEAF_HEIGHT / 2;
  const rails = [];
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(uvBox(new THREE.BoxGeometry(leafW, GATE_LEAF_HEIGHT, 0.055), leafW, GATE_LEAF_HEIGHT, 0.055, TEX_TILE.wood), gateMat);
    leaf.position.set(side * (0.03 + leafW / 2), leafY, zGate);
    leaf.castShadow = true; leaf.receiveShadow = true;
    group.add(leaf);
    for (const ry of [0.28, 0.86, 1.3]) rails.push({ x: side * (0.03 + leafW / 2), y: 0.1 + ry });
  }
  const railMesh = new THREE.InstancedMesh(unitBox, gateMat, rails.length);
  rails.forEach((r, i) => railMesh.setMatrixAt(i, placeMatrix(r.x, r.y, zGate + 0.045, 0, leafW - 0.1, 0.07, 0.075)));
  railMesh.castShadow = true;
  group.add(railMesh);
  const handles = new THREE.InstancedMesh(unitBox, ironMat, 2);
  [-1, 1].forEach((side, i) => {
    handles.setMatrixAt(i, placeMatrix(side * 0.16, 1.0, zGate + 0.09, 0, 0.2, 0.05, 0.06));
  });
  group.add(handles);

  // ---- Haie : buissons instanciés (silhouette irrégulière, coins bouchés) -----
  const bushes = hedgeBushes(layout);
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, bushes.length);
  const tint = new THREE.Color();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  bushes.forEach((b, i) => {
    v.set(b.x, b.y, b.z);
    s.set(b.r, b.h / 2, b.r);
    bushMesh.setMatrixAt(i, new THREE.Matrix4().compose(v, q, s));
    bushMesh.setColorAt(i, tint.setRGB(0.09 * b.tint, 0.17 * b.tint, 0.08 * b.tint));
  });
  if (bushMesh.instanceColor) bushMesh.instanceColor.needsUpdate = true;
  bushMesh.castShadow = true; bushMesh.receiveShadow = true;
  group.add(bushMesh);

  // ---- Rideau d'arbres -------------------------------------------------------
  const { trunks, foliage } = treeRing({});
  const trunkMesh = new THREE.InstancedMesh(unitBox, mkPBR("wood", { roughness: 0.95, color: 0x6b5a46 }), trunks.length);
  trunks.forEach((t, i) => {
    v.set(t.x, t.h / 2, t.z); s.set(0.22 * t.s, t.h, 0.22 * t.s);
    trunkMesh.setMatrixAt(i, new THREE.Matrix4().compose(v, q, s));
  });
  trunkMesh.castShadow = true; trunkMesh.receiveShadow = true;
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const leafMesh = new THREE.InstancedMesh(bushGeo, leafMat, foliage.length);
  foliage.forEach((f, i) => {
    v.set(f.x, f.y, f.z); s.set(f.r, f.r * 0.85, f.r);
    leafMesh.setMatrixAt(i, new THREE.Matrix4().compose(v, q, s));
    leafMesh.setColorAt(i, tint.setRGB(0.08 * f.tint, 0.15 * f.tint, 0.07 * f.tint));
  });
  if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
  leafMesh.castShadow = true;
  group.add(trunkMesh, leafMesh);

  onDiag(`cour: ${bushes.length} buissons, ${trunks.length} arbres`);
  return { group, layout };
}
