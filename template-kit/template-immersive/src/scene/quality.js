// Détection du palier de qualité (globals injectés pour être testable).
export function detectQuality({ matchMedia, hardwareConcurrency, deviceMemory, innerWidth, innerHeight }) {
  try {
    const coarse = matchMedia?.("(pointer:coarse)")?.matches === true;
    const cores = hardwareConcurrency || 4;
    const mem = deviceMemory || 4;
    const small = Math.min(innerWidth || 9999, innerHeight || 9999) <= 820;
    return (coarse && (cores <= 6 || mem <= 4 || small)) || cores <= 2 ? "low" : "high";
  } catch {
    return "high";
  }
}
