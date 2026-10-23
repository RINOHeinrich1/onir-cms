#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const ARKIT = [
  "eyeBlinkLeft","eyeLookDownLeft","eyeLookInLeft","eyeLookOutLeft","eyeLookUpLeft","eyeSquintLeft","eyeWideLeft",
  "eyeBlinkRight","eyeLookDownRight","eyeLookInRight","eyeLookOutRight","eyeLookUpRight","eyeSquintRight","eyeWideRight",
  "jawForward","jawLeft","jawRight","jawOpen",
  "mouthClose","mouthFunnel","mouthPucker","mouthLeft","mouthRight","mouthSmileLeft","mouthSmileRight",
  "mouthFrownLeft","mouthFrownRight","mouthDimpleLeft","mouthDimpleRight","mouthStretchLeft","mouthStretchRight",
  "mouthRollLower","mouthRollUpper","mouthShrugLower","mouthShrugUpper","mouthPressLeft","mouthPressRight",
  "mouthLowerDownLeft","mouthLowerDownRight","mouthUpperUpLeft","mouthUpperUpRight",
  "browDownLeft","browDownRight","browInnerUp","browOuterUpLeft","browOuterUpRight",
  "cheekPuff","cheekSquintLeft","cheekSquintRight","noseSneerLeft","noseSneerRight","tongueOut"
];

const VISEMES = ["viseme_sil","viseme_PP","viseme_FF","viseme_TH","viseme_DD","viseme_kk","viseme_CH","viseme_SS",
  "viseme_nn","viseme_RR","viseme_aa","viseme_E","viseme_I","viseme_O","viseme_U"];

const BONES = ["Hips","Spine","Spine1","Spine2","Neck","Head",
  "LeftShoulder","LeftArm","LeftForeArm","LeftHand",
  "RightShoulder","RightArm","RightForeArm","RightHand",
  "LeftUpLeg","LeftLeg","LeftFoot","LeftToeBase",
  "RightUpLeg","RightLeg","RightFoot","RightToeBase"];

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const maxMb = Number((args.find((a) => a.startsWith("--max-mb=")) || "--max-mb=3.2").split("=")[1]);
const minH = Number((args.find((a) => a.startsWith("--min-h=")) || "--min-h=1.55").split("=")[1]);
const maxH = Number((args.find((a) => a.startsWith("--max-h=")) || "--max-h=1.85").split("=")[1]);

if (!file) {
  console.error("usage: validate-avatar.mjs <fichier.glb> [--max-mb=3.2] [--min-h=1.55] [--max-h=1.85]");
  process.exit(2);
}

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("Ce n'est pas un GLB (magic invalide)");
  const version = buf.readUInt32LE(4);
  let off = 12;
  let json = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    off += 8 + len;
  }
  if (!json) throw new Error("Chunk JSON absent");
  return { json, version, size: buf.length };
}

const results = [];
const ok = (label, detail = "") => results.push({ status: "PASS", label, detail });
const ko = (label, detail = "") => results.push({ status: "FAIL", label, detail });
const warn = (label, detail = "") => results.push({ status: "WARN", label, detail });

let glb;
try {
  glb = readGlb(file);
} catch (e) {
  console.error(`FAIL  lecture : ${e.message}`);
  process.exit(1);
}

const j = glb.json;
const mb = glb.size / 1048576;

if (mb <= maxMb) ok("poids", `${mb.toFixed(2)} Mo (max ${maxMb})`);
else ko("poids", `${mb.toFixed(2)} Mo > ${maxMb} Mo`);

const skins = j.skins || [];
if (skins.length === 1) ok("peau (skin)", "1 skin");
else ko("peau (skin)", `${skins.length} skin(s) — 1 attendu`);

const boneNames = new Set();
for (const s of skins) for (const jt of s.joints || []) {
  const n = j.nodes?.[jt]?.name;
  if (n) boneNames.add(n);
}
const missingBones = BONES.filter((b) => !boneNames.has(b));
if (missingBones.length === 0) ok("squelette Mixamo", `${BONES.length}/${BONES.length} os requis`);
else ko("squelette Mixamo", `manquants : ${missingBones.join(", ")}`);

const rootIdx = (j.scenes?.[0]?.nodes || [])[0];
const root = rootIdx != null ? j.nodes?.[rootIdx] : null;
if (root && root.name === "Armature") ok("racine", "Armature");
else ko("racine", `attendu "Armature", trouvé "${root?.name ?? "aucune"}"`);

const morphNames = new Set();
for (const m of j.meshes || []) {
  const names = m.extras?.targetNames;
  if (Array.isArray(names)) for (const n of names) morphNames.add(n);
}
const missingArkit = ARKIT.filter((n) => !morphNames.has(n));
if (morphNames.size === 0) {
  ko("blendshapes ARKit", "aucun nom de morph exposé (mesh.extras.targetNames absent)");
} else if (missingArkit.length === 0) {
  ok("blendshapes ARKit", `${ARKIT.length}/${ARKIT.length}`);
} else {
  ko("blendshapes ARKit", `${ARKIT.length - missingArkit.length}/${ARKIT.length} — manquants : ${missingArkit.slice(0, 8).join(", ")}${missingArkit.length > 8 ? "…" : ""}`);
}
const visCount = VISEMES.filter((n) => morphNames.has(n)).length;
if (visCount === VISEMES.length) ok("visèmes Oculus", `${visCount}/${VISEMES.length}`);
else warn("visèmes Oculus", `${visCount}/${VISEMES.length} (facultatif si avatar muet)`);

// envergure du squelette : distance monde Hips → Head (détecte un rig écrasé)
function nodeWorldPos(json, name, rootIdx) {
  const nodes = json.nodes || [];
  const idxByName = new Map();
  nodes.forEach((n, i) => { if (n.name) idxByName.set(n.name, i); });
  const target = idxByName.get(name);
  if (target == null) return null;
  const parents = new Map();
  nodes.forEach((n, i) => (n.children || []).forEach((c) => parents.set(c, i)));
  const chain = [];
  let cur = target;
  while (cur != null) { chain.unshift(cur); cur = parents.get(cur); }
  let x = 0, y = 0, z = 0, s = 1;
  for (const i of chain) {
    const n = nodes[i];
    const sc = n.scale?.[0] ?? 1;
    const t = n.translation || [0, 0, 0];
    x = x * sc + t[0] * s; y = y * sc + t[1] * s; z = z * sc + t[2] * s; s *= sc;
  }
  return [x, y, z];
}
const hipsPos = nodeWorldPos(j, "Hips", rootIdx);
const headPos = nodeWorldPos(j, "Head", rootIdx);
if (hipsPos && headPos) {
  const d = Math.hypot(headPos[0] - hipsPos[0], headPos[1] - hipsPos[1], headPos[2] - hipsPos[2]);
  if (d >= 0.45 && d <= 0.85) ok("envergure du squelette", `Hips→Head ${(d * 100).toFixed(1)} cm`);
  else ko("envergure du squelette", `Hips→Head ${(d * 100).toFixed(1)} cm (attendu 45–85) — rig écrasé : les poses n'auront aucun effet`);
} else {
  warn("envergure du squelette", "os Hips/Head introuvables");
}

const scale = root?.scale?.[0] ?? 1;
let minY = Infinity;
let maxY = -Infinity;
for (const m of j.meshes || []) {
  for (const p of m.primitives || []) {
    const a = j.accessors?.[p.attributes?.POSITION];
    if (!a?.min || !a?.max) continue;
    minY = Math.min(minY, a.min[1]);
    maxY = Math.max(maxY, a.max[1]);
  }
}
const seated = j.asset?.extras?.pose === "seated";
const lo = seated ? 1.1 : minH;
const hi = seated ? 1.45 : maxH;
const height = (maxY - minY) * scale;
const base = (minY + (root?.translation?.[1] ?? 0) / scale) * scale;
if (Number.isFinite(height)) {
  if (height >= lo && height <= hi) ok(seated ? "hauteur (assise)" : "hauteur", `${(height * 100).toFixed(1)} cm`);
  else ko("hauteur", `${(height * 100).toFixed(1)} cm hors [${lo * 100}-${hi * 100}]${seated ? " (mode assis)" : ""}`);
  if (Math.abs(base) <= 0.05) ok("pieds au sol", `y=${base.toFixed(3)}`);
  else ko("pieds au sol", `y=${base.toFixed(3)} — pivot ≠ pieds (décalage en scène)`);
} else {
  warn("hauteur", "indéterminable (accesseurs POSITION sans min/max)");
}

const mats = j.materials || [];
const metallic = mats.filter((m) => !m.pbrMetallicRoughness || (m.pbrMetallicRoughness.metallicFactor ?? 1) > 0.5);
if (metallic.length === 0) ok("matériaux", "métal ≈ 0 (rendu correct sans envmap)");
else warn("matériaux", `${metallic.length} matériau(x) métallique(s) — nécessite un environment map`);

const alpha = mats.filter((m) => m.alphaMode === "BLEND");
if (alpha.length) warn("transparence", `${alpha.length} matériau(x) en BLEND — préférer MASK (tri + halos)`);

for (const r of results) {
  const tag = r.status.padEnd(4);
  console.log(`${tag}  ${r.label}${r.detail ? " — " + r.detail : ""}`);
}

const failed = results.filter((r) => r.status === "FAIL").length;
console.log(`\n${failed === 0 ? "✔ AVATAR CONFORME" : `✘ ${failed} CONTRAT(S) NON RESPECTÉ(S)`} — ${basename(file)}`);
process.exit(failed === 0 ? 0 : 1);
