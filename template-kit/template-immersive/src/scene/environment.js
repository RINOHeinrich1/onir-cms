// Chargement des environnements HDRI (ciel + intérieur) et PMREM.
export function loadEnvironments({ THREE, ASSET, renderer, scene, isInterior, onLoaded, onProgress, invalidate }) {
  const env = { skyTex: null, skyEnv: null, interiorEnv: null };
  let pending = 2, doneCount = 0;

  const done = () => {
    doneCount++;
    onProgress?.(doneCount, 2);
    if (--pending <= 0) onLoaded();
  };
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const rgbe = new THREE.RGBELoader();

  rgbe.load(ASSET("../assets/hdri/kloppenheim_06_puresky_512.hdr"), (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    env.skyTex = tex;
    env.skyEnv = pmrem.fromEquirectangular(tex).texture;
    if (!isInterior()) {
      scene.background = tex;
      scene.environment = env.skyEnv;
    }
    invalidate();
    done();
  }, undefined, () => done());

  rgbe.load(ASSET("../assets/hdri/brown_photostudio_02_512.hdr"), (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    env.interiorEnv = pmrem.fromEquirectangular(tex).texture;
    if (isInterior()) scene.environment = env.interiorEnv;
    invalidate();
    done();
  }, undefined, () => done());

  return env;
}
