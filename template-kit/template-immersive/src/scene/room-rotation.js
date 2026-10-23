// Interpolation de rotation du groupe salle (conservée, jamais déclenchée).
import { easeInOut } from "../lib/math.js";

export function createRoomRotation({ roomGroup }) {
  let from = 0, to = 0, t = 1, dur = 1;
  function step(dt) {
    if (!roomGroup || t >= 1) return false;
    t = Math.min(1, t + dt / dur);
    const e = easeInOut(t);
    roomGroup.rotation.y = from + (to - from) * e;
    return true;
  }
  return { step };
}
