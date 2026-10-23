// Pupitre de la salle.
export function buildLectern({ THREE, mkPBR, uvBox, TEX_TILE }) {
  const wood = mkPBR("wood", { roughness: 0.55, metalness: 0.05 });
  const g = new THREE.Group(); g.position.set(0, 0, -0.9);

  const base = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.64, 0.08, 0.64), 0.64, 0.08, 0.64, TEX_TILE.wood), wood);
  base.position.set(0, 0.04, 0); base.castShadow = true; base.receiveShadow = true; g.add(base);
  const plinth = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.4, 0.16, 0.4), 0.4, 0.16, 0.4, TEX_TILE.wood), wood);
  plinth.position.set(0, 0.16, 0); plinth.castShadow = true; g.add(plinth);
  const col = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.15, 0.58, 0.15), 0.15, 0.58, 0.15, TEX_TILE.wood), wood);
  col.position.set(0, 0.5, 0); col.castShadow = true; col.receiveShadow = true; g.add(col);
  const collar = new THREE.Mesh(uvBox(new THREE.BoxGeometry(0.27, 0.06, 0.27), 0.27, 0.06, 0.27, TEX_TILE.wood), wood);
  collar.position.set(0, 0.8, 0); collar.castShadow = true; g.add(collar);
  const top = new THREE.Mesh(uvBox(new THREE.BoxGeometry(1.72, 0.07, 0.98), 1.72, 0.07, 0.98, TEX_TILE.wood), wood);
  top.position.set(0, 0.85, 0); top.rotation.x = THREE.MathUtils.degToRad(24);
  top.castShadow = true; top.receiveShadow = true; g.add(top);
  const lip = new THREE.Mesh(uvBox(new THREE.BoxGeometry(1.72, 0.09, 0.06), 1.72, 0.09, 0.06, TEX_TILE.wood), wood);
  lip.position.copy(new THREE.Vector3(0, 0.055, 0.47).applyEuler(top.rotation).add(top.position));
  lip.rotation.copy(top.rotation); lip.castShadow = true; g.add(lip);

  return { group: g, top };
}
