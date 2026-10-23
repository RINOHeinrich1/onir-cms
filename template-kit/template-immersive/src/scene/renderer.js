// Bootstrap WebGL : renderer, scène et caméra.
export function createRenderer({ THREE, quality }) {
  const low = quality === "low";
  const renderer = new THREE.WebGLRenderer({ antialias: !low, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.3 : 2));
  renderer.shadowMap.enabled = !low;
  if (!low) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Les ombres ne sont réactualisées que lorsque la scène change réellement
  // (avatar, porte, rotation), pas à chaque déplacement de caméra.
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#8fb6dd");
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

  return { renderer, scene, camera, canvas: renderer.domElement };
}
