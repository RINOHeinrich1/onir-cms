// Couverture de livre partagée 3D/2D.

import * as THREE from "../../vendor/immersive.js";

// --- Couverture unique (cuir + double liseré doré + titre Georgia) — 3D et 2D. ----

export function makeCoverCanvas(w, h, title = "Album") {
  const c = document.createElement("canvas");
  c.width = Math.max(2, Math.round(w)); c.height = Math.max(2, Math.round(h));
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, "#4a3526"); grad.addColorStop(1, "#241708");
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  const rg = g.createRadialGradient(c.width * 0.3, c.height * 0.15, 0, c.width * 0.3, c.height * 0.15, Math.max(c.width, c.height));
  rg.addColorStop(0, "rgba(255,255,255,.08)"); rg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = rg; g.fillRect(0, 0, c.width, c.height);
  const n = Math.round((c.width * c.height) / 60);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 1.4, 1.4);
  }
  const m = Math.min(c.width, c.height);
  const i1 = m * 0.075, i2 = m * 0.11;
  g.strokeStyle = "rgba(214,183,130,.7)"; g.lineWidth = Math.max(2, m * 0.006);
  g.strokeRect(i1, i1, c.width - 2 * i1, c.height - 2 * i1);
  g.lineWidth = Math.max(1, m * 0.002);
  g.strokeRect(i2, i2, c.width - 2 * i2, c.height - 2 * i2);
  g.fillStyle = "#e7d3a8"; g.textAlign = "center"; g.textBaseline = "middle";
  const label = String(title || "Album").toUpperCase();
  let fontPx = Math.round(m * 0.13);
  g.font = `600 ${fontPx}px Georgia, 'Times New Roman', serif`;
  const maxTextW = c.width - 2 * i2 - m * 0.05;
  while (fontPx > 8 && g.measureText(label).width > maxTextW) {
    fontPx -= 1;
    g.font = `600 ${fontPx}px Georgia, 'Times New Roman', serif`;
  }
  g.fillText(label, c.width / 2, c.height / 2);
  return c;
}

export function makeCoverTexture(title = "Album") {
  const tex = new THREE.CanvasTexture(makeCoverCanvas(512, 360, title));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
