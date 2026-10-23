# 0022. Contrat d'asset 3D (avatar) et validation automatique en CI

- **Statut** : Accepté
- **Date** : 2026-10-17
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0021 (règles de développement d'un site 3D) sur le
  volet **personnage animé**. Consigne les itérations `immersive` **4.17.0 → 4.18.0**
  (remplacement de l'avatar Ready Player Me) et la décision de traiter désormais
  l'asset comme un **contrat technique vérifié**, et non comme un réglage manuel.

## Contexte

L'avatar du template `immersive` était un modèle Ready Player Me distribué en
**CC BY-NC 4.0** (usage non commercial), incompatible avec l'exploitation du site.
Le remplacement a été tenté selon deux axes.

**1. MakeHuman / MPFB (CC0), génération procédurale.** Chaîne complète installée
et exécutée headless (Blender 4.5.14 + extension MPFB 2.0.18 + packs d'assets) :
création du personnage, rig Mixamo, export 52 blendshapes ARKit + 15 visèmes.
Techniquement conforme au contrat, mais **le basemesh MakeHuman est éclaté en
pièces non soudées** (lèvres, arcade dentaire, globes oculaires, cavité buccale) :
à l'export la cavité est supprimée ou les pièces se désolidarisent, produisant
une bouche ouverte et des yeux hors des paupières. Défaut **inhérent au modèle**,
non corrigeable sans travail de modélisation.

**2. Microsoft RocketBox (MIT), maillage existant.** Avatar complet et propre
(visage, cheveux, vêtements, 52 blendshapes ARKit + 15 visèmes fournies dans
`*_facial.fbx`). Le maillage a été **greffé** sur un squelette Mixamo emprunté à
l'ancien avatar, avec des **poids calculés automatiquement**, puis compressé
(3,1 Mo). Résultat : rendu correct au repos, mais

- les **poses** (`setPoseFromTemplate`) **ne modifient aucune géométrie** —
  mesuré : hauteur identique avant/après (0 → 1,739 m), `poseName` inchangé ;
- les transitions de pose appliquées à un rig étranger provoquent des
  interpolations absurdes (personnage qui « monte » ou s'assoit en tournoyant) ;
- le skinning automatique reste approximatif (épaules, jambes).

**3. Diagnostic transverse.** Deux causes ont été isolées et corrigées, sans
rapport avec l'asset :

- les faces du maillage pouvaient être orientées à l'envers (peau translucide,
  organes visibles) → recalcul des normales ;
- le template n'appelait `head.animate()` **que** lorsque `view === "discussion"` :
  hors discussion l'avatar était **figé** (aucune animation de squelette). Ce
  défaut a été identifié par mesure (hauteur/bbox avant-après) et non par
  intuition, après plusieurs itérations de réglages empiriques infructueux.

**Constat.** L'équipe est **fullstack**, sans compétence de rigging : enchaîner
des réglages visuels (position, pose, poids) sans contrat mesurable produit des
allers-retours coûteux et des régressions. Le marché fournit des personnages
**déjà riggés** (Avaturn, MetaPerson, Character Creator, marketplaces) ou des
services de rigging automatique ; le travail restant est un travail
d'**intégration**, pas d'artisanat 3D.

## Décision

1. **Un contrat d'asset explicite** est défini pour tout avatar du template. Un
   GLB n'est intégrable que s'il respecte **toutes** les règles bloquantes :

   | Règle | Critère | Niveau |
   | --- | --- | --- |
   | Poids du fichier | ≤ 3,2 Mo | bloquant |
   | Peau | exactement 1 `skin` | bloquant |
   | Squelette | noms Mixamo : `Hips`, `Spine`, `Spine1`, `Spine2`, `Neck`, `Head`, `Left/RightShoulder`, `Arm`, `ForeArm`, `Hand`, `UpLeg`, `Leg`, `Foot`, `ToeBase` (22 os) | bloquant |
   | Racine | nœud racine nommé `Armature` | bloquant |
   | Visage | 52 blendshapes ARKit nommées exactement (`eyeBlinkLeft`…`tongueOut`) | bloquant |
   | Hauteur | 1,55 – 1,85 m | bloquant |
   | Origine | pieds à y ≈ 0 (±0,05 m) | bloquant |
   | Matériaux | `metallicFactor` ≈ 0 (sinon rendu noir sans environment map) | bloquant |
   | Visèmes | 15 visèmes Oculus | facultatif (avatar muet) |
   | Transparence | `alphaMode` MASK préféré à BLEND | avertissement |

2. **Validation automatique et bloquante en CI.** `template-kit/bin/validate-avatar.mjs`
   lit le GLB (sans dépendance), vérifie chaque règle et **fait échouer le job
   `validate`** en cas de non-conformité. Aucun template ne peut être mergé avec
   un avatar hors contrat.

3. **Sourçage.** L'avatar est **consommé** auprès d'un fournisseur produisant un
   rig natif (Avaturn, MetaPerson, Character Creator, ou personnage « Mixamo-rigged »
   de marketplace sous licence commerciale). **Interdiction des greffes
   maillage → squelette étranger avec poids automatiques** : cette pratique est
   désormais considérée comme un prototype, jamais comme une livraison.

4. **Pas de réglage empirique sans mesure.** Toute correction de rendu d'avatar
   doit être étayée par une mesure (bbox, hauteur, positions d'os, matrice)
   consignée dans la conversation ou l'ADR, conformément à la démarche de
   bisection mono-variable d'ADR-0021.

## Complément (itération 4.19.x)

**TalkingHead redresse les membres.** Le moteur interpole en continu les os des
bras et des jambes vers une posture « droite » (`poseStraight`), et recolle
l'avatar au sol en modifiant `Hips.position` à chaque frame. Conséquences
mesurées :

- un avatar **cuit en pose assise** est redressé au runtime : la hauteur passe de
  1,36 m (bind) à 1,73 m dès les premières frames ;
- la correction de sol est **cumulative** (`-=`) : sur un squelette non standard
  elle produit une montée progressive.

Solution retenue pour le template : avatar **debout**, position abaissée de 0,45 m
(hanteur d'assise visuelle) et **`Hips.position` épinglée** à sa valeur de repos
après chaque frame. Comportement stable, sans dérive, vérifié par mesures
répétées (hanches 0,550 / tête 1,155 / pieds −0,374 constants).

## Conséquences

- **Positives** : critère d'acceptation objectif et automatisé ; plus de
  régressions silencieuses ; un fournisseur peut être évalué en 30 s ; l'équipe
  reste sur son cœur de métier (intégration) ; l'asset devient remplaçable sans
  toucher au template.
- **Négatives / limites** : le validateur ne juge pas la **qualité visuelle**
  (réalisme, proportions) ni la qualité du skinning ; il ne garantit pas que les
  poses « fonctionnent » — il garantit seulement que le rig est **natif et
  conforme**, ce qui est la condition nécessaire. Un contrôle visuel reste requis.
- **État transitoire** : le template est figé sur la version **4.16.2** (avatar
  RPM, CC BY-NC) en attendant un asset conforme sous licence commerciale. Le
  validateur passe sur cet avatar : il documente le contrat, sans valider la
  licence.
- **Suites** : documenter dans `CREDITS.md` la licence de l'asset retenu ; ajouter
  au validateur un contrôle de licence (métadonnée explicite) lors du prochain
  changement d'avatar.
