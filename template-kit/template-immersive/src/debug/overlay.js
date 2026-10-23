// Overlay de diagnostic (?debug=1) : métriques + bouton « copier JSON ».
import { DESK } from "../constants.js";
import { checkInvariants } from "../state/machine.js";
export function createDebugOverlay({ THREE, getRefs, timer }) {
  let el = null;
  let btn = null;
  let t = 0;

/** Mode debug : valeurs 3D à l'écran (activer avec ?debug=1). */
function build() {
  if (el) return;
  el = document.createElement("pre");
  el.id = "onirtech-debug";
  el.style.cssText = [
    "position:fixed", "top:8px", "left:8px", "z-index:9999",
    "margin:0", "padding:8px 10px", "max-width:min(560px,92vw)",
    "background:rgba(8,10,13,.86)", "color:#cfe3ff", "border:1px solid #2b3947",
    "border-radius:8px", "font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace",
    "white-space:pre", "pointer-events:auto", "user-select:text"
  ].join(";");
  btn = document.createElement("button");
  btn.textContent = "copier JSON";
  btn.style.cssText = "position:fixed;top:8px;right:8px;z-index:9999;background:#16202b;color:#cfe3ff;border:1px solid #2b3947;border-radius:6px;padding:5px 9px;font:11px ui-monospace;cursor:pointer";
  btn.onclick = () => {
    try { navigator.clipboard.writeText(JSON.stringify(window.__onirtech?.__metrics || {}, null, 2)); btn.textContent = "copié ✓"; }
    catch { btn.textContent = "copie refusée"; }
    (timer ?? window.setTimeout)(() => (btn.textContent = "copier JSON"), 1500);
  };
  document.body.appendChild(el);
  document.body.appendChild(btn);

}

function update(dt) {
  build();
  t += dt;
  if (t <= 0.2) return;
  t = 0;
  const refs = getRefs();
  const {
    avatar, restPose, animTicks, camera, roomGroup, deskObj, chairObj,
    renderer, scene, look, quality, pages, pageIndex, bookov, machine,
  } = refs;
  const frameMs = dt * 1000;
  const invariants = machine ? checkInvariants(machine.get()) : [];
    const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : "n/a");
  const boxOf = (o) => {
    if (!o) return null;
    const b = new THREE.Box3().setFromObject(o);
    if (!Number.isFinite(b.min.x)) return null;
    return { min: b.min.toArray().map((v) => +v.toFixed(3)), max: b.max.toArray().map((v) => +v.toFixed(3)) };
  };
  const inter = (a, b) => {
    if (!a || !b) return { x: 0, y: 0, z: 0, vol: 0 };
    const dx = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
    const dy = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
    const dz = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);
    const px = Math.max(0, dx), py = Math.max(0, dy), pz = Math.max(0, dz);
    return { x: +px.toFixed(3), y: +py.toFixed(3), z: +pz.toFixed(3), vol: +(px * py * pz).toFixed(4) };
  };

  const skinBoxOf = (root) => {
    if (!root) return null;
    const b = new THREE.Box3();
    root.updateWorldMatrix(true, true);
    root.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.computeBoundingBox();
        if (o.boundingBox) b.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
      } else if (o.isMesh && !o.isSkinnedMesh) {
        b.union(new THREE.Box3().setFromObject(o));
      }
    });
    if (b.isEmpty()) return null;
    return { min: b.min.toArray().map((v) => +v.toFixed(3)), max: b.max.toArray().map((v) => +v.toFixed(3)) };
  };
  const av = avatar ? boxOf(avatar) : null;
  const avSkin = avatar ? skinBoxOf(avatar) : null;
  const desk = boxOf(deskObj);
  const chair = boxOf(chairObj);
  let hips = null, head = null;
  if (avatar) {
    avatar.traverse((n) => {
      if (!n.isBone) return;
      if (n.name === "Hips") hips = n.getWorldPosition(new THREE.Vector3()).y;
      if (n.name === "Head") head = n.getWorldPosition(new THREE.Vector3()).y;
    });
  }
  const avH = av ? +(av.max[1] - av.min[1]).toFixed(3) : null;
  const avSkinH = avSkin ? +(avSkin.max[1] - avSkin.min[1]).toFixed(3) : null;
  const posture = hips != null ? (hips <= 0.60 ? "assis" : hips <= 0.80 ? "intermédiaire" : "DEBOUT") : "n/a";
  const KEY_BONES = ["Hips", "Spine", "Spine1", "LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "LeftArm", "RightArm", "Neck", "Head"];
  let poseMax = 0, poseMean = 0, poseN = 0, bones = 0, morphSum = 0, morphN = 0;
  if (avatar) {
    avatar.traverse((n) => {
      if (n.isBone) {
        bones++;
        const q0 = restPose.get(n.name);
        if (q0 && KEY_BONES.includes(n.name)) {
          const d = Math.min(1, Math.abs(n.quaternion.dot(q0)));
          const ang = (2 * Math.acos(d) * 180) / Math.PI;
          poseMax = Math.max(poseMax, ang); poseMean += ang; poseN++;
        }
      }
      if (n.isSkinnedMesh && n.morphTargetInfluences) {
        for (const v of n.morphTargetInfluences) { morphSum += Math.abs(v); morphN++; }
      }
    });
  }
  if (poseN) poseMean /= poseN;

  // couverture écran
  let coverage = null, inFrame = null;
  if (av) {
    const corners = [];
    for (const x of [av.min[0], av.max[0]]) for (const y of [av.min[1], av.max[1]]) for (const z of [av.min[2], av.max[2]])
      corners.push(new THREE.Vector3(x, y, z).project(camera));
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y), zs = corners.map((c) => c.z);
    const minX = Math.max(-1, Math.min(...xs)), maxX = Math.min(1, Math.max(...xs));
    const minY = Math.max(-1, Math.min(...ys)), maxY = Math.min(1, Math.max(...ys));
    const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY) / 4;
    coverage = +(area * 100).toFixed(1);
    inFrame = maxX > minX && maxY > minY && Math.min(...zs) < 1;
  }

  // occlusion : rayon caméra → tête
  let occl = "aucune";
  if (head && camera) {
    const target = new THREE.Vector3();
    avatar.getWorldPosition(target);
    target.y = head;
    const dir = target.clone().sub(camera.position);
    const dist = dir.length();
    dir.normalize();
    const rc = new THREE.Raycaster(camera.position.clone(), dir, 0.05, dist - 0.05);
    const hits = rc.intersectObjects(roomGroup.children, true);
    if (hits.length) {
      const h = hits[0].object;
      let name = h.name || h.type;
      const isUnder = (o, root) => { let p = o; while (p) { if (p === root) return true; p = p.parent; } return false; };
      if (deskObj && isUnder(h, deskObj)) name = "BUREAU";
      else if (chairObj && isUnder(h, chairObj)) name = "CHAISE";
      else if (avatar && isUnder(h, avatar)) name = "AVATAR";
      occl = name + " à " + hits[0].distance.toFixed(2) + " m";
    }
  }

  let skel = null;
  if (avatar) {
    avatar.traverse((o) => {
      if (!skel && o.isSkinnedMesh && o.skeleton) {
        const bs = o.skeleton.bones || [];
        const find = (n) => bs.find((b) => b.name === n);
        const wp = (b) => (b ? +b.getWorldPosition(new THREE.Vector3()).y.toFixed(3) : null);
        let inTree = true;
        if (bs[0]) { let p = bs[0]; inTree = false; while (p) { if (p === avatar) { inTree = true; break; } p = p.parent; } }
        skel = { bones: bs.length, hipsY: wp(find("Hips")), headY: wp(find("Head")), inTree, root: bs[0]?.name || null };
      }
    });
  }

  const gpu = (() => { try { const gl = renderer.getContext(); const d = gl.getExtension("WEBGL_debug_renderer_info"); return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)).slice(0, 42) : "n/a"; } catch { return "n/a"; } })();

  const cam = camera;
  const info = renderer.info.render;

  const metrics = {
    avatar: { pos: avatar ? avatar.position.toArray().map((v) => +v.toFixed(3)) : null, box: av, boxSkin: avSkin, hauteurBind: avH, hauteurSkin: avSkinH, pieds: avSkin ? avSkin.min[1] : av ? av.min[1] : null, hipsY: hips ? +hips.toFixed(3) : null, headY: head ? +head.toFixed(3) : null, posture },
    scene: { solY: 0, bureau: desk, tableTopY: desk ? desk.max[1] : null, chaise: chair, chaiseTopY: chair ? chair.max[1] : null },
    collision: { avatar_bureau: inter(av, desk), avatar_chaise: inter(av, chair) },
    camera: { pos: cam.position.toArray().map((v) => +v.toFixed(2)), fov: cam.fov, near: cam.near, far: cam.far, cible: look ? look.toArray().map((v) => +v.toFixed(2)) : null },
    rendu: { drawCalls: info.calls, triangles: info.triangles, frameMs: +(frameMs || 0).toFixed(1), qualite: quality, env: !!scene.environment, gpu },
    squelette: skel,
    animation: { ticks: animTicks, poseMaxDeg: +poseMax.toFixed(1), poseMeanDeg: +poseMean.toFixed(1), bones, morphSum: +morphSum.toFixed(3), morphCount: morphN },
    visibilite: { couverturePct: coverage, dansCadre: inFrame, occlusion: occl },
    livre: { ouvert: !!(bookov && bookov.classList.contains("open")), mode: bookov && bookov.classList.contains("single") ? "single" : "double", pages: pages.length, page: pageIndex + 1, lignes: (pages[pageIndex] && pages[pageIndex].lines ? pages[pageIndex].lines.length : 0) },
    desir: { avatar: DESK.avatar, desk: DESK.pos, scale: DESK.scale, ry: +DESK.ry.toFixed(3) }
  };
  if (window.__onirtech) window.__onirtech.__metrics = metrics;

  const l = [];
  l.push("POSOBJ   " + JSON.stringify((window.__onirtech?.__metrics?.avatar?.pos) || []));
  l.push("AVATAR   pieds=" + fmt(metrics.avatar.pieds, 3) + "m  haut(skin)=" + fmt(avSkinH, 3) + "m  haut(bind)=" + fmt(avH, 3) + "m  posture=" + posture);
  l.push("         hanches=" + fmt(hips, 3) + "m  tete=" + fmt(head, 3) + "m");
  l.push("SOL      y=0.000");
  l.push("BUREAU   top=" + fmt(metrics.scene.tableTopY, 3) + "m  z=[" + (desk ? desk.min[2] + " → " + desk.max[2] : "n/a") + "]");
  l.push("CHAISE   top=" + fmt(metrics.scene.chaiseTopY, 3) + "m  z=[" + (chair ? chair.min[2] + " → " + chair.max[2] : "n/a") + "]");
  l.push("INTER    avatar∩bureau=" + metrics.collision.avatar_bureau.vol + " m³  (Δy=" + metrics.collision.avatar_bureau.y + ")");
  l.push("         avatar∩chaise=" + metrics.collision.avatar_chaise.vol + " m³  (Δy=" + metrics.collision.avatar_chaise.y + ")");
  l.push("CAM      pos=" + metrics.camera.pos.join(",") + "  cible=" + (metrics.camera.cible||[]).join(",") + "  fov=" + cam.fov);
  l.push("RENDU    " + info.calls + " calls · " + info.triangles + " tris · " + fmt(metrics.rendu.frameMs, 1) + " ms · q=" + quality);
  l.push("POSTURE  hanches=" + fmt(hips, 3) + "  tete=" + fmt(head, 3) + "  assise chaise=" + fmt(metrics.scene.chaiseTopY, 3));
  l.push("POSE     delta max=" + fmt(poseMax, 1) + "° moy=" + fmt(poseMean, 1) + "°  os=" + bones + "  morphs=" + fmt(morphSum, 3));
  l.push("SKELETTE " + (skel ? skel.bones + " os · Hips=" + fmt(skel.hipsY, 3) + " · Head=" + fmt(skel.headY, 3) + " · dansAvatar=" + skel.inTree : "n/a"));
  l.push("ANIM     ticks=" + animTicks + "  (0 = avatar figé)");
  l.push("ÉCRAN    couverture=" + fmt(coverage, 1) + "%  cadre=" + (inFrame ? "oui" : "non") + "  occlusion=" + occl);
  l.push("LIVRE    " + (metrics.livre.ouvert ? metrics.livre.mode + " · page " + metrics.livre.page + "/" + metrics.livre.pages + " · " + metrics.livre.lignes + " lignes" : "fermé"));
  l.push("GPU      " + gpu);
  l.push("ATTENDU  avatar y=0 · bureau top≈1.00 · chaise top≈1.22");
  el.textContent = l.join("\n");
}

  function dispose() {
    el?.remove();
    btn?.remove();
    el = null;
    btn = null;
  }

  return { update, dispose, build, get enabled() { return !!el; } };
}
