# Crédits & licences — template « Immersive » (assets embarqués)

Tous les assets 3D sont **embarqués** dans le template (aucun accès réseau au
runtime). Matériaux, HDRIs et code (Three.js / TalkingHead) sont sous
**CC0 1.0 / MIT**. La clôture de la cour est générée procéduralement, sans
asset client. L'**avatar** du personnage 3D est un avatar **Microsoft
RocketBox** distribué sous **licence MIT** (usage commercial autorisé) — voir §3.

> **CC0 1.0** : <https://creativecommons.org/publicdomain/zero/1.0/> — l'auteur a
> renoncé à ses droits ; usage commercial et modification libres, **sans
> attribution obligatoire**. Les attributions ci-dessous sont fournies par
> courtoisie et pour la traçabilité.

## 1. HDRIs (éclairage) — Poly Haven (CC0 1.0)

| Fichier embarqué | Source | Licence |
| --- | --- | --- |
| `assets/hdri/kloppenheim_06_puresky_512.hdr` | Poly Haven — *Kloppenheim 06 (Pure Sky)* | CC0 1.0 |
| `assets/hdri/brown_photostudio_02_512.hdr` | Poly Haven — *Brown Photostudio 02* (intérieur) | CC0 1.0 |

- Site : <https://polyhaven.com/> — licence : <https://polyhaven.com/license> (CC0).
- Téléchargement : `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<slug>_1k.hdr`.

## 2. Textures PBR — ambientCG (CC0 1.0)

Chaque matériau fournit `_Color` (sRGB), `_NormalGL` (normal map OpenGL),
`_Roughness` et, quand disponible, `_AO` (occlusion ambiante). Redimensionnées /
ré-encodées (JPEG) pour un poids raisonnable.

| Jeu embarqué | Assets ambientCG (ID) | Maps | Licence |
| --- | --- | --- | --- |
| `textures/brick_*` | **Bricks097** | Color / NormalGL / Roughness / AO | CC0 1.0 |
| `textures/plaster_*` | **Plaster001** | Color / NormalGL / Roughness | CC0 1.0 |
| `textures/roof_*` | **RoofingTiles013A** | Color / NormalGL / Roughness / AO | CC0 1.0 |
| `textures/wood_*` | **Wood096** (porte) | Color / NormalGL / Roughness | CC0 1.0 |
| `textures/parquet_*` | **WoodFloor051** (sol) | Color / NormalGL / Roughness / AO | CC0 1.0 |
| `textures/stone_*` | **PavingStones151** (soubassement/sol ext.) | Color / NormalGL / Roughness / AO | CC0 1.0 |

- Site : <https://ambientcg.com/> — licence : <https://ambientcg.com/license> (CC0).
- Téléchargement : `https://ambientcg.com/get?file=<ID>_1K-JPG.zip`.

## 3. Personnage 3D — TalkingHead (MIT) + avatar Microsoft RocketBox (MIT)

| Fichier embarqué | Source | Licence |
| --- | --- | --- |
| `vendor/immersive.js` | **TalkingHead 1.7** (`met4citizen/TalkingHead`) + three 0.186.1 + addons (bundle unifié) | **MIT** |
| `assets/models/avatar.glb` | Avatar **Female_Adult_03** — **Microsoft RocketBox** | **MIT** |

- TalkingHead : <https://github.com/met4citizen/TalkingHead> — licence **MIT**.
- RocketBox : <https://github.com/microsoft/Microsoft-Rocketbox> — licence
  **MIT** (<https://github.com/microsoft/Microsoft-Rocketbox/blob/master/LICENSE>),
  © Microsoft Corporation. Avatar `Female_Adult_03` (blendshapes ARKit/AU/SR
  fournies par la mise à jour de juin 2022).
- **Adaptations apportées au fichier source** : fusion du maillage et des
  blendshapes (`Female_Adult_03_facial.fbx`), renommage des 52 blendshapes ARKit
  et des 15 visèmes Oculus, greffe sur un squelette Mixamo (poids automatiques), rotation du maillage, séparation du
  maillage par matériau (morphs conservés sur la tête uniquement), textures
  ré-encodées en WebP 1024, correction des facteurs métalliques, normalisation de
  l'échelle (1,72 m). Poids final : 3,1 Mo (rig Mixamo, morphs sur la tête uniquement).
- Personnage **muet** : humeurs (`setMood`) + gestes (`playGesture`) + mouvements
  de tête, sans TTS ni lip-sync.

## 4. Three.js (vendor) — MIT

| Fichier embarqué | Source | Licence |
| --- | --- | --- |
- Three.js 0.186.1 + addons (dont RGBELoader / GLTFLoader) est inclus dans le bundle `vendor/immersive.js`.
- Bundle ESM minifié produit par esbuild (voir `template-kit/bin/build-immersive.mjs`).
- Site : <https://threejs.org/> — licence : <https://github.com/mrdoob/three.js/blob/dev/LICENSE> (MIT).

## 5. Mobilier (bureau, chaise) — Kenney (CC0 1.0)

| Fichier embarqué | Source | Licence |
| --- | --- | --- |
| `assets/models/desk.glb` | **Kenney — Furniture Kit** (www.kenney.nl) | **CC0 1.0** |
| `assets/models/chair.glb` | **Kenney — Furniture Kit** (www.kenney.nl) | **CC0 1.0** |
