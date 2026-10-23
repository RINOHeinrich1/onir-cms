#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const kitRoot = resolve(__dirname, "..");
const manifestPath = process.argv[2] || join(kitRoot, "scene-assets.json");

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("magic GLB invalide");
  let off = 12;
  let json = null;
  let bin = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    if (type === 0x004e4942) bin = data;
    off += 8 + len;
  }
  if (!json) throw new Error("chunk JSON absent");
  return { json, bin, size: buf.length };
}

function bboxOf(j) {
  const rootIdx = (j.scenes?.[0]?.nodes || [])[0];
  const root = rootIdx != null ? j.nodes?.[rootIdx] : null;
  const s = root?.scale?.[0] ?? 1;
  const ty = root?.translation?.[1] ?? 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let tris = 0;
  for (const m of j.meshes || []) {
    for (const p of m.primitives || []) {
      const a = j.accessors?.[p.attributes?.POSITION];
      if (a?.min && a?.max) {
        minY = Math.min(minY, a.min[1]);
        maxY = Math.max(maxY, a.max[1]);
      }
      const idx = j.accessors?.[p.indices];
      if (idx?.count) tris += idx.count / 3;
      else if (a?.count) tris += a.count / 3;
    }
  }
  return {
    rootScale: s,
    rootName: root?.name ?? null,
    height: (maxY - minY) * s,
    base: (minY + ty / s) * s,
    tris: Math.round(tris),
    meshes: (j.meshes || []).length,
  };
}

if (!existsSync(manifestPath)) {
  console.error(`FAIL  manifeste introuvable : ${manifestPath}`);
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const baseDir = resolve(kitRoot, manifest.root || ".");

const results = [];
const push = (status, name, label, detail = "") => results.push({ status, name, label, detail });
const fmt = (n) => (Number.isFinite(n) ? n.toFixed(3) : "n/a");

let failed = 0;

for (const asset of manifest.assets || []) {
  const path = join(baseDir, asset.file);
  const name = asset.type || basename(asset.file);
  if (!existsSync(path)) {
    push("FAIL", name, "fichier", `absent : ${asset.file}`);
    failed++;
    continue;
  }

  let glb;
  try {
    glb = readGlb(path);
  } catch (e) {
    push("FAIL", name, "lecture", e.message);
    failed++;
    continue;
  }

  const b = bboxOf(glb.json);
  const scale = asset.sceneScale ?? 1;
  const effH = b.height * scale;
  const effBase = b.base * scale;
  const minH = asset.expect?.minH ?? 0;
  const maxH = asset.expect?.maxH ?? Infinity;
  const mb = glb.size / 1048576;

  if (effH >= minH && effH <= maxH) {
    push("PASS", name, "hauteur en scène", `${fmt(effH * 100)} cm (attendu ${Math.round(minH * 100)}–${Math.round(maxH * 100)})`);
  } else {
    push("FAIL", name, "hauteur en scène", `${fmt(effH * 100)} cm hors [${Math.round(minH * 100)}–${Math.round(maxH * 100)}] (brut ${fmt(b.height * 100)} × ${scale})`);
    failed++;
  }

  if (Math.abs(effBase) <= 0.05) push("PASS", name, "pieds au sol", `y=${fmt(effBase)}`);
  else push("WARN", name, "pieds au sol", `y=${fmt(effBase)} — à recaler`);

  if (b.rootScale === 1) push("PASS", name, "scale racine", "1.0");
  else push("WARN", name, "scale racine", `${b.rootScale} (compensation d'unité : à documenter)`);

  if (scale !== 1) push("INFO", name, "scale de scène", `${scale} (déclaré dans le manifeste)`);

  const maxTris = asset.maxTris ?? 5000;
  if (b.tris <= maxTris) push("PASS", name, "triangles", `${b.tris} (max ${maxTris})`);
  else {
    push("FAIL", name, "triangles", `${b.tris} > ${maxTris}`);
    failed++;
  }

  if (mb <= 2) push("PASS", name, "poids", `${mb.toFixed(2)} Mo`);
  else push("WARN", name, "poids", `${mb.toFixed(2)} Mo`);
}

const widths = { PASS: 4, FAIL: 4, WARN: 4, INFO: 4 };
for (const r of results) {
  const tag = r.status.padEnd(widths[r.status] || 4);
  console.log(`${tag}  ${r.name.padEnd(10)} ${r.label}${r.detail ? " — " + r.detail : ""}`);
}

console.log(
  `\n${failed === 0 ? "✔ PROPS CONFORMES" : `✘ ${failed} PROP(S) NON CONFORME(S)`} — ${results.length} vérifications`
);
process.exit(failed === 0 ? 0 : 1);
