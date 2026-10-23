// Libération des ressources GPU (géométries, matériaux, textures, renderer).

export function disposeObject3D(root) {
  const seen = new Set();
  root?.traverse?.((obj) => {
    if (obj.geometry && !seen.has(obj.geometry)) {
      seen.add(obj.geometry);
      try { obj.geometry.dispose(); } catch { /* ignore */ }
    }
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      for (const value of Object.values(material)) {
        if (value && value.isTexture && !seen.has(value)) {
          seen.add(value);
          try { value.dispose(); } catch { /* ignore */ }
        }
      }
      try { material.dispose?.(); } catch { /* ignore */ }
    }
    if (obj.isSkinnedMesh && obj.skeleton) {
      try { obj.skeleton.dispose?.(); } catch { /* ignore */ }
    }
  });
}

export function disposeEnvironment(env) {
  for (const texture of [env?.skyTex, env?.skyEnv, env?.interiorEnv]) {
    try { texture?.dispose?.(); } catch { /* ignore */ }
  }
}

export function disposeRenderer(renderer) {
  try { renderer?.renderLists?.dispose?.(); } catch { /* ignore */ }
  try { renderer?.dispose?.(); } catch { /* ignore */ }
  try { renderer?.forceContextLoss?.(); } catch { /* ignore */ }
}
