// Rig caméra : interpolation, orbite du sas et regard libre dans la salle.
import { easeInOut } from "../lib/math.js";

export function createCameraRig({ THREE, camera, IN_ROOM }) {
  const look = new THREE.Vector3();
  const camFrom = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  const camTo = { pos: new THREE.Vector3(), tgt: new THREE.Vector3() };
  let camT = 1;
  let camDur = 1;
  let lookBase = null;
  let lookYaw = 0;
  let lookPitch = -0.08;

  const orbit = { on: false, az: 0, pol: 1.5, r: 9.6, t: new THREE.Vector3(0, 1.7, 0), lx: 0, ly: 0 };

  function setCam(pos, tgt, dur = 1) {
    camFrom.pos.copy(camera.position);
    camFrom.tgt.copy(look);
    camTo.pos.set(pos[0], pos[1], pos[2]);
    camTo.tgt.set(tgt[0], tgt[1], tgt[2]);
    camDur = dur;
    camT = 0;
    if (dur <= 0.02) apply(true);
  }

  function step(dt) {
    if (camT >= 1) return false;
    camT = Math.min(1, camT + dt / camDur);
    const e = easeInOut(camT);
    camera.position.lerpVectors(camFrom.pos, camTo.pos, e);
    look.lerpVectors(camFrom.tgt, camTo.tgt, e);
    camera.lookAt(look);
    return true;
  }

  function apply(instant) {
    if (!instant) return;
    camT = 1;
    camera.position.copy(camTo.pos);
    look.copy(camTo.tgt);
    camera.lookAt(look);
  }

  /** Réinitialise le regard libre sur le pupitre (point de vue de la salle). */
  function resetLook() {
    lookBase = new THREE.Vector3(IN_ROOM.pos[0], IN_ROOM.pos[1], IN_ROOM.pos[2]);
    const d = new THREE.Vector3(
      IN_ROOM.tgt[0] - IN_ROOM.pos[0], IN_ROOM.tgt[1] - IN_ROOM.pos[1], IN_ROOM.tgt[2] - IN_ROOM.pos[2],
    ).normalize();
    lookYaw = Math.atan2(d.x, -d.z);
    lookPitch = Math.asin(Math.max(-1, Math.min(1, d.y)));
  }

  function applyOrbit() {
    const o = orbit;
    const sp = Math.sin(o.pol), cp = Math.cos(o.pol);
    camera.position.set(
      o.t.x + o.r * sp * Math.sin(o.az),
      o.t.y + o.r * cp,
      o.t.z + o.r * sp * Math.cos(o.az),
    );
    look.copy(o.t);
    camera.lookAt(look);
    camT = 1; // annule une éventuelle animation de caméra
  }

  /** Regard libre dans la salle : rotation de la vue autour du point de vue. */
  function applyLook() {
    const base = lookBase || new THREE.Vector3(IN_ROOM.pos[0], IN_ROOM.pos[1], IN_ROOM.pos[2]);
    const cp = Math.cos(lookPitch);
    const dir = new THREE.Vector3(
      Math.sin(lookYaw) * cp,
      Math.sin(lookPitch),
      -Math.cos(lookYaw) * cp,
    );
    camera.position.copy(base);
    look.copy(base).add(dir);
    camera.lookAt(look);
    camT = 1;
  }

  return {
    setCam, step, apply, resetLook, applyOrbit, applyLook,
    orbit, look,
    get lookYaw() { return lookYaw; },
    set lookYaw(value) { lookYaw = value; },
    get lookPitch() { return lookPitch; },
    set lookPitch(value) { lookPitch = value; },
  };
}
