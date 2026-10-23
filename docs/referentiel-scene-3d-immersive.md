# Référentiel — scène 3D immersive sur le web

Référentiel de **métriques, conventions et seuils** pour juger objectivement si une
scène 3D web « fonctionne ». Chaque ligne donne : la **définition**, la **cible**,
la **mesure**, et **ce qui casse** quand la valeur est fausse.

> Principe : ce qui n'est pas mesuré finit par être « corrigé » à l'intuition, et
> l'intuition ne se transmet pas. Tout seuil ci-dessous est un **budget**, donc
> vérifiable en CI (voir §12).

---

## 1. Conventions d'espace (le socle)

Ces règles ne se voient pas, mais toutes les autres en dépendent.

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **Unité** | 1 unité glTF = 1 mètre | 1 u = 1 m | `POSITION` min/max d'un humain ≈ 0 → 1,75 | Personnage 100× trop grand (FBX en cm) ou minuscule (1,7 cm) → invisible ou traversant les murs |
| **Axe vertical** | glTF est Y-up, main droite | +Y en haut | inspection du GLB | Personnage couché, caméra sous le sol |
| **Origine (pivot)** | point (0,0,0) du modèle | **pieds à y = 0** | bbox du GLB | Personnage qui « flotte » ou s'enfonce ; repositionnement empirique à chaque scène |
| **Échelle racine** | `scale` du nœud racine | 1.0 (ou 0.01 assumé) | nœud `Armature` | Décalage de 100× entre squelette et maillage → skinning faux, membres étirés |
| **Pose de repos (bind/rest)** | posture dans laquelle le maillage est lié au squelette | A-pose, pieds au sol | comparison visuelle + bbox | Poses qui « partent en biais », vêtements qui percent la peau |
| **Orientation avant** | direction du regard au repos | +Z vers la caméra | os des yeux `LeftEye`/`RightEye` sur l'axe X | Personnage de profil, dos tourné |

**Règle d'or** : un asset qui respecte ces six points se place **sans réglage**. Si
tu dois ajuster une position « à la main », c'est qu'une convention est cassée.

---

## 2. Squelette, skinning et animation

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **Convention de rig** | nommage et hiérarchie des os | Mixamo (`Hips`, `Spine`, `LeftArm`…) | liste des `skin.joints` | Les poses/animations ne s'appliquent pas (mesuré : bbox inchangée après `setPoseFromTemplate`) |
| **Nombre d'os** | os déformants | 60–80 (humanoïde) | `skin.joints.length` | Trop peu → déformations anguleuses ; trop → coût CPU |
| **Influences par sommet** | os pondérant un vertex | **≤ 4** (standard GPU) | `JOINTS_0` (un seul jeu) | Au-delà de 4 → poids ignorés, cassures |
| **Normalisation des poids** | somme des poids par vertex | = 1.0 | `WEIGHTS_0` | Somme ≠ 1 → membres qui rétrécissent/étirent |
| **Poids automatiques** | skinning calculé par proximité | acceptable en prototype **seulement** | rendu aux extrémités | Morceaux détachés (cheveux, yeux), épaules écrasées |
| **Matrices de bind** | `inverseBindMatrices` | cohérentes avec la pose de repos | inspection du GLB | Personnage déformé dès le repos |
| **Blendshapes (morphs)** | cibles de déformation du visage | **52 ARKit**, nommées exactement | `mesh.extras.targetNames` | Expressions absentes ou muettes ; lèvres/yeux figés |
| **Morphs relatifs** | deltas et non positions absolues | deltas | spec glTF | Influence 0 qui déforme déjà le visage |
| **Coût des morphs** | `nb_morphs × nb_sommets × 12 octets` | ≤ ~1,5 Mo | calcul sur les accesseurs | Fichier de 15 Mo ; lenteur de chargement |
| **Visèmes** | 15 visèmes Oculus (facultatif) | si lip-sync prévu | noms `viseme_*` | Bouche inerte pendant la parole |

---

## 3. Budgets géométriques et textures

| Métrique | Définition | Cible desktop / mobile | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **Triangles (scène)** | faces rendues | < 300 k / < 100 k | `renderer.info.render.triangles` | Chute de FPS, chauffe, batterie |
| **Triangles (personnage)** | faces du héros | 8–25 k | comptage GLB | Visage anguleux ou personnage trop lourd |
| **Draw calls** | appels de rendu par frame | < 150 / < 60 | `renderer.info.render.calls` | CPU saturé, jank sur mobile |
| **Textures / matériau** | cartes par matériau | 2–4 | matériaux glTF | Mémoire GPU, compilation de shaders |
| **Taille texture** | résolution | 1024 (2048 pour le visage) | `images` du GLB | Flou ou poids inutile |
| **Format texture** | encodage | JPEG/WebP (sRGB), KTX2 si dispo | `mimeType` | PNG 4K = 10× le poids nécessaire |
| **Poids du GLB** | fichier complet | **≤ 3,2 Mo** (héros) | `stat` | LCP dégradé, attente devant un écran vide |
| **Instanciation** | objets répétés | `InstancedMesh` | inspection scène | 200 chaises = 200 draw calls |

---

## 4. Matériaux et rendu PBR

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **Metalness** | caractère métallique | **0** pour peau/tissu | `metallicFactor` | Objet **noir** sans environment map (défaut glTF = 1) |
| **Environment map (IBL)** | éclairage image-based | présent et chargé **avant** la 1re frame | `scene.environment` | Scène noire au premier rendu |
| **Espace colorimétrique** | sRGB en sortie, linéaire en entrée | `outputColorSpace = sRGB` | config renderer | Couleurs délavées ou trop sombres |
| **Tone mapping** | compression HDR | ACES Filmic | config renderer | Blancs brûlés, peau grise |
| **Orientation des normales** | faces vers l'extérieur | cohérentes | rendu face-culling | Peau **translucide**, organes visibles |
| **Backface culling** | faces arrière masquées | activé (sauf tissus/cheveux voulus) | `material.side` | Cheveux qui recouvrent le visage, vêtements transparents |
| **Alpha mode** | gestion de la transparence | `MASK` (cutoff 0.5) | `alphaMode` | Halos, tri incorrect, cheveux en « voile » |
| **Shadow map** | résolution des ombres | 1024–2048, 1 seule lumière | config | Ombres crénelées ou coût excessif |

---

## 5. Performance runtime

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **Frame time** | temps par frame | ≤ 16,7 ms (60 fps) / ≤ 33 ms (30 fps) | `performance.now()` par frame | Saccades, mal de tête |
| **Frame time p95** | 95 % des frames | ≤ 2× la cible | série de mesures | Micro-jank invisible en moyenne mais perceptible |
| **Long tasks** | tâche JS > 50 ms | 0 pendant l'interaction | PerformanceObserver | Gel des gestes |
| **Initialisation** | temps jusqu'à la 1re frame utile | ≤ 2,5 s | timestamps internes | Écran vide, utilisateur qui part |
| **Ordre d'init** | dépendances (HDRI, avatar, scène) | environnement **avant** rendu | test automatisé | Scène noire (bug déjà rencontré en 4.14.4) |
| **Render on demand** | rendu seulement si changement | activé hors animation | compteur de frames | Batterie vidée sur mobile |
| **Qualité adaptative** | paliers low/high | détection GPU/mobile | `matchMedia`, `devicePixelRatio` | Mobile en difficulté, desktop bridé |

---

## 6. Web Vitals (page hôte)

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **LCP** | Largest Contentful Paint | < 2,5 s | Lighthouse / WebPageTest | Perception de lenteur |
| **INP** | Interaction to Next Paint | < 200 ms | Lighthouse (lab) / RUM | Clics « collants » |
| **CLS** | Cumulative Layout Shift | < 0,1 | Lighthouse | Saut de mise en page à l'arrivée du canvas |
| **Poids initial** | JS + assets critiques | < 1,5 Mo hors 3D | réseau | Abandon mobile |

---

## 7. Caméra et composition

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **FOV** | champ de vision vertical | 35–50° | `camera.fov` | Perspective écrasée (< 25°) ou fisheye (> 70°) |
| **Ratio near/far** | profondeur de clipping | far / near < 10⁴ | `camera.near/far` | Z-fighting (clignotement des surfaces) |
| **Hauteur caméra** | point de vue | 1,4–1,7 m (humain) | position | Effet « maquette » ou contre-plongée anxiogène |
| **Cadrage personnage** | qui occupe l'image | tête dans le tiers supérieur | capture | Personnage coupé, vide autour |

---

## 8. Interaction et accessibilité

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **Latence d'entrée** | geste → réaction visuelle | < 100 ms | mesure manuelle/Perf | Sensation de lag |
| **Cible tactile** | taille minimale | ≥ 44 × 44 px | inspection CSS | Boutons impossibles à toucher |
| **`touch-action`** | gestion du scroll/geste | `none` sur le canvas interactif | CSS | Le navigateur vole le geste |
| **`prefers-reduced-motion`** | respect des préférences | animations réduites | media query | Inconfort, accessibilité |
| **Contraste texte** | lisibilité | ≥ 4,5:1 | audit | Texte illisible sur fond 3D |

---

## 9. Qualité perçue (subjectif, mais mesurable par comparaison)

| Métrique | Définition | Cible | Mesure | Ce qui casse sinon |
| --- | --- | --- | --- | --- |
| **Proportions** | hauteur de tête dans la silhouette | 7–8 têtes (adulte) | rapport bbox tête/corps | Personnage « cartoon » ou difforme |
| **Continuité de surface** | pas de trous/pièces flottantes | 0 élément détaché | capture sous 4 angles | Effet « film d'horreur » |
| **Densité de texture** | détail par unité de surface | cohérente entre peau/tissu | comparaison A/B | Peau lisse + tissu net = incohérence |
| **Réalisme comparé** | écart avec une référence | jugé en A/B côte à côte | viewer dédié | Décision à l'aveugle |
| **Naturalité du mouvement** | fluidité, absence de à-coups | pas d'interpolation aberrante | captures pendant transition | Personnage qui « tournoie » ou « monte » |

---

## 10. Défaillances typiques (catalogue vécu)

| Symptôme | Cause racine | Métrique à vérifier |
| --- | --- | --- |
| Personnage **sur la table / flottant** | pivot ≠ pieds, ou repositionnement manuel | §1 origine, §1 unité |
| Personnage **invisible** | échelle 100× trop petite | §1 unité, §1 échelle racine |
| Peau **translucide**, organes visibles | normales inversées ou culling | §4 orientation, §4 culling |
| Personnage **de profil** | axe avant du rig ≠ convention | §1 orientation avant |
| **Poses sans effet** | rig non natif / os non conformes | §2 convention de rig |
| **Morceaux détachés** | poids automatiques incomplets | §2 poids |
| **Scène noire** au chargement | HDRI absent à la 1re frame | §4 IBL, §5 ordre d'init |
| Objet **noir** | metalness = 1 sans envmap | §4 metalness |
| **Cheveux en voile** sur le visage | alpha BLEND + double face | §4 alpha, §4 culling |
| **Bouche ouverte** permanente | cavité supprimée / lèvres non soudées | §2 morphs, §9 continuité |
| Fichier **15 Mo** | morphs dupliqués sur tout le maillage | §2 coût des morphs, §3 poids GLB |
| **Saccades** au scroll | backdrop-filter sur canvas animé | §5 frame time |

---

## 11. Vocabulaire minimal

- **Rig / squelette** : ensemble d'os hiérarchisés qui déforment un maillage.
- **Skinning (poids)** : influence de chaque os sur chaque sommet.
- **Bind / rest pose** : posture de référence dans laquelle le maillage est attaché.
- **Blendshape / morph target** : copie déformée du maillage, interpolée par un poids.
- **Retargeting** : transfert d'une animation d'un squelette à un autre.
- **Draw call** : un appel de rendu ; c'est le nerf de la performance CPU.
- **PBR** : rendu physiquement plausible (métal/rugosité), dépendant de l'environnement.
- **IBL / environment map** : image d'éclairage global (HDRI).
- **Alpha MASK / BLEND** : transparence binaire (cutoff) / mélangée (tri coûteux).
- **LOD** : niveaux de détail selon la distance.
- **Budget** : enveloppe chiffrée (triangles, Mo, ms) qu'un asset ne doit pas dépasser.

---

## 12. Application : « budgets as code »

| Garde-fou | Fichier | Effet |
| --- | --- | --- |
| Contrat d'avatar | `template-kit/bin/validate-avatar.mjs` | Bloque la CI si un asset ne respecte pas §1/§2/§3/§4 |
| Tailles réelles des props | `template-kit/bin/validate-scene-assets.mjs` + `scene-assets.json` | Bloque la CI si un bureau/chaise n'a pas sa taille réelle attendue (scale de scène inclus) |
| ADR associée | `docs/adr/0022-contrat-asset-avatar-3d.md` | Décision et justification |
| Viewer de validation | `visus3d.madatalk.fr` | Comparaison A/B, contrat, morphs, poses |
| Rendu mesuré | harnais + Playwright | Captures reproductibles, contrôle de non-régression |
| Smoke test de rendu | `template-kit/bin/test-render.mjs` | Post-déploiement : scène non noire, IBL présente, avatar visible et orienté, draw calls / triangles, frame time (hors rendu logiciel) |

**Règle** : toute nouvelle métrique qui compte devient un test. Une métrique qui
reste dans un document finit par être ignorée.
