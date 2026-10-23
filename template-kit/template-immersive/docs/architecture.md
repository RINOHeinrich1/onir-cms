# Architecture — template Immersive

- **Version de référence** : 4.26.2 (modale de confirmation « Terminer » + toast, composer en icônes, zone basse 30 % sur mobile)
- **Précédente** : 4.26.1 (composer en icônes, bouton « Terminer », zone basse 30 % sur mobile)
- **Antérieure** : 4.25.2 (actions extérieures « Discuter » / « Ouvrir album »)
- **Refactor modulaire** : 4.25.0 (monolithe 4.24.1 → modules)
- **Contrat** : `onirtech.template-host.v1` (inchangé)
- **Stack** : vanilla JS / ESM, **sans build**, Three.js + TalkingHead embarqués dans
  `vendor/immersive.js`.
- **Décisions** : ADR-0019 (UI-only), ADR-0021 (RETEX 3D), ADR-0023 (variables
  paramétrables), ADR-0024 (SDK JS templates).

## 1. Arbre des modules

```text
src/
├── index.js                 # composition root + custom element
├── constants.js             # ASSET, TEX_MAPS, TEX_TILE, SUN_DIR, timings, caméras, DESK
├── styles.js                # STYLE (CSS inline verbatim)
├── lifecycle.js             # AbortController, timers, RAF, visibility, dispose
├── host/adapter.js          # unique frontière ctx/actions/capabilities/params
├── state/machine.js         # machine pure (états, événements, invariants)
├── lib/
│   ├── dom.js               # h(), ICON_CHAT, ICON_BOOK
│   ├── math.js              # easeInOut, lerp
│   ├── mood.js              # moodFromUserState
│   ├── markdown.js          # mdToHtml
│   ├── book-layout.js       # wrapLines, paginate (mesure injectée)
│   ├── cover.js             # makeCoverCanvas, makeCoverTexture
│   ├── identity.js          # email + localStorage
│   ├── typewriter.js        # progression PURE du texte (rythme, pauses)
│   ├── pagination.js        # PAGE_MARK, splitAtWord, resolveNav, pageLabel (PURS)
│   └── actions-visibility.js # prédicats PURS : roomActionsVisible, outsideActionsVisible
├── scene/
│   ├── geometry.js          # withAO, uvPlane, uvBox, uvScale
│   ├── materials.js         # createMaterials (cache textures)
│   ├── environment.js       # loadEnvironments (HDRI + PMREM)
│   ├── lights.js            # createLights
│   ├── renderer.js          # createRenderer
│   ├── room.js              # buildRoom
│   ├── lectern.js           # buildLectern
│   ├── book-mesh.js         # buildBookMesh (+ setTitle)
│   ├── house.js             # buildHouse
│   ├── desk.js              # buildDeskScene
│   ├── desk-deco.js         # paintDecoBoard
│   ├── avatar.js            # createAvatar (TalkingHead)
│   ├── quality.js           # detectQuality
│   ├── room-rotation.js     # createRoomRotation
│   └── dispose.js           # disposal GPU
├── camera/
│   ├── rig.js               # createCameraRig (setCam/step/orbite/regard)
│   └── input.js             # bindOrbitInput
├── interaction/picking.js   # bindPicking (porte/avatar/pupitre)
├── debug/overlay.js         # createDebugOverlay (?debug=1)
└── ui/
    ├── entry.js             # formulaire du sas
    ├── board.js             # tableau HTML
    ├── action-buttons.js    # boutons PARTAGÉS « Discuter » / « Ouvrir album »
    ├── discussion.js        # overlay discussion + composer + nav + pagination
    ├── pagination.js        # paginateBubble : découpe MESURÉE en pages (sonde DOM)
    ├── typewriter-dom.js    # typeInto : révélation progressive dans la bulle
    ├── outside-actions.js   # mêmes boutons, EMPILÉS en haut à droite DEHORS
    ├── book.js              # livre 2D (couverture/pagination/feuilles)
    └── reader.js            # lecteur zoom 2D
```

## 2. Règles de dépendance

| Couche | Règle |
| --- | --- |
| `index.js` | Composition root : cycle de vie, câblage, machine, callbacks. Aucun DOM détaillé. |
| `scene/**` | Reçoit `THREE`, helpers et callbacks ; ne connaît ni le host ni l'UI. |
| `ui/**` | Reçoit des callbacks et un `navState` partagé ; ne connaît ni `ctx` ni Three.js. |
| `host/adapter.js` | Seul point d'accès `ctx` / actions / capabilities / params. |
| `state/machine.js` | Pur, sans DOM, sans host. |
| `lifecycle.js` | Seul propriétaire des listeners/timers/RAF. |
| `lib/**` | Pur ou DOM minimal, sans état global. |

Aucun module n'importe `index.js` (pas de cycle). `ELEMENT` reste dans `index.js`
(exigence du validateur) ; `ASSET` reste dans `constants.js` (résolution
`../assets/...` correcte depuis `src/`).

## 3. Machine à états

Source de vérité unique : `state/machine.js`.

```text
{ phase, scene, overlay, overlayPrev, door, entered, exited,
  interiorPending, bookPending, booktest, readerIndex }
```

- `#view` est dérivé : `scene === "book" ? "book" : scene === "discussion" ? "discussion" : "room"`.
- Événements : `HOST_PHASE`, `SHOW_IDENTITY`, `SUBMIT_IDENTITY`, `AUTO_ENTER`,
  `DOOR_OPENED`, `INTERIOR_READY`, `ENTER_ROOM_INSTANT`, `OPEN_DISCUSSION`,
  `CLOSE_DISCUSSION`, `REQUEST_BOOK`, `BOOK_OPENED`, `OPEN_BOOK_DEV`, `CLOSE_BOOK`,
  `OPEN_READER`, `CLOSE_READER`, `EXIT_OUTSIDE`, `ENTER_FROM_OUTSIDE`, `TEARDOWN`.
- `checkInvariants()` vérifie les invariants 1→7 ; ils sont exposés en `?debug=1`
  (`window.__onirtech.__invariants`) et testés par `tests/machine.test.mjs`.
- `?booktest=1` est la seule exception documentée : l'overlay livre peut être ouvert
  avec `scene = "room"` (compatibilité 4.24.1).
- **Actions extérieures (4.25.2)** : deux colonnes d'actions partagent les MÊMES boutons
  (`ui/action-buttons.js`) — `.actions` (salle, bas-centre) et `.outside-actions`
  (dehors, EMPILÉS en haut à droite). Visibilité décidée par les prédicats purs
  `lib/actions-visibility.js`. Un clic DEHORS (`#enterFromOutside`) pose
  `#pendingEnter`, joue `ENTER_FROM_OUTSIDE` → porte + travelling, puis la vue
  demandée s'ouvre À L'ARRIVÉE (`#goInterior`, délai `ARRIVAL_OPEN_MS`). Jamais de
  bouton pendant le sas (`formShown`) ni pendant l'ouverture de porte.
- **Dialogue (4.26.0)** : bulle à **hauteur fixe** (aucune barre de défilement), texte
  révélé caractère par caractère (18 ms/car., pause 260 ms après `. ! ? …`, 200 ms entre
  blocs, 700 ms avant la page suivante), messages longs **paginés** (`‹ 2 / 5 ›`).
  `ui/pagination.js` mesure le message complet dans une sonde invisible de la MÊME
  taille que la bulle, empile les blocs tant que ça tient, coupe au mot sinon (bisection
  sur `mid`, jamais linéaire) ; pages 2+ = marqueur `…` en tête (`float`, sans impact
  sur la mesure), page tronquée = `…` en pied (`position:absolute`, bande réservée dans
  le `padding-bottom`). Les `<br>` entre deux blocs Markdown sont écartés (aucune ligne
  visible, seulement de la place mesurée). Navigation : `‹ ›` terminent la frappe puis
  appliquent le déplacement, clic sur la bulle = affichage immédiat, flèches ←/→ (hors
  champ de saisie), historique **instantané** (pas de rejeu). `prefers-reduced-motion`
  ⇒ tout instantané, sans auto-avance. Un message reçu pendant une frappe annule la
  frappe en cours et tape le plus récent. Version affichée dynamiquement
  (`constants.js` `TEMPLATE_VERSION` = miroir du manifeste).
- **Composer & « Terminer » (4.26.2)** : le composer expose deux boutons —
  **Envoyer** (icône avion en papier) et **Terminer** (icône coche, action
  secondaire bordée). Sous 700 px, les libellés sont masqués et chaque bouton
  devient une cible carrée de 44 px (`.lbl { display:none }`). « Terminer » est
  **toujours visible** (jamais masqué ni désactivé, quel que soit `status`) mais
  n'agit JAMAIS directement : il ouvre une **modale de confirmation séparée**
  (`ui/finish-modal.js`, `.finishmodal` + `.finishcard`, `role="dialog"`
  `aria-modal`, focus sur « Terminer », Échap ou clic sur le fond = annulation).
  La confirmation explicite appelle `actions.finish()` (génération de la fiche)
  et affiche un **toast de confirmation** (`.finishtoast`, `role="status"`,
  « Votre fiche est en cours de génération. », auto-masqué après 4,5 s).
- **Zone basse mobile (4.26.1)** : `.discbottom` passe de 52 % (56 % en paysage
  court) à **30 %** de la hauteur, pour laisser le personnage visible et rendre
  le texte lisible ; la pagination mesure la nouvelle hauteur et s'y adapte
  (moins de texte par page, plus de pages). Desktop inchangé (38 %).

## 4. Cycle de vie

`createLifecycle()` centralise :

- `AbortController` : tous les listeners `window`/`document`/`visualViewport`/canvas ;
- registre de timers (`timer`) annulés au démontage ;
- RAF unique (`raf`/`cancelRaf`) ;
- `visibilitychange` : pause RAF + avatar, reprise avec `#last = performance.now()` ;
- `dispose()` idempotent (abort + clear + cancel).

`disconnectedCallback` → `#teardown()` :

1. `lifecycle.dispose()` ;
2. `avatar.dispose()` + `debug.dispose()` ;
3. `disposeObject3D(scene)` (géométries, matériaux, textures, skeletons) ;
4. `disposeEnvironment(env)` + `disposeRenderer(renderer)` (renderLists, dispose,
   `forceContextLoss`) ;
5. `shadowRoot.replaceChildren()` et remise à zéro de l'état.

`connectedCallback` après teardown reconstruit tout : **un seul canvas**, aucun timer
orphelin, `onirtech-ready` de nouveau émis.

## 5. Sous-modules et SRI (D1)

`ui.entry` reste `./src/index.js`. Le navigateur résout les imports relatifs
(`./constants.js`, `./scene/room.js`, …) ; le serveur d'assets sert tout chemin de
l'archive en `text/javascript`. Conséquence assumée : la SRI `ui.integrity` ne couvre
que l'entrée, pas les sous-modules (comme les textures/GLB). `pack` archive
récursivement `src/`.

## 6. Budgets et contrôles

| Mesure | Budget |
| --- | --- |
| Draw calls | ≤ 150 |
| Triangles | ≤ 400 000 |
| p95 (hors rendu logiciel) | ≤ 250 ms |
| Textures / géométries | baseline + 2 |
| Timings de phase | ±10 % (plancher 4 000 ms en rendu logiciel) |
| Pages livre | strictement égales à la baseline |
| Archive | ≤ baseline + 5 % |

Outils :

- `node bin/test-render.mjs` — IBL, scène non noire, avatar, draw calls, triangles, p95.
- `node bin/test-immersive-flow.mjs --baseline=template-immersive/docs/baseline-4.24.1.json`
  — scénarios `entry`, `book`, `discussion`, `outside`, `mobile`, `remount`, `longmsg`,
  invariants, budgets.
- `npm run test:immersive --prefix template-kit` — unités `node:test`.
- `bin/onirtech-template.mjs pack|validate` sur **copie jetable** avant A072.

## 7. Références

- `docs/baseline-4.24.1.md` / `.json` — mesures de caractérisation.
- `docs/contributing.md` — règles de contribution et checklist visuelle.
- `tests/` — pagination (pure + `dropRedundantBreaks`), typewriter, fonctions pures,
  identité, qualité, machine, host.
