# Contribuer au template Immersive

## 1. Interdits

- **React / framework** : le template reste **vanilla JS** (ADR-0024).
- **Nouvelle dépendance runtime** : `vendor/immersive.js` est la seule lib embarquée.
- **Modification de `vendor/**`, `assets/**`, `CREDITS.md`** : hors périmètre.
- **Modification du manifeste** hors `version` (contrat, entry, capabilities, params).
- **Retouche CSS** : `src/styles.js` est un déplacement verbatim ; tout changement
  visuel est un bug de refactor.
- **Correction opportuniste** des dettes listées dans la baseline (`DESK.scale`,
  `.ln.first`, lecteur zoom non atteignable, vendor inutilisés).

## 2. Ajouter un builder de scène

1. Créer `src/scene/<nom>.js` exportant `build<Nom>({ THREE, ...deps })`.
2. Recevoir `mkPBR`/`texGet`/`uv*`/`TEX_TILE` par injection ; ne pas importer `index.js`.
3. Retourner des objets (`group`, refs) et **ne pas** toucher au host ni à l'UI.
4. Ajouter l'appel dans `#initThree()` (composition root) et un test de rendu si possible.
5. Gate : `node --check`, `test-render`, flow, pack/validate sur copie.

## 3. Ajouter une UI

1. Créer `src/ui/<nom>.js` exportant `create<Nom>UI({ root, ...callbacks })`.
2. Recevoir des callbacks et un état partagé (`navState`) ; **ne pas** importer `ctx`
   ni Three.js.
3. Ajouter la factory dans `#build<Nom>()` et déléguer les événements clavier/resize.
4. Vérifier le scénario flow correspondant (`book`, `discussion`, `mobile`, …).

## 4. Ajouter un état / une transition

1. Modifier `src/state/machine.js` : état dans `DEFAULT_STATE`, transition dans `send`.
2. Mettre à jour `checkInvariants()` si un invariant est ajouté.
3. Ajouter un cas dans `tests/machine.test.mjs`.
4. Dans `index.js`, envoyer l'événement et garder les effets (caméra, DOM, timers)
   dans la composition root.

## 5. Gates avant commit

```bash
# 1. Syntaxe
for f in template-immersive/src/**/*.js; do node --check "$f"; done

# 2. Rendu
node bin/test-render.mjs

# 3. Phases + budgets
node bin/test-immersive-flow.mjs --baseline=template-immersive/docs/baseline-4.24.1.json  # + --scenario=outside

# 4. Unités
npm run test:immersive --prefix template-kit

# 5. Pack/validate sur COPIE jetable (jamais le dossier réel avant A072)
rm -rf /tmp/opencode/immersive-gate
cp -a template-immersive /tmp/opencode/immersive-gate
node bin/onirtech-template.mjs pack ../../immersive-gate
node bin/onirtech-template.mjs validate ../../immersive-gate

# 6. Diff
git diff --check
git status --porcelain
```

## 6. Checklist visuelle

1. **Sas** : formulaire centré, maison en fond, pas de saut de layout.
2. **Soumission** : disparition 650 ms → porte −1,95 rad sur 1250 ms → maintien 600 ms →
   approche 1,8 s → seuil `z < 3,4` sans flash → travelling 2,0 s → actions.
3. **Salle** : pupitre + livre fermé, lambris/bibliothèque/lustre, curseur `grab`.
4. **Livre** : couverture (titre paramétré), ouverture 0,9 s, pages, feuille 430/1000 ms,
   mode single ≤ 600 px, Escape.
5. **Discussion** : caméra 1,2 s, lectern masqué, tableau, dialogue, composer,
   navigation message par message (avatar non relancé), tableau repliable ≤ 1024.
6. **Extérieur** : clic porte → maison/sol visibles, fog retiré, caméra 2,2 s, hint ;
   boutons « Discuter » / « Ouvrir album » **empilés en haut à droite**, aucun pendant le
   sas ; un clic entre dans la maison puis ouvre la vue demandée.
7. **Re-montage** : un seul canvas, pas de doublon d'overlay, actions visibles.

## 7. Version

Le bump de version (`onirtech.template.json`) est **le dernier changement** de code,
juste avant `pack`/`validate` réels. Ne jamais réutiliser une version déjà publiée.
Après `pack`, vérifier que l'archive contient `src/**` et que la SRI de l'entrée est
à jour.
