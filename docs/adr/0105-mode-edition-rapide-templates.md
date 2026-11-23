# 0105. Mode d’édition rapide des templates visuels — édition directe des textes, images et sections

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

Le besoin exprimé est un **mode d’édition rapide directement sur le template
central** permettant de :

- modifier un texte à l’endroit où il est affiché ;
- remplacer une image directement sur son emplacement ;
- masquer ou réafficher une section du template.

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

- un nœud DOM du template ;
- un chemin de paramètre (`hero.headline`, `hero.image`, `sections.show_impact`).

Le cœur ne peut donc pas savoir quel texte affiché correspond à quel paramètre.
Une détection heuristique par valeur ou par texte serait ambiguë et fragile.

### Cas concret

Le lien `912bffda-2445-4a76-bfc6-957984edfca4` utilise **Natural World 1.0.3** :

- transport Web Component, shadow DOM `open` ;
- 14 paramètres ;
- textes déjà paramétrés (`hero.headline`, `footer.headline`, etc.) ;
- images déjà paramétrées (`hero.image`, `visuals.impact_photo`, etc.) ;
- sections déjà prévues (`sections.show_impact`, `sections.show_gallery`,
  `sections.show_benefits`, `sections.show_testimonials`).

Cependant, le DOM du template ne contient aucun marqueur
`data-onir-param` ou `data-onir-region`. Le mode rapide est donc **faisable sur
le modèle de données**, mais nécessite une instrumentation explicite du
template.

## Décision

### 1. Un contrat d’édition déclaratif, optionnel

Le manifeste accepte un bloc `editor` optionnel. Les versions existantes restent
valides et n’ont simplement pas accès au mode rapide.

```json
{
  "editor": {
    "version": 1,
    "regions": [
      {
        "id": "hero",
        "label": "Couverture",
        "visibilityParam": "sections.show_hero"
      },
      {
        "id": "impact",
        "label": "Impact",
        "visibilityParam": "sections.show_impact"
      }
    ]
  }
}
```

Le manifeste ne contient **ni sélecteur CSS arbitraire, ni HTML, ni JavaScript**.
Il déclare uniquement les régions éditables et, lorsqu’elles existent, leur
paramètre de visibilité.

### 2. Des marqueurs DOM stables

Le template expose les cibles avec des attributs dédiés :

```html
<section data-onir-region="hero">
  <h1 data-onir-param="hero.headline">Protéger la nature…</h1>
  <img data-onir-param="hero.image" alt="" />
</section>
```

Pour les collections :

```html
<article data-onir-collection="benefits" data-onir-item="0">
  <h3 data-onir-param="benefits.0.title">Préserver les habitats</h3>
  <p data-onir-param="benefits.0.description">…</p>
</article>
```

Le host :

- recherche les cibles `data-onir-param` et `data-onir-region` ;
- valide chaque chemin contre le schéma `params` de la version ;
- déduit le contrôle depuis le type du paramètre ;
- ignore tout chemin ou toute région non déclarés.

Aucune correspondance n’est déduite du texte affiché.

### 3. Un mode édition dans le contexte

Le contexte du template reçoit un bloc additif :

```ts
editor?: {
  active: boolean;
  hiddenRegions: string[];
}
```

Usages :

- désactiver les actions du template pendant l’édition ;
- empêcher un clic sur un CTA de lancer une conversation ;
- permettre au template de rendre les sections masquées en mode « ghost » afin
  de pouvoir les réafficher.

Sans ce mode, une section masquée n’est plus rendue et devient impossible à
réafficher depuis le template. Une liste « Sections masquées » dans l’inspecteur
reste un repli acceptable pour les templates qui ne gèrent pas encore
`ctx.editor`.

### 4. Le host porte le pont d’édition

`TemplateHost` est le seul composant à parler au DOM du template.

- **Web Component shadow DOM `open`** : accès au `shadowRoot`, recherche des
  marqueurs, ajout des contrôles d’édition.
- **Web Component shadow DOM `closed`** : mode rapide désactivé, sauf contrat
  d’édition dédié implémenté par le template.
- **Iframe sandboxée** : le host ne peut pas accéder au DOM. Le pont d’édition
  est ajouté dans `iframe-frame.ts`, qui tourne dans l’iframe contrôlée par la
  plateforme.

Protocole logique :

```text
Template / frame ──▶ aperçu ──▶ studio
  edit:text        { path, value }
  edit:image       { path }
  edit:region      { regionId, hidden }

studio ──▶ aperçu
  params:update    { params }
```

Le host valide systématiquement le chemin, le type, la valeur et la région
avant de transmettre au studio.

### 5. Les valeurs restent dans `visual_template_params`

Le mode rapide ne modifie jamais le template ni sa version. Il modifie la
personnalisation du lien.

- Les changements sont conservés dans le brouillon du studio.
- Le bouton **Enregistrer** existant persiste via `PATCH /api/links/[id]`.
- La validation serveur existante reste la seule source de vérité.
- Aucune nouvelle table n’est nécessaire pour le MVP.

Une évolution future pourra ajouter un historique d’édition ou des brouillons
multi-utilisateurs, mais ce n’est pas requis pour le mode rapide.

### 6. Masquer une section, pas la supprimer

« Retirer une section » signifie **masquer** la section via un paramètre
booléen déclaré :

```text
sections.show_impact = false
```

La section reste dans le template, son contenu est conservé et l’action est
réversible.

Une section sans paramètre de visibilité déclaré ne doit pas être supprimable
en mode rapide.

### 7. Édition des textes et des images

- **Texte** : édition locale sur la cible, commit au blur ou après un délai
  court ; aucun rechargement complet de l’aperçu à chaque frappe.
- **Image** : clic sur l’image, sélection d’un asset via le flux existant
  `/api/template-param-assets`, puis mise à jour du paramètre.
- **Collections** : chemins indexés (`benefits.0.title`) dans un premier temps ;
  une UX dédiée d’ajout/suppression/réorganisation d’éléments pourra suivre.

Les contenus dynamiques du chat, des fiches et des médias runtime ne sont pas
éditables.

### 8. Validation et sécurité

- Le manifeste `editor` est validé à l’import : chemins existants, types
  compatibles, régions uniques, paramètres de visibilité booléens.
- Le host n’accepte que des chemins déclarés dans le schéma de la version.
- Aucun HTML arbitraire n’est injecté : le texte est appliqué avec
  `textContent`.
- Les images passent par les URL et assets contrôlés par la plateforme.
- Le mode rapide nécessite la permission `links:update`.
- Les messages du template sont validés ; aucun message ne peut écrire un
  paramètre non déclaré.
- L’iframe conserve son sandbox ; aucun passage à `allow-same-origin` n’est
  nécessaire.

### 9. Compatibilité et versionnement

- `editor` est **additif** au contrat `onirtech.template-host.v1`.
- Les templates sans bloc `editor` restent valides et utilisent l’inspecteur
  classique.
- Natural World 1.0.3 étant immuable, le mode rapide nécessite une nouvelle
  version instrumentée, par exemple **1.1.0**.
- Le lien reste sur 1.0.3 tant que la nouvelle version n’est pas sélectionnée.
- Les paramètres existants sont conservés lors du changement de version.

## Alternatives écartées

### Détection automatique des textes et images dans le DOM

Correspondance par valeur, texte ou position : ambiguë, cassante dès qu’un
texte est répété ou traduit. Refusée.

### Éditeur HTML libre superposé au template

Permettrait de modifier n’importe quoi, mais créerait un contenu parallèle non
relié aux paramètres et non reproductible dans le rendu public. Refusée.

### Mutation directe du DOM sans mise à jour des paramètres

Perte des modifications au prochain rendu du template, absence de persistance et
impossibilité de publier. Refusée.

### Modifier la version de template existante

Contraire à l’immuabilité des versions (ADR-0019, ADR-0024). Refusée.

### Autoriser `allow-same-origin` sur les iframes

Permettrait au host d’accéder au DOM, mais affaiblit fortement l’isolation des
templates community. Refusée.

### Ajouter une table d’édition dédiée dès le MVP

Inutile : `visual_template_params` porte déjà les valeurs. Une table dédiée
n’apporterait rien tant qu’il n’y a pas d’historique ou de collaboration.

## Conséquences

### Positives

- édition directe guidée par le template, sans recherche dans les paramètres ;
- conservations des versionnements et des validations existants ;
- possibilité de masquer/réafficher les sections sans perte de contenu ;
- aucune migration de base pour le MVP ;
- compatibilité avec les templates existants ;
- architecture identique pour Web Component et iframe.

### Négatives

- les templates doivent être instrumentés et republiés ;
- les templates tiers non instrumentés n’auront pas le mode rapide ;
- le shadow DOM `closed` et les iframes imposent des restrictions ;
- il faut concevoir une UX de réactivation des sections masquées ;
- il faut éviter le rechargement de l’aperçu à chaque frappe ;
- les collections demandent une convention de chemins indexés et une UX dédiée.

## Migration et mise en œuvre

### Phase 1 — Pilote Natural World

1. Ajouter le type et la validation du bloc `editor`.
2. Ajouter les marqueurs `data-onir-param` et `data-onir-region` dans Natural
   World et publier une version 1.1.0.
3. Ajouter le pont d’édition Web Component dans `TemplateHost`.
4. Ajouter le toggle « Édition rapide » dans le studio.
5. Gérer texte, image et masquage de section.
6. Persister via `visual_template_params` et `PATCH /api/links/[id]`.
7. Tester sur le lien de préproduction.

### Phase 2 — Généralisation

8. Ajouter le pont d’édition iframe.
9. Ajouter `ctx.editor` avec sections masquées visibles en ghost.
10. Ajouter l’édition des collections.
11. Ajouter annulation/réinitialisation par champ.
12. Documenter le contrat `editor` dans la norme des templates.

## Vérifications attendues

- un template sans `editor` reste importable et fonctionnel ;
- un template avec `editor` invalide est refusé à l’import ;
- le mode rapide ne s’active que sur les cibles déclarées ;
- le texte modifié est bien persisté dans le lien après sauvegarde ;
- l’image sélectionnée est bien rendue après sauvegarde ;
- une section masquée est retirée du rendu public ;
- une section masquée peut être réaffichée ;
- aucun clic d’édition ne déclenche une action de chat ;
- un chemin inconnu ou une valeur invalide est rejeté ;
- le rendu public reste identique après rechargement ;
- le shadow DOM `closed` et les iframes non instrumentées n’exposent pas
  d’édition directe ;
- les tests E2E couvrent texte, image et section sur la préproduction.

## Recommandation

Le mode rapide doit être un **éditeur guidé par le contrat du template**, pas un
éditeur DOM générique. La première livraison doit cibler Natural World, seul
template permettant de valider le modèle sans affaiblir la sécurité ni
l’isolation des templates tiers.
