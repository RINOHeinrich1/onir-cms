// Lumières du diorama (ciel, soleil directionnel, lustre, remplissage).
import { SUN_DIR } from "../constants.js";

export function createLights({ THREE, low, scene }) {
  scene.add(new THREE.HemisphereLight(0xbcd4ef, 0x6a5a44, 0.22));

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
  sun.position.set(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z).multiplyScalar(22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 55;
  // Cadre serré sur le diorama (7 m) : ~8 mm de texel d'ombre au lieu de 12-20 mm.
  sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Lampadaire du lustre : spot descendant (ombres portées) + point de remplissage.
  const spot = new THREE.SpotLight(0xffc488, 0, 14, 1.05, 0.65, 2);
  spot.position.set(0, 2.75, 0);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = false; // allumée seulement à l'intérieur (voir #goInterior)
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0005;
  spot.shadow.normalBias = 0.02;
  scene.add(spot); scene.add(spot.target);

  const lamp = new THREE.PointLight(0xffc488, 8, 12, 2);
  lamp.position.set(0, 2.4, 1.2); scene.add(lamp);

  /** Cadre l'ombre du soleil : serré dans la salle, large dans la cour. */
  function setShadowExtent(half, top = half, bottom = -half) {
    const cam = sun.shadow.camera;
    cam.left = -half; cam.right = half;
    cam.top = top; cam.bottom = bottom;
    cam.updateProjectionMatrix();
  }

  return { sun, spot, lamp, setShadowExtent };
}
