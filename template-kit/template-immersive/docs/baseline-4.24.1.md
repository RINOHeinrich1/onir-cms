# Baseline de caractérisation — Immersive 4.24.1

- **Date** : 2026-10-18
- **Branche** : `feature/immersive-refactor` (base `3053501`, issue de `feature/template-sdk`)
- **Version du template** : `4.24.1`
- **Périmètre** : `template-kit/template-immersive`
- **Environnement de mesure** : Node `v20.20.1`, Chromium Playwright, rendu **logiciel**
  (SwiftShader/ANGLE) — les `p95` ne sont pas significatifs (INFO), comme dans `test-render.mjs`.

Ce document fige les mesures **avant** tout déplacement de code. Toute comparaison de
non-régression (lots 1→10, A075) se fait par rapport à ces valeurs et au JSON
`docs/baseline-4.24.1.json`.

## 1. Références Git

| Élément | Valeur |
| --- | --- |
| Branche de travail | `feature/immersive-refactor` |
| Commit de base | `3053501` (`Merge feature/template-sdk into main (CI)`) |
| `git status` avant baseline | propre |

## 2. Tailles et empreintes

| Mesure | Valeur |
| --- | --- |
| `src/index.js` | **134 814 octets** / 2 567 lignes |
| SHA-256 `src/index.js` | `ca5f12129c3f36bd73a4fe6e5dd272be51459d22daa02a802e3e7200fd98a8f7` |
| Archive `immersive-4.24.1.onirtech-template` | **5 802 496 octets** |
| SHA-256 archive (pack sur copie jetable) | `e42f6b341135481b8087e37c1b869bf37e95644df2b33cf7d3b94ac80d84d7e3` |
| `assets/` | 6,5 Mo (inchangé) |
| `vendor/` | 2,6 Mo (inchangé) |

## 3. Validations d'outillage

| Contrôle | Résultat |
| --- | --- |
| `node --check src/index.js` | PASS |
| `onirtech-template validate` (copie jetable) | PASS — `immersive@4.24.1 valide (web-component)` |
| `onirtech-template pack` (copie jetable) | PASS — archive 5 802 496 o, SRI recalculée |
| `test-render.mjs` | **PASS** (détail §4) |

> Le `pack` de baseline a été exécuté sur `/tmp/opencode/immersive-gate` (copie), jamais
> sur le dossier réel : l'artefact `release/immersive-4.24.1.*` reste intact.

## 4. Rendu 3D (`node bin/test-render.mjs`)

| Contrôle | Valeur |
| --- | --- |
| Environnement (IBL) | PASS — `scene.environment` présent |
| Scène non noire | PASS — luminance **120,5**, **92,0 %** de pixels éclairés |
| Avatar visible | PASS — **1,80 m** dans le cadre |
| Orientation avatar | PASS — face caméra |
| Draw calls | **58** (max 150) |
| Triangles | **12 002** (max 400 000) |
| Frame time p95 | ~633–733 ms — **rendu logiciel** (INFO, non significatif) |

## 5. Flux (`node bin/test-immersive-flow.mjs`)

Scénarios exécutés : `entry`, `book`, `discussion`, `mobile`. Tous **PASS**, 0 erreur
console/page, 4 scénarios conformes.

| Mesure | Valeur |
| --- | --- |
| `entryToActions` (sas → barre d'actions) | **13 060 ms** (rendu logiciel, viewport 640×400) |
| `bookOpen` (clic album → livre ouvert) | **6 855 ms** (rendu logiciel, viewport 1280×800) |
| `discussionOpen` (clic Discuter → overlay) | **2 545 ms** |
| Pages livre desktop (1280×800) | **4** |
| Pages livre single (480×800) | **4** |
| `renderer.info.render.calls` (flux) | **50** |
| `renderer.info.render.triangles` (flux) | **11 626** |
| `renderer.info.memory.textures` | **26** |
| `renderer.info.memory.geometries` | **152** |

Notes de mesure :

- Le rendu logiciel étire les animations caméra (le pas `dt` est plafonné à 50 ms) :
  les timings sont **comparables entre lots dans le même environnement**, pas à un
  navigateur matériel ; le plancher de tolérance est porté à 4 000 ms en rendu logiciel. Les constantes de code restent 650/1250/600/1800/2000/3900/2200 ms.
- Le lecteur zoom est **inatteignable en 4.24.1** : `#paint()` remplace la page de droite
  par `#renderPage()`, qui ne reporte pas le handler `zoom` de `#rightPhoto`. Le scénario
  `book` le caractérise en **SKIP** (dette existante, hors périmètre du refactor).
- L'événement `onirtech-ready` peut être émis **avant** la soumission du sas (assets prêts,
  `#checkReady` ~700 ms) : `entryToReady` n'est donc pas une mesure de porte et vaut `null`.

## 6. Budgets exécutables (A008)

| Budget | Seuil |
| --- | --- |
| Draw calls | ≤ 150 |
| Triangles | ≤ 400 000 |
| p95 (hors rendu logiciel) | ≤ 250 ms |
| Textures / géométries | ≤ baseline + 2 |
| Timings de phase | ±10 % ou ±150 ms (plancher ; **4 000 ms en rendu logiciel**) |
| Pages livre | strictement égales à la baseline |
| Archive finale | ≤ baseline + 5 % (5 802 496 × 1,05) |

Le script expose `--json`, `--baseline=<fichier>`, `--write-baseline=<fichier>` et sort en
code 1 dès qu'un budget est dépassé.

## 7. Points visuels de contrôle (captures)

Captures écrites par le flux dans `/tmp/opencode/immersive-flow/` (non versionnées) :

1. `entry-01-form` : formulaire du sas centré, maison en fond.
2. `entry-02-room` : salle après travelling, barre d'actions visible.
3. `book-02-cover` : couverture + pagination desktop.
4. `book-04-single` : livre une page en portrait.
5. `discussion-01-open` / `discussion-02-message` : tableau, dialogue, composer.
6. `mobile-01-room` / `mobile-02-book` / `mobile-03-discussion` : palier mobile.

## 8. Incohérences / dettes constatées (hors périmètre)

Reprises de l'analyse du plan (§17) et confirmées à l'exécution :

1. Échelle de scène `scene-assets.json` (2,6) ≠ `DESK.scale` (2,0) — ne pas corriger.
2. Description du manifeste « rotation de la salle » alors que la caméra se déplace —
   `#rotateRoom` est du code mort (supprimé en A035, sans réintroduire de rotation).
3. Versions/commentaires périmés (`v4.4`, `bundle v4.24.1`) — mis à jour en A072.
4. Vendor inutilisés packés (`three-loaders.js`, `talkinghead.bundle.js`) — hors périmètre.
5. Fuite du debug (`#debugEl` dans `document.body`) — corrigée par A036/A060.
6. Champs/méthodes morts (`#fade`, `#seatRest`, `#avatarNode`, `#sitScheduled`, `T`,
   `messages`) — supprimés en A037.
7. Indentation de première ligne du livre jamais appliquée (`.ln.first`) — ne pas corriger.
8. SRI limitée à l'entrée après découpage — décision D1 documentée (A069).
9. **Lecteur zoom inatteignable** (handler perdu au `#paint`) — constat de baseline,
   **non corrigé** dans ce refactor (changement de comportement).

## 9. Reproductibilité

```bash
cd template-kit
node --check template-immersive/src/index.js
node bin/test-render.mjs
node bin/test-immersive-flow.mjs --scenario=all \
  --write-baseline=template-immersive/docs/baseline-4.24.1.json \
  --archive=<copie>/release/immersive-4.24.1.onirtech-template
node bin/onirtech-template.mjs validate ../../immersive-gate   # copie jetable
node bin/onirtech-template.mjs pack ../../immersive-gate       # copie jetable
```

## 10. Delta 4.25.0 (après refactor)

Mesures finales relevées le 2026-10-18 après les lots 1→10, dans le même
environnement (rendu logiciel). Les tolérances de timings sont celles du JSON
(plancher 4 000 ms en logiciel).

| Mesure | 4.24.1 | 4.25.0 | Δ |
| --- | --- | --- | --- |
| `src/index.js` | 134 814 o / 2 567 l. | **37 248 o / 886 l.** | −72 % d'octets |
| Modules `src/**/*.js` | 1 | **37** | découpage |
| Archive | 5 802 496 o | **5 837 023 o** | +34 527 o (**+0,60 %**) |
| `validate` | PASS 4.24.1 | **PASS 4.25.0** | — |
| `test-render` luminance | 120,5 | **120,5** | = |
| `test-render` avatar | 1,80 m | **1,80 m** | = |
| `test-render` draw calls | 58 | **58** | = |
| `test-render` triangles | 12 002 | **12 002** | = |
| Flow `entryToActions` | 13 060 ms | **12 939 ms** | dans la tolérance |
| Flow `bookOpen` | 6 855 ms | **7 166 ms** | dans la tolérance |
| Flow `discussionOpen` | 2 545 ms | **2 648 ms** | dans la tolérance |
| Flow draw calls / tris | 50 / 11 626 | **50 / 11 626** | = |
| Flow textures / géométries | 26 / 152 | **26 / 152** | = |
| Pages desktop / single | 4 / 4 | **4 / 4** | = |
| Unités `node:test` | — | **39 PASS** | — |
| Scénarios flow | 4 | **5 PASS** (`remount` inclus) | — |
| Avatar / props | PASS | **PASS** (22/22 os, 52/52 ARKit, 15/15 visèmes ; 12 props) | — |

- Archive 4.25.0 : SHA-256 `f4b5d9deb243f535f51479dbab6f2dfbc2e71b8e2bd64b13851d7c6d2fc42975`.
- SRI de l'entrée mise à jour par `pack` ; `release/immersive-4.24.1.*` intact.
- `assets/**`, `vendor/**`, `CREDITS.md` inchangés ; contrat `onirtech.template-host.v1`,
  entry, element et capabilities inchangés ; manifeste modifié uniquement pour
  `version` + `ui.integrity`.
- Invariants machine : `ok` en `?debug=1` et dans les scénarios flow ; re-montage :
  1 canvas, actions visibles, aucun overlay debug orphelin ; pause RAF vérifiée.
- Captures finales : `/tmp/opencode/immersive-flow/` (non versionnées).

**Écart assumé vs §10 du plan** : la cible indicative « `index.js` < ~350 lignes »
n'est pas atteinte (886 lignes). Les effets de transition (sas/porte/travelling,
extérieur, resize, boucle) restent dans la composition root conformément à A053,
qui les décrit comme câblage/callbacks. Une extraction ultérieure
(`flow/sas.js`, `flow/room.js`) est recommandée si la cible de taille devient
contractuelle ; ce n'est ni une régression ni un blocage des gates.

**Dette conservée** : le lecteur zoom reste inatteignable (handler perdu au
`#paint` en 4.24.1) ; il est isolé dans `ui/reader.js` et caractérisé en SKIP,
sans changement de comportement.
