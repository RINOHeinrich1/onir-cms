// Scène discussion : bureau/chaise GLB + tableau mural 3D.
/** Scène « discussion » 3D : bureau + chaise (GLB CC0) + tableau mural (texture canvas). */
export function buildDeskScene({ THREE, ASSET, DESK, TEX_TILE, mkPBR, uvBox, invalidate, onPlace, drawDecoBoard }) {
  const g = new THREE.Group();
  const loader = new THREE.GLTFLoader();
  const place = (url, x, z, ry, s, id) => {
    loader.load(ASSET(url), (gltf) => {
      const _id = id;
      const o = gltf.scene;
      o.scale.setScalar(s); o.rotation.y = ry; o.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(o);
      const c = new THREE.Vector3(); box.getCenter(c);
      o.position.set(x - c.x, -box.min.y, z - c.z); // centré en (x,z), posé sur le sol
      o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      g.add(o);
      onPlace(_id, o);
      invalidate();
    }, undefined, () => {});
  };
  place("../assets/models/desk.glb", DESK.pos[0], DESK.pos[2], DESK.ry + Math.PI, DESK.scale, "desk");
  place("../assets/models/chair.glb", DESK.avatar[0], DESK.avatar[2] + 0.12, DESK.ry, DESK.scale, "chair");

  // Tableau mural (mur du fond) : cadre bois + panneau à texture dynamique.
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1600; boardCanvas.height = 900;
  const boardCtx = boardCanvas.getContext("2d");
  const boardTex = new THREE.CanvasTexture(boardCanvas);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  const frame = new THREE.Mesh(uvBox(new THREE.BoxGeometry(2.6, 1.55, 0.08), 2.6, 1.55, 0.08, TEX_TILE.wood),
    mkPBR("wood", { color: 0x555555, roughness: 0.6 }));
  frame.position.set(DESK.board[0] - 0.02, DESK.board[1], DESK.board[2]); frame.rotation.y = DESK.ry; frame.castShadow = true; g.add(frame);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.32),
    new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide }));
  panel.position.set(DESK.board[0] + 0.08, DESK.board[1], DESK.board[2]); panel.rotation.y = DESK.ry; g.add(panel);
  drawDecoBoard({ canvas: boardCanvas, ctx: boardCtx, tex: boardTex });

  return { group: g, boardCanvas, boardCtx, boardTex, board3D: panel };
}
