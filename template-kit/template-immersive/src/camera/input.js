// Entrées d'orbite (sas) et de regard libre (salle).
export function bindOrbitInput({ canvas, rig, getCanRotate, getEnteredRoom, signal }) {
  const c = canvas;
  c.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !getCanRotate()) return;
    rig.orbit.on = true; rig.orbit.lx = e.clientX; rig.orbit.ly = e.clientY;
    c.style.cursor = "grabbing";
  }, { signal });

  const move = (e) => {
    if (!rig.orbit.on) return;
    const dx = e.clientX - rig.orbit.lx, dy = e.clientY - rig.orbit.ly;
    rig.orbit.lx = e.clientX; rig.orbit.ly = e.clientY;
    if (!getEnteredRoom()) {
      rig.orbit.az += dx * 0.006;
      rig.orbit.pol = Math.min(1.52, Math.max(0.6, rig.orbit.pol - dy * 0.006));
      rig.applyOrbit();
    } else {
      rig.lookYaw += dx * 0.005;
      rig.lookPitch = Math.min(0.95, Math.max(-0.95, rig.lookPitch - dy * 0.005));
      rig.applyLook();
    }
  };

  const end = () => {
    if (!rig.orbit.on) return;
    rig.orbit.on = false;
    c.style.cursor = getCanRotate() ? "grab" : "default";
  };

  window.addEventListener("pointermove", move, { signal });
  window.addEventListener("pointerup", end, { signal });
  window.addEventListener("pointercancel", end, { signal });
}
