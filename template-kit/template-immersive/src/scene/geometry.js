// Helpers d'UV partagés par les builders Three.js.

/** Reproduction de l'UV de base dans le 2e canal (uv1) — requis par l'`aoMap`. */
export function withAO(geo) {
  const uv = geo.attributes.uv;
  if (uv && !geo.attributes.uv1) geo.setAttribute("uv1", uv.clone());
  return geo;
}

/** UV en MÈTRES (plan) : `tile` = côté couvert par une répétition. */
export function uvPlane(geo, w, h, tile) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  uv.needsUpdate = true;
  return geo;
}

/** UV boîte : chaque face reçoit l'échelle de SES dimensions réelles. */
export function uvBox(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // px,nx,py,ny,pz,nz
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f];
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * a) / tile, (uv.getY(i) * b) / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

/** UV déjà exprimés en unités monde (ShapeGeometry, Cylinder…) : simple mise à l'échelle. */
export function uvScale(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}
