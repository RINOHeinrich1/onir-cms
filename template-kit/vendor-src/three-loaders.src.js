// Source du bundle vendor « three + loaders » (v4.4).
// Reconstruire via : `npm run build:vendor` (esbuild, ESM minifié) →
//   template-immersive/vendor/three-loaders.js
//
// Un SEUL bundle exporte l'instance Three.js ET les loaders addons (FBX/RGBE/GLTF),
// garantissant une unique instance de `three` au runtime (pas de doublon).
export * from "three";
export { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
export { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
