# 0109. Édition assistée des templates par IA — résolution de cible sans curseur

- **Statut** : Proposé
- **Date** : 2026-11-25
- **Référence** : ADR-0023, ADR-0064, ADR-0081, ADR-0095, ADR-0105, ADR-0108.
- **Complète** : ADR-0108 (phase 11 « édition directe et composition par IA »).
- **Remplace** : aucune.

## Contexte

L’ADR-0108 a posé un socle générique solide pour l’édition des templates :

- `params` reste la source de vérité des données ;
- `editor` décrit la présentation d’édition (collections, régions dynamiques,
  bindings, groupes, champs conditionnels, références, structure, insertions,
  scopes) ;
- les mutations sont génériques et exécutées par l’hôte ;
- le template public reste en lecture seule.

La phase 11 de l’ADR-0108 prévoit l’édition directe et la composition par IA,
mais ne définit ni le mode d’entrée, ni la résolution de cible, ni le contrat de
proposition. Le curseur d’inspection de l’ADR-0105 apporte une grande précision,
mais son usage ne peut pas être le parcours principal : la majorité des
utilisateurs fera des demandes générales du type :

- « supprime la section nous connaître » ;
- « change le fond du bouton discuter dans la page d’accueil ».

Ces demandes ne contiennent ni `regionId`, ni `itemId`, ni chemin de paramètre.
Le système doit pourtant les traiter sans inventer de cible et sans connaître
les valeurs métier d’un template particulier.

## Décision

### 1. Le curseur est un mode de précision, pas le point d’entrée

Le point d’entrée par défaut est une **demande en langage naturel**. Le curseur
d’inspection reste disponible :

- comme accélérateur de précision ;
- comme moyen de lever une ambiguïté ;
- comme secours quand aucune cible fiable n’est trouvée.

Une sélection issue du curseur est un **indice fort**, jamais une condition
d’accès à l’édition assistée.

### 2. Ajouter un Target Resolver avant le Context Builder

Le flux devient :

```text
demande utilisateur
      ↓
Target Resolver
      ↓
EditContext
      ↓
proposition IA
      ↓
validation
      ↓
mutation générique
      ↓
aperçu + confirmation
```

Le **Target Resolver** transforme une intention en une ou plusieurs cibles
réelles du manifeste. Il ne produit jamais d’identifiant : il choisit parmi les
identifiants existants.

#### 2.1 Entrées du resolver

- la demande de l’utilisateur ;
- la page courante de l’aperçu (`surface=page`) ;
- la sélection éventuelle du curseur ;
- le manifeste de la version de template ;
- les valeurs actuelles du lien ;
- la structure `pages → régions → blocks` via `placements` ;
- les libellés, kinds, actions et styles déclarés.

#### 2.2 Étapes

| Étape | Rôle |
|---|---|
| Page Context | Résoudre « page d’accueil », « accueil », « home » vers un `pages.id` |
| Manifest Index | Indexer pages, composants, actions, styles, libellés et kinds |
| Structure Filter | Limiter les candidats à la page cible via `placements` |
| Lexical Match | Chercher dans `itemLabel`, `labelFallback`, `title`, `name`, `text` |
| Semantic Rank | Classer les candidats avec le modèle, sans générer d’ID |
| Confidence Gate | Décider : proposition directe, désambiguïsation ou refus |

#### 2.3 Règles de résolution

- une page explicitement nommée filtre les candidats à cette page ;
- sans page explicite, la page courante de l’aperçu est utilisée ;
- le mot « section » privilégie un composant, pas une page ;
- « bouton » privilégie `kind = button` ;
- une action ou un libellé d’action peut fournir un synonyme ;
- un style partagé ne peut pas être modifié silencieusement ;
- une cible absente du manifeste n’est jamais inventée.

### 3. Contrat de cible

Le resolver produit des candidats explicites :

```ts
type TargetCandidate = {
  kind: "page" | "collectionItem" | "param";
  collection?: string;
  itemKey?: string;
  itemId?: string;
  path?: string;
  label: string;
  pageId?: string;
  confidence: number;
  reasons: string[];
};
```

Exemples :

```json
{
  "kind": "collectionItem",
  "collection": "blocks",
  "itemKey": "id",
  "itemId": "hero_button",
  "label": "Bouton « Parler à notre assistant »",
  "pageId": "home",
  "confidence": 0.88,
  "reasons": ["kind=button", "action=open_assistant", "synonyme de « discuter »"]
}
```

### 4. Contrat de proposition

L’IA ne produit pas d’opérations métier comme `setText`, `setColor` ou
`setImage`. Elle produit un patch générique, contraint par le manifeste :

```ts
type EditTarget =
  | { kind: "param"; path: string }
  | {
      kind: "collectionItem";
      collection: string;
      itemKey: string;
      itemId: string;
    }
  | {
      kind: "collectionItemField";
      collection: string;
      itemKey: string;
      itemId: string;
      field: string;
    };

type EditProposal = {
  operations: Array<
    | { op: "set"; target: EditTarget; value: TemplateParamValue }
    | {
        op: "insert";
        target: { kind: "collection"; collection: string };
        values: Record<string, TemplateParamValue>;
      }
    | {
        op: "insertChild";
        parent: EditTarget;
        child: {
          collection: string;
          kind: string;
          slot: string;
          values: Record<string, TemplateParamValue>;
        };
      }
    | { op: "remove"; target: EditTarget }
    | { op: "duplicate"; target: EditTarget }
    | { op: "move"; target: EditTarget; parentId: string; position: number }
  >;
  warnings: string[];
};
```

- un `set` couvre `string`, `text`, `number`, `boolean`, `color`, `url`,
  `image`, `select`, `object` et `array` ;
- le type du paramètre décide du contrôle et de la validation ;
- les opérations structurelles restent celles de l’ADR-0108 §12 ;
- les valeurs `image` sont des valeurs du schéma, jamais une nouvelle
  sémantique « setImage » ajoutée au cœur.

### 5. Context Builder

Le Context Builder ne reçoit pas tout le template. Il reçoit la cible résolue,
puis extrait :

- les bindings de la région ou de l’élément ;
- le sous-schéma des paramètres concernés ;
- les valeurs actuelles ;
- les règles `visibleWhen`, `groups`, `valueLabels`, `references`, `scopes` ;
- les règles `insertion` applicables.

Le modèle ne voit donc ni des milliers de valeurs, ni les autres templates.

### 6. Désambiguïsation

Le resolver applique une politique explicite :

| Cas | Comportement |
|---|---|
| Cible unique à confiance haute | Proposition directe |
| Plusieurs cibles plausibles | Question avec 2–3 choix réels |
| Confiance faible | Refus explicite, suggestion de reformuler ou de sélectionner |
| Style partagé concerné | Choix « modifier le partagé » ou « créer une copie locale » |
| Opération non déclarée | Refus explicite |

Une question de désambiguïsation ne doit jamais proposer un identifiant qui
n’existe pas dans le manifeste.

### 7. Portée et styles partagés

Les `scopes` de l’ADR-0108 sont appliqués avant toute mutation :

- `global` : impacte tout le site ;
- `shared` : impacte plusieurs composants ou pages ;
- `page` : impacte la page courante ;
- `local` : impacte l’élément sélectionné.

Une demande comme « change le fond de ce bouton » doit privilégier une **copie
locale** si le style est partagé. Le système ne modifie pas un style partagé
sans confirmation explicite.

### 8. Garde-fous

- aucun identifiant généré par le modèle ;
- aucun index de tableau utilisé comme identité ;
- aucun champ absent du schéma ;
- aucune opération absente du manifeste ;
- aucune exécution de JavaScript ou de sélecteur CSS arbitraire ;
- validation par les fonctions existantes de `template-params`,
  `template-editor` et `template-structure-operations` ;
- mutation atomique et transactionnelle ;
- aucune écriture avant confirmation utilisateur ;
- isolation par organisation et par lien.

### 9. Exemples de référence

#### 9.1 « supprime la section nous connaître »

Candidats possibles dans Puzzle :

- bloc `about_text`, libellé « À propos de Puzzle » ;
- page `about`, libellé « À propos ».

Le mot « section » fait préférer le bloc. Si l’ambiguïté subsiste, le studio
demande :

```text
J’ai trouvé deux cibles :
1. Le bloc « À propos de Puzzle »
2. La page « À propos »

Laquelle veux-tu supprimer ?
```

Proposition retenue pour le bloc :

```json
{
  "operations": [
    {
      "op": "remove",
      "target": {
        "kind": "collectionItem",
        "collection": "blocks",
        "itemKey": "id",
        "itemId": "about_text"
      }
    }
  ]
}
```

La validation vérifie les placements et les références avant suppression.

#### 9.2 « change le fond du bouton discuter dans la page d’accueil »

Résolution :

- page : `home` ;
- bouton : `hero_button`, kind `button`, action `open_assistant` ;
- libellé actuel : « Parler à notre assistant » ;
- « discuter » est un synonyme sémantique de l’action d’assistance.

Le fond appartient à un `style_profiles.colors` avec un rôle
`button_background`. Comme `style_profiles` est en scope `shared`, le système
propose par défaut de créer un style dédié :

```json
{
  "operations": [
    {
      "op": "insert",
      "target": { "kind": "collection", "collection": "style_profiles" },
      "values": {
        "name": "Bouton discuter — accueil",
        "colors": [
          {
            "role": "button_background",
            "source": "custom",
            "color": "#1f6feb",
            "token": "primary"
          }
        ]
      }
    },
    {
      "op": "set",
      "target": {
        "kind": "collectionItemField",
        "collection": "blocks",
        "itemKey": "id",
        "itemId": "hero_button",
        "field": "style_id"
      },
      "value": "<id du style créé>"
    }
  ],
  "warnings": [
    "Un style dédié a été créé pour éviter de modifier les autres boutons."
  ]
}
```

### 10. Limites actuelles des manifestes

Le resolver ne peut faire que ce que le manifeste déclare.

Exemple : avec le manifeste Puzzle actuel, l’ajout d’un bloc à la racine d’une
page n’est pas déclaré dans `editor.insertion`. Une demande générale de ce type
doit donc être refusée ou transformée en question, pas contournée par le cœur.

Pour l’autoriser, le template doit déclarer une règle générique :

```json
{
  "parentKind": "page",
  "childCollection": "blocks",
  "allowedKinds": ["card", "hero"],
  "slot": "content",
  "defaults": {
    "card": {
      "title": "Nouvelle carte",
      "image_url": "",
      "alt_text": ""
    }
  }
}
```

Le cœur n’a alors aucun changement à subir.

## Conséquences

### Positives

- parcours principal accessible sans connaître le curseur ;
- demande générale traitée à partir des manifestes existants ;
- aucune valeur métier codée dans le cœur ;
- désambiguïsation explicite plutôt que devinette ;
- styles partagés protégés ;
- réutilisation complète de l’Editor V2 de l’ADR-0108.

### Négatives

- nouvelle étape de résolution et de classement ;
- dépendance à la qualité des libellés et descriptions des manifestes ;
- besoin de définir un seuil de confiance et une UX de désambiguïsation ;
- coût IA supplémentaire pour le classement des candidats ;
- les templates doivent déclarer les insertions et les styles qu’ils autorisent.

## Alternatives écartées

### Curseur obligatoire

Refusé : trop peu d’utilisateurs l’utiliseront spontanément, alors que les
demandes générales sont le parcours naturel.

### Vocabulaire métier dans le cœur

`setText`, `setColor`, `setImage` et assimilés sont refusés : ils recréent une
connaissance des templates dans le cœur et ne passent pas à l’échelle.

### IA libre qui génère les identifiants

Refusé : risque d’hallucination, de corruption de structure et de mutation hors
manifeste.

### Modification silencieuse d’un style partagé

Refusé : une demande locale ne doit pas modifier plusieurs composants sans
avertissement.

## Plan d’implémentation

| Lot | Développement | Priorité |
|---|---|---|
| A | Page Context, Manifest Index, résolution lexicale pure | P0 |
| B | Structure Filter via `pages` / `placements`, portée page | P0 |
| C | Classement sémantique des candidats et questions de désambiguïsation | P0 |
| D | Contrat `EditProposal`, validateur et opérations génériques | P0 |
| E | Panneau IA dans le studio, diff, Appliquer / Annuler | P1 |
| F | Scopes, styles partagés, création de copie locale | P1 |
| G | Audit, quotas, rate limit, télémétrie, tests E2E | P1 |

## Vérifications attendues

- « supprime la section nous connaître » propose le bloc ou demande la page ;
- « change le fond du bouton discuter dans la page d’accueil » cible
  `hero_button` sur `home` ;
- une demande sans cible fiable ne modifie rien ;
- une cible ambiguë déclenche une question, pas une mutation ;
- une opération non déclarée est refusée ;
- un style partagé n’est jamais modifié silencieusement ;
- aucun identifiant inventé n’est accepté ;
- l’aperçu et la sauvegarde restent inchangés tant que l’utilisateur n’a pas
  confirmé ;
- les templates V1 restent inchangés ;
- les tests de non-régression de l’ADR-0108 restent verts.

## Recommandation

Implémenter d’abord les lots A à D sans interface, avec des tests de résolution
sur Puzzle. Ajouter ensuite le panneau IA (lot E) et les garde-fous de portée
(lot F). L’édition assistée ne doit être activée qu’après validation des cas
« cible unique », « cible ambiguë » et « cible absente ».
