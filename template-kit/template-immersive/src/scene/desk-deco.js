// Peinture du tableau mural 3D (décoration statique).
/** Tableau MURAL = simple décoration (peinture), sans contenu dynamique. */
export function paintDecoBoard({ canvas, ctx, tex, invalidate }) {
  const c = canvas; if (!c || !ctx) return;
  const g = ctx, W = c.width, H = c.height;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#9cb8d6"); sky.addColorStop(0.6, "#d9c9a6"); sky.addColorStop(1, "#b79a6a");
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,236,190,.92)"; g.beginPath(); g.arc(W * 0.24, H * 0.3, W * 0.055, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#6f7f5a"; g.beginPath(); g.moveTo(0, H * 0.68); g.quadraticCurveTo(W * 0.3, H * 0.5, W * 0.55, H * 0.68);
  g.quadraticCurveTo(W * 0.8, H * 0.82, W, H * 0.66); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  g.fillStyle = "#4f5d3d"; g.beginPath(); g.moveTo(0, H * 0.82); g.quadraticCurveTo(W * 0.4, H * 0.7, W, H * 0.86);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  g.strokeStyle = "rgba(214,183,130,.85)"; g.lineWidth = W * 0.012; g.strokeRect(W * 0.014, H * 0.022, W * 0.972, H * 0.956);
  tex.needsUpdate = true;
  invalidate();
}
