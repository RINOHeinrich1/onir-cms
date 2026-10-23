// Matériaux PBR et cache de textures (une instance GPU par fichier/sRGB).
import { TEX_MAPS } from "../constants.js";

export function createMaterials({ THREE, ASSET, invalidate, manager }) {
  const texCache = new Map();

  /** Texture PBR mise en cache par (fichier, repeat) — un seul objet GPU par variante. */
  function texGet(file, srgb) {
    const key = `${file}|${srgb ? "srgb" : "lin"}`;
    const hit = texCache.get(key);
    if (hit) return hit;
    const t = new THREE.TextureLoader(manager).load(ASSET(`../assets/textures/${file}`), () => invalidate(), undefined, () => {});
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8; // l'échelle vient des UV, pas de `repeat` par usage
    texCache.set(key, t);
    return t;
  }

  /** Matériau PBR depuis une texture embarquée (repeat par usage, texture mutualisée). */
  function mkPBR(name, { roughness = 1, metalness = 0, color = 0xffffff, side, clearcoat = 0, clearcoatRoughness = 0.2, normalScale = 1 } = {}) {
    const m = TEX_MAPS[name] || {};
    const P = {
      color, // teinte NEUTRE uniquement (variante de valeur) : l'albedo vient de la texture
      roughness,
      metalness,
      map: texGet(m.color, true),
      normalMap: m.normal ? texGet(m.normal, false) : null,
      roughnessMap: m.rough ? texGet(m.rough, false) : null,
      aoMap: m.ao ? texGet(m.ao, false) : null,
    };
    // Un vernis (sol, boiseries cirées) exige un vrai clearcoat : MeshPhysicalMaterial.
    const mat = clearcoat > 0
      ? new THREE.MeshPhysicalMaterial({ ...P, clearcoat, clearcoatRoughness })
      : new THREE.MeshStandardMaterial(P);
    if (mat.aoMap) mat.aoMapIntensity = 1;
    if (mat.normalMap) mat.normalScale.set(normalScale, normalScale);
    if (side) mat.side = side;
    return mat;
  }

  return { texGet, mkPBR };
}
