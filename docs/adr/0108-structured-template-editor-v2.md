# 0108. Structured Template Editor V2 — séparer les données du modèle d’édition

- **Statut** : Accepté
- **Date** : 2026-11-24
- **Référence** : ADR-0023, ADR-0040, ADR-0095, ADR-0105, ADR-0106, ADR-0107.
- **Complète** : ADR-0105 (zones d’inspection).
- **Remplace** : aucune.

## Contexte

Les templates complexes comme **Puzzle / A2DM Formation** exposent un modèle de
données normalisé et relationnel :

- `pages`
- `regions`
- `blocks`
- `placements`
- `actions`
- `style_profiles`
- `articles`

Ce modèle est adapté au **moteur de rendu**, mais pas à l’**édition humaine**.

Le contrat d’édition actuel (`editor.version: 1`) repose sur :

- des régions statiques ;
- des bindings entre un paramètre et une ou plusieurs régions ;
- un inspecteur qui interprète récursivement le schéma des paramètres.

Il ne permet pas de :

- cibler un élément individuel d’une collection ;
- distinguer un bloc d’un placement ;
- afficher un arbre page → région → bloc ;
- masquer les champs non applicables selon le `kind` ;
- remplacer un `style_id` par un sélecteur de profil de style ;
- gérer les composants partagés autrement que par le nombre de régions ;
- effectuer des mutations structurelles atomiques.

La limite n’est donc pas propre à Puzzle. Elle est générique : **le SDK permet de
construire des interfaces plus complexes que ce que l’éditeur générique sait
interpréter**.

## Décision

### 1. Séparer Data Schema et Editor Schema

Le schéma des paramètres reste la source de vérité des **données** :

- structure ;
- types ;
- valeurs par défaut ;
- validation ;
- stockage.

Un **Editor Schema** déclaratif devient la source de vérité de la **présentation
d’édition** :

- collections ;
- libellés ;
- groupes ;
- visibilité conditionnelle ;
- relations ;
- navigation ;
- structure.

L’Editor Schema ne contient **aucune valeur métier**. Il décrit uniquement
comment les données existantes doivent être présentées et manipulées.

### 2. Ajouter un Editor Contract V2 additif

Le bloc `editor` accepte une version 2. La version 1 reste valide et conserve
exactement son comportement actuel.

```json
{
  "editor": {
    "version": 2
  }
}
```

Aucun template existant n’est migré automatiquement.  
Aucune donnée existante n’est déplacée ou remplacée.

### 3. Métadonnées de collection

Une collection peut déclarer :

```json
{
  "collections": [
    {
      "param": "blocks",
      "label": "Composants",
      "itemKey": "id",
      "itemLabel": "name",
      "itemKind": "kind",
      "labelFallback": ["title", "kind", "id"]
    },
    {
      "param": "pages",
      "label": "Pages",
      "itemKey": "id",
      "itemLabel": "title",
      "labelFallback": ["slug", "id"]
    },
    {
      "param": "style_profiles",
      "label": "Profils de style",
      "itemKey": "id",
      "itemLabel": "name",
      "labelFallback": ["id"]
    }
  ]
}
```

Règles :

- `itemKey` doit être un champ stable de l’élément ;
- l’index du tableau ne doit jamais être utilisé comme identité ;
- `labelFallback` est obligatoire si le libellé peut être vide ;
- si aucun libellé n’est trouvé, l’éditeur affiche un libellé de secours ;
- le host valide que la clé existe dans l’élément.

Pour Puzzle, `name` est souvent vide : le fallback `title → kind → id` est
nécessaire.

### 4. Régions dynamiques par élément

Le template déclare un motif de région dynamique :

```json
{
  "dynamicRegions": [
    {
      "idPattern": "block:{id}",
      "collection": "blocks",
      "keyField": "id"
    },
    {
      "idPattern": "page:{id}",
      "collection": "pages",
      "keyField": "id"
    }
  ]
}
```

Le template émet ensuite :

```html
<section data-onir-region="block:hero_main">…</section>
<section data-onir-region="block:services">…</section>
<section data-onir-region="page:home">…</section>
```

Le host résout la région :

```json
{
  "region": "block:hero_main",
  "target": {
    "param": "blocks",
    "itemKey": "id",
    "itemId": "hero_main"
  }
}
```

Règles :

- résolution par identifiant stable uniquement ;
- vérification de l’existence de l’élément dans la collection ;
- aucune exécution de code arbitraire ;
- pas de sélecteur CSS arbitraire dans le manifeste ;
- deux régions dynamiques ne peuvent pas partager le même préfixe ;
- le déplacement d’un élément ne change pas son identité.

### 5. Bindings ciblés

Les bindings peuvent cibler un élément de collection :

```json
{
  "bindings": [
    {
      "param": "blocks",
      "itemKey": "id",
      "itemId": "hero_main",
      "regions": ["block:hero_main"],
      "category": "content"
    }
  ]
}
```

Le host vérifie que :

- la collection existe ;
- l’élément existe ;
- la région dynamique est déclarée ;
- le binding ne référence pas un index.

### 6. Champs conditionnels

L’Editor Schema peut déclarer la visibilité d’un champ :

```json
{
  "fields": [
    {
      "param": "blocks",
      "field": "columns",
      "visibleWhen": {
        "field": "kind",
        "in": ["grid", "columns"]
      }
    },
    {
      "param": "blocks",
      "field": "article_id",
      "visibleWhen": {
        "field": "kind",
        "equals": "article"
      }
    }
  ]
}
```

Opérateurs autorisés en V2 :

- `equals`
- `notEquals`
- `in`
- `notIn`
- `truthy`
- `falsy`

Aucune expression JavaScript libre.

### 7. Groupes de propriétés et champs avancés

L’Editor Schema peut déclarer des groupes :

```json
{
  "groups": [
    {
      "param": "style_profiles",
      "id": "colors",
      "label": "Couleurs",
      "fields": ["colors"]
    },
    {
      "param": "style_profiles",
      "id": "typography",
      "label": "Typographie",
      "fields": ["font_family", "font_size", "font_weight", "text_align"]
    },
    {
      "param": "style_profiles",
      "id": "spacing",
      "label": "Espacements",
      "fields": ["padding", "margin_top", "margin_bottom", "gap"]
    },
    {
      "param": "style_profiles",
      "id": "advanced",
      "label": "Avancé",
      "collapsedByDefault": true,
      "fields": ["visibility", "image_fit", "image_ratio"]
    }
  ]
}
```

Règles :

- les champs non listés restent visibles dans le groupe de secours ;
- `advanced` est replié par défaut ;
- le host peut afficher une représentation métier des valeurs techniques.

### 8. Représentation métier des valeurs techniques

L’Editor Schema peut déclarer des libellés :

```json
{
  "valueLabels": {
    "style_profiles": {
      "font_size": {
        "-1": "Automatique"
      },
      "visibility": {
        "inherit": "Hériter du thème",
        "visible": "Visible",
        "hidden": "Masqué"
      }
    }
  }
}
```

Les valeurs `-1`, `inherit` et `""` ne doivent pas être affichées brutes
lorsqu’un libellé métier est déclaré.

### 9. Références entre collections

Les relations deviennent déclaratives :

```json
{
  "references": [
    {
      "from": "blocks",
      "field": "style_id",
      "to": "style_profiles",
      "targetKey": "id",
      "optional": true,
      "onDelete": "clear"
    },
    {
      "from": "placements",
      "field": "child_id",
      "to": "blocks",
      "targetKey": "id",
      "optional": false,
      "onDelete": "cascade"
    }
  ]
}
```

Les références polymorphes sont autorisées :

```json
{
  "from": "placements",
  "field": "parent_id",
  "targets": {
    "page": "pages",
    "region": "regions",
    "block": "blocks"
  },
  "discriminator": "parent_kind",
  "targetKey": "id"
}
```

Règles :

- les cibles sont validées à l’enregistrement ;
- les suppressions suivent `onDelete` (`clear`, `cascade`, `restrict`) ;
- aucun identifiant orphelin n’est introduit silencieusement ;
- les références fonctionnelles peuvent être circulaires (`blocks → actions → blocks`) ;
- seuls les cycles réels de contenance déclarés par `structure.children` sont interdits ;
- `onDelete` ne définit pas la contenance : la contenance vient de la structure déclarée ;
- le host effectue la validation et la mutation.

### 10. Arbre de structure déclaratif

Le manifeste déclare comment reconstruire l’arbre :

```json
{
  "structure": {
    "roots": "pages",
    "regions": {
      "collection": "regions",
      "fields": [
        "header_id",
        "left_sidebar_id",
        "right_sidebar_id",
        "footer_id"
      ]
    },
    "children": {
      "collection": "blocks",
      "through": "placements",
      "parentKey": "parent_id",
      "parentKindKey": "parent_kind",
      "childKey": "child_id",
      "orderKey": "position",
      "slotKey": "slot"
    }
  }
}
```

Les champs listés dans `structure.regions.fields` appartiennent à la collection
racine (`roots`) et référencent la collection des régions. Ils ne sont pas lus
dans la collection des régions elle-même.

Le moteur générique reconstruit :

```text
Pages
├── Accueil
│   ├── En-tête [partagé]
│   │   ├── Logo
│   │   └── Navigation
│   ├── Hero
│   ├── Nos formations
│   │   ├── Formation informatique
│   │   └── Formation professionnelle
│   └── Assistant IA
└── Pied de page [partagé]
```

Aucune logique `if (templateId === "puzzle")` n’est autorisée dans le cœur.

### 11. Portées d’édition

Le contrat V2 distingue quatre portées :

| Portée | Signification |
|---|---|
| `global` | affecte tout le site |
| `shared` | affecte plusieurs composants/pages |
| `page` | affecte une page |
| `local` | affecte l’élément sélectionné |

Pour un composant partagé, l’UI doit permettre de choisir entre :

- modifier le composant partagé ;
- créer une copie indépendante pour la page courante.

Le caractère partagé ne doit plus être déduit uniquement du nombre de régions.

### 12. Opérations structurelles atomiques

Le host expose des opérations génériques :

| Opération | Comportement |
|---|---|
| Ajouter un composant | créer le bloc et son placement |
| Supprimer un composant | supprimer les relations selon les règles |
| Déplacer un composant | modifier parent et position |
| Dupliquer un composant | copier avec un nouvel identifiant |
| Ajouter une page | créer la page et ses régions valides |
| Supprimer une page | nettoyer les relations associées |
| Réordonner | modifier l’ordre des placements |
| Rendre indépendant | dupliquer un composant partagé |
| Réinitialiser un style | restaurer les valeurs héritées |

Ces opérations sont atomiques : tout est validé et persisté, ou rien ne l’est.

Le template public reste en lecture seule.  
Les mutations sont exécutées et validées par l’hôte uniquement.

### 13. Sécurité et validation

- L’Editor Schema ne peut pas exécuter de JavaScript.
- Aucun sélecteur CSS arbitraire n’est autorisé.
- Les identifiants et chemins sont validés.
- Les collections et références sont vérifiées avant mutation.
- Les métadonnées ont des limites de taille et de profondeur.
- Le host ne fait jamais confiance aux messages du template pour une écriture.
- Les opérations structurelles sont transactionnelles.

### 14. Compatibilité

- `editor.version: 1` reste supporté sans changement.
- Un template sans Editor V2 utilise l’inspecteur générique.
- Un template avec Editor V2 peut être partiellement migré.
- Les données existantes ne sont ni migrées ni écrasées.
- Une nouvelle version de template est nécessaire pour publier V2.
- Les liens existants conservent leurs paramètres.
- Le repliage actuel des objets/tableaux reste le fallback V1.

## Alternatives écartées

### Imbriquer les collections pour faciliter le formulaire

Contraire au modèle de rendu et à la réutilisabilité. Refusée.

### Logique spécifique à Puzzle dans le dashboard

Non générique et non maintenable. Refusée.

### Deuxième copie des données dans l’Editor Schema

Créerait deux sources de vérité. Refusée.

### Index comme identifiant d’élément

Instable au déplacement. Refusée.

### JavaScript dans l’Editor Schema

Risque de sécurité et de maintenance. Refusée.

### Mutations côté template

Le template ne doit pas écrire. Refusée.

## Implémentation

Le contrat est implémenté dans la branche `feat/editor-v2-collections`, mergée
dans `main` via la PR #320. Les validateurs runtime couvrent les collections,
régions dynamiques, groupes, `valueLabels`, références, structure, scopes et
conditions de visibilité. La V1 reste inchangée.

## Conséquences

### Positives

- UX adaptée aux templates complexes ;
- conservation de la richesse de Puzzle ;
- modèle générique réutilisable ;
- arbre de structure compréhensible ;
- champs conditionnels et groupes ;
- relations validées ;
- rétrocompatibilité totale ;
- base pour l’édition assistée par IA.

### Négatives

- nouveau contrat à documenter et valider ;
- complexité supplémentaire dans le SDK ;
- migrations de templates vers V2 ;
- besoin d’un moteur de résolution et de mutation robuste ;
- tests de non-régression V1 obligatoires.

## Plan d’implémentation

| Phase | Développement | Priorité |
|---|---|---|
| 1 | Collections, résumés et fallback | P0 |
| 2 | Régions dynamiques et bindings par élément | P0 |
| 3 | Champs conditionnels | P0 |
| 4 | Groupes et champs avancés | P0 |
| 5 | Arbre de structure en lecture seule | P0/P1 |
| 6 | Références simples et polymorphes | P1 |
| 7 | Mutations structurelles atomiques | P1 |
| 8 | Portées global/shared/page/local | P1 |
| 9 | Migration de Puzzle vers V2 | P1 |
| 10 | Drag-and-drop et historique | P2 |
| 11 | Édition directe et composition par IA | P2 |

## Vérifications attendues

- anciens templates V1 inchangés ;
- aucun template sans V2 n’est impacté ;
- `blocks` affiche des libellés métier ;
- un clic sur `block:hero_main` cible le bon élément ;
- un déplacement ne change pas l’identité ;
- les champs non applicables à `kind` sont masqués ;
- les références invalides sont refusées à l’enregistrement ;
- l’arbre correspond aux `placements` ;
- les opérations sont atomiques ;
- aucune donnée A2DM n’est remplacée par les valeurs par défaut ;
- `editor.version: 1` reste fonctionnel.

## Recommandation

Écrire ce contrat avant toute refonte de Puzzle.  
Implémenter par couches, en validant chaque couche sur A2DM Formation sans coupler
le cœur au template.
