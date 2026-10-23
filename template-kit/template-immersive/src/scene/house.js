// Extérieur : maison fermée (murs, toit, porte, terrain).
export function buildHouse({ THREE, mkPBR, texGet, withAO, uvBox, uvScale, TEX_TILE, scene }) {
  /** EXTÉRIEUR : maison FERMÉE (murs enduit sur les 4 faces + toit 2 pans), alignée sur la salle. */
  const g = new THREE.Group();
  scene.add(g);


  // Porte + encadrement + seuil : groupe SÉPARÉ de la coque. La coque est masquée
  // quand on est dans la salle, mais la porte fermée et son encadrement doivent rester
  // visibles (sinon on voit le ciel à travers l'embrasure).
  const doorAsm = new THREE.Group();
  scene.add(doorAsm);
  // Vitrages + croisillons + appuis : même géométrie que la façade, mais séparés
  // de la coque pour rester visibles depuis l'intérieur (baies de la salle).
  const windowAsm = new THREE.Group();
  scene.add(windowAsm);

  const W = 7.2, D = 7.2, H = 3.1;
  const doorW = 1.3, doorH = 2.3, half = doorW / 2, sideW = (W - doorW) / 2;
  const zF = D / 2;

  const wallMat = mkPBR("plaster", { roughness: 0.95, color: 0xe8e8e8, normalScale: 0.55, side: THREE.DoubleSide });
  const roofMat = mkPBR("roof", { roughness: 0.9 });
  const stone = mkPBR("stone", { roughness: 1 });
  const doorMat = mkPBR("wood", { roughness: 0.6, color: 0x5c5c5c });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.7 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xcfe0ea, roughness: 0.24, metalness: 0.0,
    transparent: true, opacity: 0.14, envMapIntensity: 1.0,
    clearcoat: 0.22, clearcoatRoughness: 0.28, side: THREE.DoubleSide,
  });

  // Coque extérieure : murs ÉPAIS (0,20 m) posés vers l'extérieur. Les arêtes ont
  // un volume réel (fin de l'effet « feuille de carton ») et les baies ont un
  // renfoncement de 20 cm, ce qui donne de vraies ombres sur l'embrasure.
  const t = 0.2;
  const wallBox = (w, hh, x, y, z) => {
    const mm = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(w, hh, t), w, hh, t, TEX_TILE.plaster)), wallMat);
    mm.position.set(x, y, z); mm.castShadow = true; mm.receiveShadow = true; g.add(mm);
  };
  wallBox(W, H, 0, H / 2, -(D / 2 + t / 2));           // fond
  for (const sx of [-1, 1]) {                          // gauche / droite (profondeur + coins)
    const mm = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(t, H, D + 2 * t), t, H, D + 2 * t, TEX_TILE.plaster)), wallMat);
    mm.position.set(sx * (W / 2 + t / 2), H / 2, 0); mm.castShadow = true; mm.receiveShadow = true; g.add(mm);
  }

  // Façade avant découpée autour de la porte et des deux fenêtres (baies réelles).
  const zFw = D / 2 + t / 2;
  const winY = 2.15, winH = 1.25, winX = 2.25, winW = 1.0;
  const winLo = winY - winH / 2, winHi = winY + winH / 2;
  const front = (w, hh, cx, cy) => wallBox(w, hh, cx, cy, zFw);
  front(0.85, H, -3.175, H / 2);                       // bande gauche
  front(1.0, winLo, -winX, winLo / 2);                 // sous fenêtre gauche
  front(1.0, H - winHi, -winX, winHi + (H - winHi) / 2);// au-dessus fenêtre gauche
  front(1.1, H, -1.2, H / 2);                          // trumeau gauche
  front(doorW, H - doorH, 0, doorH + (H - doorH) / 2); // linteau
  front(1.1, H, 1.2, H / 2);                           // trumeau droit
  front(1.0, winLo, winX, winLo / 2);                  // sous fenêtre droite
  front(1.0, H - winHi, winX, winHi + (H - winHi) / 2); // au-dessus fenêtre droite
  front(0.85, H, 3.175, H / 2);                        // bande droite

  // Habillage de l'embrasure de porte (comble le vide entre paroi intérieure 3,5 et coque).
  const revealMat = mkPBR("wood", { roughness: 0.7, color: 0x4f4f4f });
  for (const sx of [-1, 1]) {
    const j = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.03, doorH, 0.14), 0.03, doorH, 0.14, TEX_TILE.wood), revealMat);
    j.position.set(sx * (half - 0.015), doorH / 2, D / 2); doorAsm.add(j);
  }

  // Soubassement en pierre : ANNEAU (4 côtés) et non bloc plein — un bloc traverserait
  // la salle et recouvrirait le parquet (son dessus est à +0,08, le sol intérieur à 0).
  const bOut = (W + 0.3) / 2, bIn = 3.55, ringW = bOut - bIn, bH = 0.42;
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const long = sz === 0 ? ringW : W + 0.3;
    const deep = sz === 0 ? D + 0.3 : ringW;
    const cx = sx * (bIn + ringW / 2), cz = sz * (bIn + ringW / 2);
    const seg = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(long, bH, deep), long, bH, deep, TEX_TILE.stone)), stone);
    seg.position.set(cx, -0.13, cz); seg.receiveShadow = true; seg.castShadow = true; g.add(seg);
  }

  // Pignons avant + arrière + toit 2 pans + faîtage.
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-W / 2, 0); gableShape.lineTo(W / 2, 0); gableShape.lineTo(0, 1.7); gableShape.closePath();
  const gableGeo = uvScale(new THREE.ShapeGeometry(gableShape), 1 / TEX_TILE.plaster, 1 / TEX_TILE.plaster);
  const gFront = new THREE.Mesh(gableGeo, wallMat); gFront.position.set(0, H, zF); gFront.rotation.y = Math.PI; g.add(gFront);
  const gBack = new THREE.Mesh(gableGeo, wallMat); gBack.position.set(0, H, -zF); g.add(gBack);
  const slope = Math.atan2(1.7, W / 2), panLen = Math.hypot(W / 2 + 0.18, 1.7);
  for (const s of [-1, 1]) {
    const pan = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(panLen, 0.14, D + 0.42), panLen, 0.14, D + 0.42, TEX_TILE.roof)), roofMat);
    pan.position.set(s * (W / 4), H + 0.85, 0); pan.rotation.z = -s * slope;
    pan.castShadow = true; pan.receiveShadow = true; g.add(pan);
  }
  const ridge = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.3, 0.24, D + 0.5), 0.3, 0.24, D + 0.5, TEX_TILE.roof), roofMat);
  ridge.position.set(0, H + 1.72, 0); ridge.castShadow = true; g.add(ridge);

  // Porte (pivot à gauche) + encadrement. Le bas de la porte est posé sur le SEUIL
  // en pierre (niveau supérieur du perron) : en s'ouvrant elle ne traverse plus les marches.
  const fT = 0.12;
  const sillTop = 0.22, leafH = doorH - sillTop - 0.005;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(fT, doorH, 0.16), frameMat);
    post.position.set(sx * (half + fT / 2), doorH / 2, zF + 0.04); post.castShadow = true; doorAsm.add(post);
  }
  const lint = new THREE.Mesh(new THREE.BoxGeometry(doorW + 2 * fT, fT, 0.16), frameMat);
  lint.position.set(0, doorH + fT / 2, zF + 0.04); lint.castShadow = true; doorAsm.add(lint);
  const pivot = new THREE.Group();
  pivot.position.set(-half, 0, zF + t / 2 + 0.06);
  const door = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(doorW, leafH, 0.08), doorW, leafH, 0.08, TEX_TILE.wood)), doorMat);
  door.position.set(half, sillTop + leafH / 2, 0); door.castShadow = true; door.receiveShadow = true; pivot.add(door);
  // Panneaux moulurés (2 × 2) : la porte n'est plus une plaque.
  const panelMat = mkPBR("wood", { roughness: 0.5, color: 0x4a4a4a });
  for (const [px, py, ph] of [[-0.31, 1.42, 0.92], [0.31, 1.42, 0.92], [-0.31, 0.42, 0.5], [0.31, 0.42, 0.5]]) {
    const pn = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.46, ph, 0.02), 0.46, ph, 0.02, TEX_TILE.wood), panelMat);
    pn.position.set(half + px, sillTop + py, 0.045); pn.castShadow = true; pivot.add(pn);
  }
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xd9b25a, roughness: 0.24, metalness: 0.88, envMapIntensity: 1.4 });
  for (const zz of [0.08, -0.08]) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), knobMat); k.position.set(doorW - 0.16, sillTop + leafH / 2, zz); pivot.add(k); }
  doorAsm.add(pivot);

  // Seuil en pierre : comble l'embrasure jusqu'au niveau du perron (sous la porte).
  const sill = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(doorW + 0.04, sillTop, 0.34), doorW + 0.04, sillTop, 0.34, TEX_TILE.stone)), stone);
  sill.position.set(0, sillTop / 2, zF + 0.05); sill.castShadow = true; sill.receiveShadow = true; doorAsm.add(sill);

  // Fenêtres : vitre AU FOND du renfoncement (z = intérieur de la baie), meneaux
  // rapportés devant, appui en pierre qui déborde. Le cadre n'est plus une boîte
  // pleine posée sur la façade.
  for (const x of [-winX, winX]) {
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), glassMat);
    gl.position.set(x, winY, zFw - t / 2 + 0.015); windowAsm.add(gl);
    const mv = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, 0.06), frameMat);
    mv.position.set(x, winY, zFw + 0.01); windowAsm.add(mv);
    const mh = new THREE.Mesh(new THREE.BoxGeometry(winW, 0.05, 0.06), frameMat);
    mh.position.set(x, winY, zFw + 0.01); windowAsm.add(mh);
    const sill = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(1.34, 0.09, 0.26), 1.34, 0.09, 0.26, TEX_TILE.stone)), stone);
    sill.position.set(x, winLo - 0.045, zFw + 0.01); sill.castShadow = true; windowAsm.add(sill);
  }

  // Auvent au-dessus de la porte + lanternes.
  const awning = new THREE.Mesh(uvBox(new THREE.BoxGeometry(doorW + 0.6, 0.08, 0.58), doorW + 0.6, 0.08, 0.58, TEX_TILE.roof), roofMat);
  awning.position.set(0, doorH + 0.36, zF + 0.3); awning.rotation.x = -0.24; awning.castShadow = true; g.add(awning);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.6, metalness: 0.4 });
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb060, emissiveIntensity: 1.0 });
  for (const sx of [-1, 1]) {
    const lan = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), lanternMat);
    lan.position.set(sx * (doorW / 2 + 0.42), doorH + 0.1, zF + 0.25); lan.castShadow = true; g.add(lan);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.1), glowMat);
    gl.position.copy(lan.position); g.add(gl);
  }

  // Haies de part et d'autre de la porte.
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x3f5a35, roughness: 1 });
  for (const sx of [-1, 1]) {
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.45), hedgeMat);
    hedge.position.set(sx * (doorW / 2 + 0.95), 0.25, zF + 0.42); hedge.castShadow = true; hedge.receiveShadow = true; g.add(hedge);
  }

  // Arbre à côté de la maison.
  const trunk = new THREE.Mesh(uvScale(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 8), (2 * Math.PI * 0.17) / TEX_TILE.wood, 1.6 / TEX_TILE.wood),
    mkPBR("wood", { roughness: 0.9, color: 0x6f6f6f }));
  trunk.position.set(4.7, 0.8, 2.4); trunk.castShadow = true; g.add(trunk);
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x4a6a3a, roughness: 1 });
  for (const [fy, r] of [[2.0, 1.05], [2.7, 0.85], [3.3, 0.6]]) {
    const fo = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), foliageMat);
    fo.position.set(4.7, fy, 2.4); fo.castShadow = true; g.add(fo);
  }

  // Marches + chemin (dalles) + sol extérieur.
  const step = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(2.0, 0.22, 0.9), 2.0, 0.22, 0.9, TEX_TILE.stone)), stone);
  step.position.set(0, 0.11, zF + 0.6); step.castShadow = true; step.receiveShadow = true; g.add(step);
  for (let i = 0; i < 4; i++) {
    const slab = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(0.9, 0.06, 0.6), 0.9, 0.06, 0.6, TEX_TILE.stone)), stone);
    slab.position.set(0, 0.03, zF + 1.35 + i * 0.8); slab.receiveShadow = true; g.add(slab);
  }
  const gShape = new THREE.Shape();
  gShape.moveTo(-40, -40); gShape.lineTo(40, -40); gShape.lineTo(40, 40); gShape.lineTo(-40, 40); gShape.closePath();
  const gHole = new THREE.Path();                  // emprise de la maison : sol intérieur isolé
  const hw = 3.56;
  gHole.moveTo(-hw, -hw); gHole.lineTo(-hw, hw); gHole.lineTo(hw, hw); gHole.lineTo(hw, -hw); gHole.closePath();
  gShape.holes.push(gHole);
  const ground = new THREE.Mesh(withAO(uvScale(new THREE.ShapeGeometry(gShape), 1 / TEX_TILE.stone, 1 / TEX_TILE.stone)),
    mkPBR("stone", { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.01, 0); ground.receiveShadow = true;
  g.add(ground);

  return { group: g, doorPivot: pivot, ground };
}
