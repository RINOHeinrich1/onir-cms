// Picking 3D : porte, avatar, pupitre (raycast, seuil 6 px).
export function bindPicking({ canvas, camera, THREE, getState, actions, signal }) {
  const ray = new THREE.Raycaster();
  const v = new THREE.Vector2();
  let downX = 0, downY = 0;

  canvas.addEventListener("pointerdown", (e) => {
    downX = e.clientX; downY = e.clientY;
  }, { signal });

  canvas.addEventListener("pointerup", (e) => {
    const state = getState();
    if (state.view !== "room") return;
    if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) return;
    const r = canvas.getBoundingClientRect();
    v.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    v.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(v, camera);
    // Porte : entrer (dehors) / sortir (dans la salle).
    if (state.doorPivot && ray.intersectObjects([state.doorPivot], true).length) {
      if (state.enteredRoom) actions.goOutside(); else actions.goInside();
      return;
    }
    // Personnage : cliquer dessus ouvre aussi la discussion.
    if (state.avatar && ray.intersectObjects([state.avatar], true).length) {
      actions.enterDiscussion();
      return;
    }
    // Meuble bibliothèque : ouvrir l'inventaire des livres.
    if (state.enteredRoom && state.shelf && ray.intersectObjects([state.shelf], true).length) {
      actions.openLibrary();
      return;
    }
    // Pupitre : ouvrir le livre (dans la salle).
    if (state.enteredRoom) {
      const hit = ray.intersectObjects(state.lectern ? state.lectern.children : [], true);
      if (hit.length) actions.enterBook();
    }
  }, { signal });
}
