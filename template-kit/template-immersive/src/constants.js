// Constantes partagées du template immersive.

/** Version du template (miroir de `onirtech.template.json`). */
export const TEMPLATE_VERSION = "4.45.2";
// `ELEMENT` reste dans `src/index.js` (exigence du validateur du kit).

/** URL absolue d'un asset embarqué, résolue relativement au module (aucun réseau). */
export const ASSET = (rel) => new URL(rel, import.meta.url).href;

/** Cartographie des jeux de textures PBR embarqués (ambientCG, CC0). */
export const TEX_MAPS = {
  brick: { color: "brick_Color.jpg", normal: "brick_NormalGL.jpg", rough: "brick_Roughness.jpg", ao: "brick_AO.jpg" },
  plaster: { color: "plaster_Color.jpg", normal: "plaster_NormalGL.jpg", rough: "plaster_Roughness.jpg" },
  roof: { color: "roof_Color.jpg", normal: "roof_NormalGL.jpg", rough: "roof_Roughness.jpg", ao: "roof_AO.jpg" },
  wood: { color: "wood_Color.jpg", normal: "wood_NormalGL.jpg", rough: "wood_Roughness.jpg" },
  parquet: { color: "parquet_Color.jpg", normal: "parquet_NormalGL.jpg", rough: "parquet_Roughness.jpg", ao: "parquet_AO.jpg" },
  stone: { color: "stone_Color.jpg", normal: "stone_NormalGL.jpg", rough: "stone_Roughness.jpg", ao: "stone_AO.jpg" },
};

// CONTRAT D'ÉCHELLE : une répétition de texture couvre `tile` MÈTRES (px/m ≈ 1024 / tile).
// Les UV portent l'échelle réelle → une seule instance GPU par fichier, motif identique partout.
export const TEX_TILE = { brick: 1.5, plaster: 2.5, roof: 1.4, wood: 0.9, parquet: 2.0, stone: 1.2 };

// Soleil du HDRI `kloppenheim_06_puresky` mesuré (élévation 49,7°, azimut -19,9°) :
// une seule source lumineuse, cohérente avec le ciel (plus de « second soleil »).
export const SUN_DIR = { x: 0.608, y: 0.763, z: 0.220 };

export const ENTRY_DOOR_MS = 1250;
export const FORM_FADE_MS = 650;
export const HOLD_OPEN_MS = 600;
/** Délai après le franchissement du seuil avant d'ouvrir la vue demandée DEHORS (arrivée caméra). */
export const ARRIVAL_OPEN_MS = 1200;
/** Caméra « dans la salle » (devant le pupitre). */
export const IN_ROOM = { pos: [0, 1.45, 1.1], tgt: [0, 1.0, -0.9] };
/** Caméra « dehors » (devant la porte). */
export const OUT = { pos: [0, 1.65, 7.2], tgt: [0, 1.5, 3.5] };
/** Brume extérieure : fond la cour et le rideau d'arbres dans le ciel. */
export const OUTSIDE_FOG = { color: 0xb8cad9, near: 26, far: 72 };
/** Scène discussion : bureau + personnage + tableau LE LONG DU MUR GAUCHE. */
export const DESK = { pos: [-2.35, 0, 0.3], avatar: [-3.15, 0, 0.3], board: [-3.44, 1.7, -1.9], ry: Math.PI / 2, scale: 2.0 };
/** Caméra de la scène discussion. */
export const DISC_CAM = { pos: [-0.9, 1.48, 0.05], tgt: [-3.0, 1.28, -0.42] };
