// Livre 3D posé sur le pupitre (couverture + titre).
export function buildBookMesh({ THREE, lecternTop, makeCoverTexture, title }) {
  const W = 0.9, D = 0.62, ct = 0.016, blockH = 0.05, spineW = 0.035;
  const leather = new THREE.MeshStandardMaterial({ color: "#2c1e14", roughness: 0.55, metalness: 0.05 });
  const paperEdge = new THREE.MeshStandardMaterial({ color: "#efe6cf", roughness: 0.95 });
  const book = new THREE.Group();
  book.position.set(0, 0.05, 0.02); lecternTop.add(book);

  // Couverture arrière (dessous) — cuir.
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, ct, D), leather);
  bottom.castShadow = true; bottom.receiveShadow = true; book.add(bottom);

  // Tranche de pages — même empreinte que les couvertures : les feuilles
  // affleurent et sont VISIBLES sur le bord droit / avant / arrière.
  const block = new THREE.Mesh(new THREE.BoxGeometry(W, blockH, D), paperEdge);
  block.position.y = ct / 2 + blockH / 2; block.castShadow = true; book.add(block);

  // Couverture avant (dessus) — cuir + motif/titre.
  const coverMat = new THREE.MeshStandardMaterial({ map: makeCoverTexture(title), roughness: 0.5 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, ct, D), [leather, leather, coverMat, leather, leather, leather]);
  top.position.y = ct + blockH; top.castShadow = true; top.name = "cover"; book.add(top);

  // Dos (spine) en cuir, uniquement le long du bord GAUCHE (couvre la tranche de
  // pages à gauche) ; à droite, les feuilles restent visibles.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(spineW, ct + blockH + ct, D + 0.004), leather);
  spine.position.set(-W / 2 + spineW / 2, (ct + blockH) / 2, 0);
  spine.castShadow = true; spine.receiveShadow = true; book.add(spine);

  /** Remplace la couverture (titre paramétré) en libérant l'ancienne texture. */
  const setTitle = (next) => {
    const map = makeCoverTexture(next);
    coverMat.map?.dispose();
    coverMat.map = map;
    coverMat.needsUpdate = true;
  };

  return { coverMat, setTitle };
}
