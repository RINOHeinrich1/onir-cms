# 0021. RETEX template immersif — règles de développement d'un site 3D (performance, tactile, assets asynchrones)

- **Statut** : Accepté
- **Date** : 2026-10-17
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0019 (templates visuels — packages UI-only, contrat hôte v1)
  et ADR-0020 (capacités du cœur). Consigne les règles issues des itérations
  `immersive` **4.14.2 → 4.14.5**.

## Contexte

Le template `immersive` (maison 3D → salle → discussion, HDRI + PBR + ombres)
a subi une passe d'optimisation mobile et de correction de bugs en 4 itérations.
Chaque itération a révélé un piège **générique** de développement de scène 3D
dans un web-component embarqué, reproductible pour tout futur template immersif :

- **4.14.2** : pignons/murs à face unique → on voyait à travers le toit.
- **4.14.3** : sol parquet (intérieur) / pierre (extérieur) → rupture de matière au seuil.
- **4.14.4** : **maison entièrement noire en qualité basse (mobile)** — le
  *render-on-demand* dessinait la première frame **avant** le chargement du HDRI,
  puis la boucle s'arrêtait ; la qualité haute « masquait » le bug via le
  préchargement avatar. Diagnostic par **bisection** : DPR, antialias, ombres et
  `powerPreference` tous innocents.
- **4.14.5** : **glissement manuel très lent sur mobile** alors que les mouvements
  automatisés et la rotation « aller à la discussion » étaient fluides → cause :
  `backdrop-filter: blur()` recalculé à chaque frame au-dessus du canvas WebGL
  animé, + absence de `touch-action` (le navigateur captait le geste).

## Décision

### 1. Rendu à la demande et assets asynchrones

- Toute scène à **rendu à la demande** DOIT **invalider le rendu** (`invalidate()`)
  à **chaque** modification de la scène, y compris **asynchrone** : chargement de
  textures PBR, HDRI/env (PMREM), GLB, mises à jour de textures canvas.
- Après la fin du chargement des assets, une **salve de re-rendus** est déclenchée
  (quelques frames différées) pour rattraper les **uploads GPU tardifs** et la
  compilation de shaders.
- Le HSRI/`scene.background` **et** `scene.environment` doivent être vérifiés sur
  les **deux** paliers de qualité : un ciel uni « sans nuages » = env non appliqué.
- **Aucun délai de disponibilité fixe** (`setTimeout` arbitraire) : la disponibilité
  est **pilotée par les assets** ; un simple garde-fou (cap) est toléré.

### 2. Paliers de qualité

- Détection d'un palier `high` / `low` (pointer grossier + cœurs/mémoire/écran).
- Palier `low` : DPR réduit (ex. 1.3), antialias désactivé, ombres désactivées
  (shadow map réduite si conservée), avatar **non préchargé** (lazy).
- Les choix de palier sont appliqués **à la création du renderer** et le reste du
  code ne doit pas dépendre du palier pour sa **logique** (uniquement pour le coût).

### 3. Interaction tactile

- Le canvas 3D DOIT porter **`touch-action: none`** (+ `user-select: none`) pour que
  le navigateur ne capte pas le geste (pan/zoom/pointercancel).
- **Interdit** : `backdrop-filter` (et flous coûteux) sur un overlay **au-dessus d'un
  canvas animé** — le flou serait recalculé à chaque frame. Utiliser des fonds
  translucides simples. Le flou n'est acceptable que sur un overlay modal pendant
  lequel la scène 3D est **statique**.
- Indice de diagnostic : **automatisé fluide / manuel lent** ⇒ le problème est dans
  la **chaîne d'entrée + compositing**, pas dans le coût de rendu de la scène.

### 4. Matériaux et cohérence visuelle

- Une géométrie visible des deux côtés (pignons, murs, cloisons minces) DOIT être
  modélisée avec de l'épaisseur **ou** en `DoubleSide` ; jamais une face unique
  laissant voir à travers.
- Les zones de **raccord** (seuil porte, jonction sol intérieur/extérieur) utilisent
  une **matière continue** ; une variante est admise seulement si elle est homogène.

### 5. Méthode de diagnostic (normative)

- **Bisection mono-variable** : isoler une hypothèse à la fois via des *flags
  temporaires* (query-param), puis **les retirer** du code livré. Ne jamais conclure
  sur une cause non reproduite.
- **Vérifier les deux cibles** (desktop + émulation mobile `deviceScaleFactor`
  élevé, `isMobile`, `hasTouch`), capturer **erreurs console** et dimensions canvas,
  et rejouer le **parcours réel** (pas seulement l'écran d'accueil).
- Distinguer un **404 transitoire** (favicon) d'un asset réellement manquant.

### 6. Assets et licences

- Vérifier la **licence AVANT intégration** : CC0 / MIT pour un usage commercial.
  Toute ressource non commerciale (ex. CC BY-NC) est un **blocage** à tracer.
- Les sources (HDRI, textures, modèles) sont **embarquées** (hors-réseau) et
  documentées dans `CREDITS.md`.

### 7. Livraison et traçabilité

- Développement **uniquement en workspace**, mise en production **uniquement par la
  CI/CD** (jamais d'édition en prod).
- **Incrémenter la version du manifeste AVANT `pack`** (le pack resynchronise
  l'intégrité SRI et produit l'archive). `node --check` avant.
- Vérifier après import : le **bundle servi** expose la bonne version et l'
  **intégrité SRI du manifeste** correspond au fichier servi.
- Piège d'outillage : `psql -tAc "INSERT … RETURNING id"` **ajoute `INSERT 0 1`** →
  ne lire que la **première ligne**.

## Conséquences

### Positives
- Bugs mobiles **reproductibles** évités par des règles explicites (invalidation
  async, `touch-action`, proscription du blur sur canvas animé).
- Performance mobile : paliers de qualité + rendu à la demande + assets lazy →
  fluidité du glissement et des transitions.
- Diagnostic plus rapide (bisection mono-variable) et livraison fiable (version/SRI).

### Négatives / Risques
- Le rendu à la demande impose une **discipline d'invalidation** : un oubli =
  frame figée. À couvrir par revue et tests.
- Les paliers de qualité introduisent une **divergence visuelle** assouplie
  (ombres/AA absents en `low`) à assumer.
- Suppression des `backdrop-filter` = léger changement esthétique (fonds plus opaques).

## Alternatives écartées
- **Garder la RAF toujours active** pour éviter les oublis d'invalidation : rejeté
  (batterie/CPU sur mobile), au profit du rendu à la demande + invalidation.
- **Garder `backdrop-filter` et réduire la fréquence de rendu** : rejeté, le coût du
  flou est par frame au-dessus du canvas animé ; le vrai correctif est tactile.
- **Délai de disponibilité fixe** : rejeté, masque la logique réelle de « prêt ».
- **Ignorer le palier mobile** (qualité unique) : rejeté, cause du lag initial.

## Liens
- Complète ADR-0019 (contrat hôte v1, templates UI-only) et ADR-0020 (capacités cœur).
- S'applique à tout template 3D du catalogue `templates-visuels`.
