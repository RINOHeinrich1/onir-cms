# 0105. Mode d’édition rapide des templates visuels — curseur d’inspection et variables contextuelles

- **Statut** : Proposé
- **Date** : 2026-11-23
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0024, ADR-0040, ADR-0095, ADR-0104.
- **Complète** : ADR-0023 (paramètres de template) et ADR-0095 (paramètres structurés).
- **Remplace** : aucune.

## Contexte

Les utilisateurs du studio d’affichage doivent aujourd’hui retrouver un texte ou
une image dans la liste des paramètres du template, puis comprendre à quel
élément visuel ce paramètre correspond. Cette navigation est jugée difficile,
en particulier sur les templates éditoriaux riches.

Le besoin cible est un mode d’édition rapide directement sur le template
central. La présente décision décrit d’abord une **V1 volontairement limitée** :

- un **curseur d’inspection** façon DevTools ;
- un survol qui met en évidence une zone personnalisable ;
- un clic qui sélectionne cette zone ;
- un panneau de droite filtré sur les variables rattachées à cette zone ;
- un retour à la liste complète des variables dès que le curseur est désactivé.

La V1 **ne modifie pas directement le template** : les valeurs continuent d’être
modifiées via les champs existants de l’inspecteur. L’édition directe des
textes, images et sections est explicitement différée en V2.

### Structure actuelle

Une version de template est **immuable** (ADR-0019, ADR-0024). Elle déclare :

- un manifeste `onirtech.template.json` ;
- un schéma récursif de paramètres (`string`, `text`, `image`, `boolean`, etc.) ;
- éventuellement des contrats de données.

Le lien de chat stocke les valeurs personnalisées dans
`visual_template_params` (ADR-0023, ADR-0095). Le studio les modifie déjà via
`PATCH /api/links/[id]`.

L’aperçu du studio est rendu dans une iframe, avec une session d’aperçu courte
(ADR-0104). `TemplateHost` sait rendre :

- un template **Web Component** (shadow DOM `open`, `closed` ou `none`) ;
- un template **iframe sandboxé** (`allow-scripts allow-forms`).

### Limite actuelle

Le contrat transmet le contexte du host vers le template, mais il n’existe
aucun lien entre :

- une zone DOM du template ;
- un chemin de paramètre (`hero.headline`, `hero.image`, `appearance.color_ink`).

Le cœur ne peut donc pas savoir quelles variables afficher quand l’utilisateur
clique sur le header, le hero ou le footer. Une détection heuristique par nom de
paramètre ou par valeur serait ambiguë et fragile.

### Cas concret et pilote retenu

Le pilote V1 est **Starter 1.6.16**, dont la source est disponible dans
`template-kit/template` :

- transport Web Component, shadow DOM `open` ;
- header, zone de bienvenue, conversation et composeur identifiables ;
- paramètres de texte et de couleur déjà déclarés ;
- couleurs partagées entre plusieurs zones (`primary_color`, `text_color`,
  `surface_color`, etc.).

Starter ne contient pas de sections marketing masquables comme Natural World.
Il permet donc de valider le curseur, le filtrage par zone et les paramètres
partagés. Les sections masquées et les zones éditoriales seront validées avec
Natural World dans un second temps.

Natural World 1.0.3 reste le template cible pour la suite : il possède
`hero.headline`, `hero.image`, `sections.show_impact`, etc., mais ne contient
aucun marqueur de zone.

## Décision

### 1. Périmètre de la V1

La V1 livre uniquement l’inspection contextuelle :

- activer/désactiver le curseur depuis la barre d’outils de l’aperçu ;
- survoler une zone : outline de survol ;
- cliquer sur une zone : zone sélectionnée, outline persistant ;
- filtrer le panneau de droite sur les paramètres rattachés à cette zone ;
- regrouper les paramètres par catégories (Contenu, Apparence, Actions) ;
- distinguer les paramètres locaux et partagés ;
- désactiver le curseur : la sélection est effacée et **tous les paramètres
  redeviennent visibles** ;
- modifier les valeurs via les contrôles existants, puis enregistrer comme
  aujourd’hui.

La V1 ne fait **pas** :

- de `contenteditable` sur les textes du template ;
- de mutation directe du DOM du template ;
- de sélection d’image depuis le template ;
- de masquage direct d’une section depuis le template ;
- de mise à jour live de l’aperçu à chaque frappe.

### 2. Un contrat d’édition déclaratif, optionnel

Le manifeste accepte un bloc `editor` optionnel. Les versions existantes restent
valides et n’ont simplement pas accès au curseur.

```json
{
  "editor": {
    "version": 1,
    "regions": [
      {
        "id": "header",
        "label": "En-tête",
        "parent": "page"
      },
      {
        "id": "hero",
        "label": "Couverture",
        "parent": "page",
        "visibilityParam": "sections.show_hero"
      }
    ],
    "bindings": [
      {
        "param": "header.brand_name",
        "regions": ["header"],
        "category": "content"
      },
      {
        "param": "header.cta_label",
        "regions": ["header"],
        "category": "action"
      },
      {
        "param": "appearance.color_ink",
        "regions": ["header", "hero", "footer"],
        "category": "appearance"
      }
    ]
  }
}
```

Le manifeste devient la source de vérité pour :

- les zones sélectionnables et leur hiérarchie ;
- les paramètres rattachés à une ou plusieurs zones ;
- les catégories d’affichage.

Un paramètre est **local** s’il est rattaché à une seule zone, et **partagé**
s’il est rattaché à plusieurs zones. Aucun champ `scope` n’est nécessaire en
V1 : le statut est déduit de `bindings[].regions.length > 1`.

Le manifeste ne contient **ni sélecteur CSS arbitraire, ni HTML, ni JavaScript**.

### 3. Des marqueurs DOM stables

En V1, le template doit exposer au minimum les zones cliquables :

```html
<header data-onir-region="header">
  <span data-onir-param="header.brand_name">WILDLIFE WATCH</span>
  <button data-onir-param="header.cta_label">Participer</button>
</header>
```

Règles de sélection :

- clic sur `data-onir-region` : sélectionne la zone ;
- clic sur un `data-onir-param` : sélectionne la zone parente et peut mettre en
  évidence le champ correspondant ;
- clic sur un enfant sans marqueur : remonte à la région la plus proche ;
- clic hors zone : aucune sélection.

`data-onir-param` est optionnel en V1 pour le filtrage par zone, mais devient
obligatoire en V2 pour l’édition directe champ par champ.

### 4. Un mode inspection dans le contexte

Le contexte du template reçoit un bloc additif :

```ts
editor?: {
  active: boolean;
}
```

En V1, ce bloc sert à :

- désactiver les actions du template pendant l’inspection ;
- empêcher qu’un clic sur un CTA lance une conversation ;
- laisser le host gérer le survol et la sélection.

Il ne sert pas encore à modifier le rendu pour l’édition directe.

### 5. Le host porte la sélection

`TemplateHost` est le seul composant à parler au DOM du template.

- **Web Component shadow DOM `open`** : accès au `shadowRoot`, recherche des
  zones, overlay de survol et de sélection.
- **Web Component shadow DOM `closed`** : curseur désactivé, sauf API dédiée
  implémentée par le template.
- **Iframe sandboxée** : le host ne peut pas accéder au DOM. Le pont de
  sélection est ajouté dans `iframe-frame.ts`, qui tourne dans l’iframe
  contrôlée par la plateforme.

Protocole V1 :

```text
Template / frame ──▶ aperçu ──▶ studio
  editor:hover     { regionId }
  editor:select    { regionId, param? }

studio ──▶ aperçu
  editor:highlight { regionId | null }
```

Aucun message `edit:text`, `edit:image` ou `edit:region` n’est nécessaire en V1.

### 6. Inspecteur de droite contextuel

Le panneau de droite conserve son fonctionnement actuel, avec un mode filtre :

- **curseur désactivé** : tous les paramètres, comme aujourd’hui ;
- **curseur activé, aucune sélection** : tous les paramètres, avec une aide
  « Cliquez une zone du template » ;
- **zone sélectionnée** : uniquement les paramètres rattachés à cette zone.

Présentation recommandée :

```text
En-tête
Page / Header

Contenu
  Nom de la marque       [WILDLIFE WATCH]
  Signature              [Ensemble pour le vivant]
  Libellé du bouton      [Participer]

Apparence
  Couleur du texte       [#31482b]
  Couleur de fond        [#f1f0df]

Partagé
  Couleur principale     [#31482b]  Partagé · 3 zones
```

Fonctions UX :

- breadcrumb de la zone ;
- bouton « Tous les paramètres » pour quitter le filtre ;
- badge **Partagé** et nombre de zones concernées ;
- recherche conservée ;
- bouton reset par paramètre ;
- touche `Échap` pour désactiver le curseur et restaurer la liste complète.

### 7. Paramètres locaux et partagés

Une couleur comme `primary_color` n’est pas réellement « dans le header » : elle
est **partagée** et affecte le header, la conversation et le composeur.

- un paramètre présent dans une seule zone est **local** ;
- un paramètre présent dans plusieurs zones est **partagé** ;
- un paramètre partagé est affiché une seule fois, dans une section **Partagé**,
  avec un badge du type `Partagé · 3 zones` ;
- les paramètres locaux restent dans la zone.

La règle est donc simplement :

```text
regions.length === 1  → local
regions.length  > 1  → partagé
```

Pas de champ `scope` à maintenir dans le manifeste pour la V1.

### 8. Sections masquées

Le curseur ne peut pas cliquer une section qui n’est pas rendue. En V1 :

- une liste « Zones masquées » est ajoutée dans l’inspecteur ;
- sélectionner une zone masquée affiche ses variables, dont le booléen de
  visibilité ;
- la réactivation se fait via le contrôle booléen existant.

Aucun rendu « ghost » n’est requis en V1.

### 9. Valeurs, sauvegarde et sections

Le curseur ne modifie jamais le template ni sa version. Il ne fait que filtrer
l’inspecteur.

- Les modifications restent dans le brouillon du studio.
- Le bouton **Enregistrer** existant persiste via `PATCH /api/links/[id]`.
- La validation serveur existante reste la seule source de vérité.
- Aucune nouvelle table n’est nécessaire.
- « Retirer une section » reste, en V1, l’action de mettre son booléen de
  visibilité à `false` via le contrôle existant.

### 10. Édition directe — V2

L’édition directe est hors périmètre V1. Elle pourra ajouter :

- `data-onir-param` sur chaque texte et image ;
- édition locale des textes avec commit au blur ;
- sélection d’image depuis le template ;
- masquage direct d’une section ;
- `ctx.editor.hiddenRegions` et rendu ghost ;
- édition des collections ;
- mise à jour live de l’aperçu sans rechargement complet.

Ces éléments ne doivent pas être nécessaires pour livrer le curseur
d’inspection.

### 11. Validation et sécurité

- Le manifeste `editor` est validé à l’import : zones uniques, chemins
  existants, catégories connues, paramètres de visibilité booléens.
- Un binding ne peut référencer qu’un paramètre déclaré dans le schéma.
- Une zone ne peut être sélectionnée que si elle est déclarée.
- Le host n’accepte que des `regionId` et paramètres connus.
- Le mode inspection nécessite la permission `links:update`.
- L’iframe conserve son sandbox ; aucun passage à `allow-same-origin`.
- Aucun HTML arbitraire n’est manipulé en V1 puisque le template n’est pas
  modifié directement.

### 12. Compatibilité et versionnement

- `editor` est **additif** au contrat `onirtech.template-host.v1`.
- Les templates sans bloc `editor` restent valides et utilisent l’inspecteur
  classique.
- Natural World 1.0.3 étant immuable, le curseur nécessite une nouvelle version
  instrumentée, par exemple **1.1.0**.
- Le lien reste sur 1.0.3 tant que la nouvelle version n’est pas sélectionnée.
- Les paramètres existants sont conservés lors du changement de version.

## Alternatives écartées

### Filtrer les paramètres avec une heuristique sur leur nom

`header.*` fonctionnerait pour quelques cas, mais échouerait sur les couleurs
partagées, les collections et les libellés non préfixés. Refusée.

### Détection automatique des zones dans le DOM

Correspondance par texte, position ou structure : ambiguë et cassante. Refusée.

### Éditeur HTML libre superposé au template

Créerait un contenu parallèle non relié aux paramètres et non reproductible dans
le rendu public. Refusée.

### Mutation directe du DOM dès la V1

Complexité inutile pour le besoin exprimé. Refusée pour la V1.

### Modifier la version de template existante

Contraire à l’immuabilité des versions (ADR-0019, ADR-0024). Refusée.

### Autoriser `allow-same-origin` sur les iframes

Permettrait au host d’accéder au DOM, mais affaiblit fortement l’isolation des
templates community. Refusée.

### Ajouter une table d’édition dédiée

Inutile : `visual_template_params` porte déjà les valeurs et la sélection est un
état d’interface non persistant.

## Conséquences

### Positives

- résout le problème principal : retrouver les variables d’une zone ;
- aucun changement du modèle de persistance ;
- aucune migration de base ;
- aucun risque de mutation DOM ou de perte de focus ;
- compatible avec les templates existants ;
- prépare proprement la V2 sans la bloquer.

### Négatives

- les templates doivent déclarer leurs zones et rattachements ;
- les templates tiers non instrumentés n’auront pas le curseur ;
- le shadow DOM `closed` et les iframes imposent des restrictions ;
- il faut gérer les paramètres partagés et les zones masquées ;
- une nouvelle version de Natural World est nécessaire.

## Migration et mise en œuvre

### Phase 1 — V1 : curseur d’inspection

1. Ajouter le type et la validation du bloc `editor` (`regions`, `bindings`).
2. Instrumenter **Starter 1.6.16** avec `data-onir-region` et publier une
   version 1.7.0.
3. Ajouter le pont de sélection Web Component dans `TemplateHost`.
4. Ajouter le pont de sélection iframe dans `iframe-frame.ts` — **inclus en V1**.
5. Ajouter l’état `selectedRegion` dans le studio.
6. Filtrer l’inspecteur de droite par zone et restaurer tous les paramètres à
   la désactivation.
7. Afficher les paramètres partagés.
8. Mettre à jour la skill `onirtech-template-sdk` avec le contrat `editor` et
   les marqueurs de zone.
9. Tester sur la préproduction puis instrumenter Natural World pour les zones
   éditoriales et les sections masquées.

### Phase 2 — V2 : édition directe

9. Ajouter `data-onir-param` sur les textes et images.
10. Ajouter le protocole `edit:text`, `edit:image` et `edit:region`.
11. Ajouter l’édition locale des textes et le sélecteur d’image.
12. Ajouter `ctx.editor.hiddenRegions` et le rendu ghost.
13. Ajouter l’édition des collections.
14. Ajouter la mise à jour live de l’aperçu et l’annulation par champ.

## Vérifications attendues

- un template sans `editor` reste importable et fonctionnel ;
- un template avec `editor` invalide est refusé à l’import ;
- activation du curseur : survol et sélection visibles ;
- clic sur le header : seuls les paramètres du header sont affichés ;
- les paramètres partagés sont identifiés comme tels ;
- désactivation du curseur : tous les paramètres sont de nouveau affichés ;
- `Échap` désactive le curseur et efface la sélection ;
- un clic d’inspection ne déclenche aucune action de chat ;
- une zone masquée est accessible depuis la liste des zones masquées ;
- une zone inconnue ou un paramètre non déclaré est ignoré ;
- Web Component `open` et iframe instrumentée fonctionnent ;
- Starter 1.7.0 permet de filtrer header, bienvenue, conversation et composeur ;
- shadow DOM `closed` et template non instrumenté : curseur désactivé ;
- aucune modification de template, de version ou de base de données ;
- sauvegarde et rendu public inchangés.

## Recommandation

La V1 doit être livrée avant toute édition directe. Elle apporte déjà le gain
principal — retrouver immédiatement les variables d’une zone — avec un risque
faible et sans toucher au mécanisme de persistance.

Starter est le bon pilote : sa source est dans le dépôt, il est le template par
défaut et il contient des paramètres partagés. Natural World viendra ensuite
pour valider les zones éditoriales et les sections masquées.

Le curseur d’inspection n’est pas un simple filtre visuel : c’est un **modèle
déclaratif de zones et de rattachements**, réutilisable ensuite pour l’édition
directe.
