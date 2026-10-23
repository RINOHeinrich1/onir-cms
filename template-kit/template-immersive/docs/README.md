# Documentation — template Immersive

Point d'entrée de la documentation interne du template.

- [Architecture](architecture.md) — modules, frontières, machine à états, cycle de vie,
  SRI/sous-modules, budgets.
- [Contribution](contributing.md) — ajouter un builder/UI/état, interdits, gates,
  checklist visuelle, bump de version.
- [Baseline 4.24.1](baseline-4.24.1.md) — mesures de caractérisation avant refactor
  (`baseline-4.24.1.json` pour les budgets exécutables).

## Actions visibles

- **Salle** (entré) : barre `.actions` en bas au centre — « Discuter » + « Ouvrir album ».
- **Dialogue** (4.26.0) : bulle à hauteur fixe (pas de défilement), texte révélé
  progressivement ; un message long se feuillette avec `‹ ›` (`2 / 5`) et se termine
  instantanément au clic. Flèches ←/→ au clavier.
- **Composer** (4.26.2) : **Envoyer** (avion en papier) et **Terminer** (coche) ;
  libellés masqués ≥ 44 px d'icône seule sous 700 px. « Terminer » ouvre une
  **modale de confirmation** dédiée (Annuler / Terminer, Échap) puis génère la fiche
  (`actions.finish()`), avec un **toast de confirmation**. Zone basse à **30 %** sur
  mobile (personnage visible), desktop à 38 %.
- **Dehors** (phase `chat`, sas terminé) : mêmes boutons EMPILÉS en **haut à droite**
  (`.outside-actions`) ; un clic **entre dans la maison** (porte + travelling) puis ouvre
  la discussion / l'album. Aucun bouton pendant le formulaire du sas.

## Modes de développement

- `?debug=1` : overlay de métriques 3D (`window.__onirtech.__metrics`), invariants de
  machine (`window.__onirtech.__invariants`), bouton « copier JSON ».
- `?booktest=1` : ouverture automatique du livre après 2,5 s (mode dev, `scene` reste
  `"room"`).
- `node bin/test-render.mjs` : smoke de rendu (IBL, scène non noire, avatar, budgets).
- `node bin/test-immersive-flow.mjs --baseline=template-immersive/docs/baseline-4.24.1.json` :
  scénarios `entry`, `book`, `discussion`, `outside` (actions vues DEHORS), `mobile`,
  `remount`, `longmsg` (message long paginé).
