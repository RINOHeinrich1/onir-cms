// Salle cohérente (cabinet) : murs, lambris, bibliothèque, lustre, tapis.
/** Salle cohérente (cabinet) : pièce fermée 7×7×3,1, lambris, bibliothèque, tapis, lustre. */
export function buildRoom({ THREE, mkPBR, texGet, withAO, uvPlane, uvBox, uvScale, TEX_TILE, onDiag }) {
  const group = new THREE.Group();
  const W = 7, D = 7, H = 3.1;
  const parquet = mkPBR("parquet", { roughness: 0.62, metalness: 0.0, clearcoat: 0.28, clearcoatRoughness: 0.18, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(withAO(uvPlane(new THREE.PlaneGeometry(W, D), W, D, TEX_TILE.parquet)), parquet);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; group.add(floor);

  const ceil = new THREE.Mesh(withAO(uvPlane(new THREE.PlaneGeometry(W, D), W, D, TEX_TILE.plaster)),
    mkPBR("plaster", { roughness: 1, side: THREE.DoubleSide }));
  ceil.position.set(0, H, 0); ceil.rotation.x = Math.PI / 2; ceil.receiveShadow = true; ceil.castShadow = true; group.add(ceil);

  const plaster = mkPBR("plaster", { roughness: 1, color: 0xf0f0f0, normalScale: 0.55, side: THREE.DoubleSide });
  const wood = mkPBR("wood", { roughness: 0.7 });
  const woodDark = mkPBR("wood", { roughness: 0.7, color: 0x4f4f4f });

  const doorW = 1.3, doorH = 2.3, half = doorW / 2, sideW = (W - doorW) / 2;

  // Murs intérieurs (plâtre) : fond, gauche, droite.
  const wall = (w, h, x, y, z, ry, m) => {
    const mm = new THREE.Mesh(withAO(uvPlane(new THREE.PlaneGeometry(w, h), w, h, TEX_TILE.plaster)), m);
    mm.position.set(x, y, z); mm.rotation.y = ry;
    mm.receiveShadow = true; mm.castShadow = true; group.add(mm);
  };
  wall(W, H, 0, H / 2, -D / 2, 0, plaster);
  wall(D, H, -W / 2, H / 2, 0, Math.PI / 2, plaster);
  wall(D, H, W / 2, H / 2, 0, -Math.PI / 2, plaster);

  // Mur avant percé d'une porte ET des DEUX FENÊTRES (mêmes cotes que la façade
  // extérieure) : la salle voit le ciel et reçoit le soleil par les baies.
  const winY = 2.15, winH = 1.25, winX = 2.25, winLo = winY - winH / 2, winHi = winY + winH / 2;
  const frontPanel = (w, hh, cx, cy) => {   // boîte de 10 cm : l'embrasure est fournie par ses flancs
    const m = new THREE.Mesh(withAO(uvBox(new THREE.BoxGeometry(w, hh, 0.1), w, hh, 0.1, TEX_TILE.plaster)), plaster);
    m.position.set(cx, cy, D / 2 + 0.05); m.receiveShadow = true; m.castShadow = true; group.add(m);
  };
  for (const sx of [-1, 1]) {
    frontPanel(0.75, H, sx * 3.125, H / 2);                        // bande d'angle
    frontPanel(1.0, winLo, sx * winX, winLo / 2);                  // sous la fenêtre
    frontPanel(1.0, H - winHi, sx * winX, winHi + (H - winHi) / 2); // au-dessus
    frontPanel(1.1, H, sx * 1.2, H / 2);                            // trumeau
  }
  frontPanel(doorW, H - doorH, 0, doorH + (H - doorH) / 2);

  // Lambris + plinthes + corniche (bois), intérieur des murs.
  const lambH = 1.0;
  const panel = (w, x, z, ry) => {
    const lamb = new THREE.Mesh(uvBox(new THREE.BoxGeometry(w, lambH, 0.05), w, lambH, 0.05, TEX_TILE.wood), wood);
    lamb.position.set(x, lambH / 2, z); lamb.rotation.y = ry; lamb.receiveShadow = true; group.add(lamb);
    const skirt = new THREE.Mesh(uvBox(new THREE.BoxGeometry(w, 0.12, 0.06), w, 0.12, 0.06, TEX_TILE.wood), woodDark);
    skirt.position.set(x, 0.06, z); skirt.rotation.y = ry; group.add(skirt);
    const crown = new THREE.Mesh(uvBox(new THREE.BoxGeometry(w, 0.1, 0.06), w, 0.1, 0.06, TEX_TILE.wood), woodDark);
    crown.position.set(x, H - 0.28, z); crown.rotation.y = ry; group.add(crown);
  };
  panel(W, 0, -D / 2 + 0.03, 0);
  panel(D, -W / 2 + 0.03, 0, Math.PI / 2);
  panel(D, W / 2 - 0.03, 0, -Math.PI / 2);
  panel(sideW, -(half + sideW / 2), D / 2 - 0.03, Math.PI);
  panel(sideW, half + sideW / 2, D / 2 - 0.03, Math.PI);

  // Continuité corniche + linteau bois AU-DESSUS DE LA PORTE (vue intérieure).
  const crownDoor = new THREE.Mesh(uvBox(new THREE.BoxGeometry(doorW + 0.22, 0.1, 0.06), doorW + 0.22, 0.1, 0.06, TEX_TILE.wood), woodDark);
  crownDoor.position.set(0, H - 0.28, D / 2 - 0.03); group.add(crownDoor);
  const lintelIn = new THREE.Mesh(uvBox(new THREE.BoxGeometry(doorW + 0.22, 0.16, 0.12), doorW + 0.22, 0.16, 0.12, TEX_TILE.wood), wood);
  lintelIn.position.set(0, doorH + 0.08, D / 2 - 0.05); lintelIn.castShadow = true; group.add(lintelIn);

  // Appui de fenêtre intérieur (bois), côté salle.
  for (const sx of [-1, 1]) {
    const board = new THREE.Mesh(uvBox(new THREE.BoxGeometry(1.18, 0.045, 0.2), 1.18, 0.045, 0.2, TEX_TILE.wood), wood);
    board.position.set(sx * winX, winLo - 0.022, D / 2 - 0.02); board.castShadow = true; group.add(board);
  }

  // Tapis sous le pupitre.
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0x4a2e28, roughness: 1,
    normalMap: texGet("plaster_NormalGL.jpg", false),
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
  const rug = new THREE.Mesh(uvBox(new THREE.BoxGeometry(3.6, 0.022, 2.6), 3.6, 0.022, 2.6, 0.32), rugMat);
  rug.position.set(0, 0.011, -0.6); rug.receiveShadow = true; rug.castShadow = false; group.add(rug);

  // Bibliothèque (mur du fond) + livres.
  // Bibliothèque OUVERTE (carcasse + livres procéduraux + travée d'archives).
  const caseG = new THREE.Group(); caseG.position.set(-2.3, 0, -D / 2 + 0.26);
  group.add(caseG);
  const cW = 1.9, cH = 2.3, cD = 0.36, t = 0.03;
  const caseMat = mkPBR("wood", { roughness: 0.7, color: 0x6b6b6b });
  const shelfPanel = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(uvBox(new THREE.BoxGeometry(w, h, d), w, h, d, TEX_TILE.wood), caseMat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; caseG.add(m);
  };
  shelfPanel(t, cH, cD, -cW / 2 + t / 2, cH / 2, 0);      // montant gauche
  shelfPanel(t, cH, cD, cW / 2 - t / 2, cH / 2, 0);       // montant droit
  shelfPanel(cW, t, cD, 0, cH - t / 2, 0);                // plafond
  shelfPanel(cW, t, cD, 0, t / 2, 0);                     // socle
  const back = new THREE.Mesh(new THREE.PlaneGeometry(cW - 2 * t, cH - 2 * t),
    new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 }));
  back.position.set(0, cH / 2, -cD / 2 + 0.012); caseG.add(back);

  const floors = [t, 0.50, 0.98, 1.46, 1.94];              // dessus des tablettes
  for (const y of floors.slice(1)) shelfPanel(cW - 2 * t, t, cD - 0.02, 0, y - t / 2, 0.01);
  const innerW = cW - 2 * t - 0.02;
  const x0 = -innerW / 2;

  // RNG déterministe (rendu reproductible).
  let seed = 0x9e3779b9;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let q = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
  const palette = [0x4a2a20, 0x3a2d24, 0x24303a, 0x2f3a2a, 0x5a2226, 0x453626, 0x6b5433, 0x2a333c];
  const books = [];
  const push = (x, y, w, h, d, color, rot) => books.push({ x, y, w, h, d, color, rot });

  const shelfBooks = (y, fill) => {
    let x = x0 + 0.01;
    const limit = x0 + innerW * fill;
    while (x < limit) {
      const w = 0.022 + rnd() * 0.028;
      const h = 0.17 + rnd() * 0.13;
      if (x + w > x0 + innerW) break;
      const c = palette[(rnd() * palette.length) | 0];
      // quelques livres inclinés en fin de rangée
      const lean = rnd() < 0.06 ? (rnd() < 0.5 ? -0.18 : 0.18) : 0;
      push(x + w / 2, y + h / 2, w, h, 0.20, c, lean);
      x += w + (rnd() < 0.12 ? 0.02 + rnd() * 0.05 : 0.002);
    }
  };
  // 3 travées de livres + 1 travée d'archives (2e en partant du bas)
  shelfBooks(floors[0], 0.97);
  shelfBooks(floors[2], 0.99);
  shelfBooks(floors[3], 0.96);
  shelfBooks(floors[4], 0.9);

  // Archives (classeurs à dos plat + étiquettes)
  const boxMat = new THREE.MeshStandardMaterial({ color: 0x9c8464, roughness: 0.96 });
  const labelMat = new THREE.MeshStandardMaterial({ color: 0xe4d8bb, roughness: 0.92 });
  let ax = x0 + 0.03;
  for (let i = 0; i < 6; i++) {
    const w = 0.16 + (i % 3) * 0.02;
    const h = 0.26 + (i % 2) * 0.04;
    if (ax + w > x0 + innerW) break;
    const bx = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.26), boxMat);
    bx.position.set(ax + w / 2, floors[1] + h / 2, 0.01);
    bx.castShadow = true; bx.receiveShadow = true; caseG.add(bx);
    const lb = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.46, 0.032), labelMat);
    lb.position.set(ax + w / 2, floors[1] + h * 0.74, 0.142); caseG.add(lb);
    ax += w + 0.03;
  }

  // Livres en UN SEUL InstancedMesh (1 draw call).
  const bookGeo = new THREE.BoxGeometry(1, 1, 1);
  const bookMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02 });
  const inst = new THREE.InstancedMesh(bookGeo, bookMat, books.length);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler();
  const v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const col = new THREE.Color();
  books.forEach((b, i) => {
    e4.set(0, 0, b.rot || 0);
    q4.setFromEuler(e4);
    v3.set(b.x, b.y, 0.02);
    s3.set(b.w, b.h, b.d);
    m4.compose(v3, q4, s3);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, col.setHex(b.color));
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = true; inst.receiveShadow = true;
  caseG.add(inst);
  onDiag("bibliothèque: " + books.length + " livres, 1 instanced");

  // Lustre (procédural) au plafond.
  const chand = new THREE.Group(); chand.position.set(0, H, 0);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a5e, metalness: 0.85, roughness: 0.28, envMapIntensity: 1.4 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 8), brass);
  rod.position.y = -0.16; chand.add(rod);
  // Moyeu sous la tige + chaînes qui suspendent l'anneau (3 points à 120°).
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), brass);
  hub.position.y = -0.32; chand.add(hub);
  const chain = (a, b, r = 0.008) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), brass);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    m.castShadow = true;
    return m;
  };
  const chains = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), brass, 3);
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const a = new THREE.Vector3(0, -0.32, 0);
    const b = new THREE.Vector3(Math.cos(ang) * 0.36, -0.5, Math.sin(ang) * 0.36);
    const dir = b.clone().sub(a), len = dir.length();
    const mid = a.clone().addScaledVector(dir, 0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    chains.setMatrixAt(i, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len, 1)));
  }
  chains.castShadow = true; chand.add(chains);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 8, 28), brass);
  ring.rotation.x = Math.PI / 2; ring.position.y = -0.5; chand.add(ring);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffcf80, emissiveIntensity: 1.8 });
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 10), bulbMat, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.36, -0.44, Math.sin(a) * 0.36));
  }
  chand.add(bulbs);
  group.add(chand);

  // Appliques murales, sur les TRUMEAUX entre porte et fenêtres (elles étaient
  // à x = ±2,5, c'est-à-dire en plein milieu des baies nouvellement percées).
  const sconceGlow = new THREE.MeshStandardMaterial({ color: 0xffdca0, emissive: 0xffb060, emissiveIntensity: 1.4 });
  for (const sx of [-1, 1]) {
    const x = sx * 1.2, z = D / 2 - 0.06;
    const plate = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.06, 0.16, 0.02), 0.06, 0.16, 0.02, TEX_TILE.wood),
      mkPBR("wood", { roughness: 0.35, metalness: 0.6, color: 0x6a5a3a }));
    plate.position.set(x, 2.22, z); group.add(plate);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.13, 12, 1, true), sconceGlow);
    shade.position.set(x, 2.20, z - 0.09); group.add(shade);
  }

  // (mur droit laissé nu : ancien cadre/tableau retiré)

  return { group, shelf: caseG };
}
