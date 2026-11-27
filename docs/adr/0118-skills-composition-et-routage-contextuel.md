# 0118. Skills de composition et routage contextuel générique

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0109, ADR-0110, ADR-0111, ADR-0112, ADR-0117.
- **Complète** : ADR-0110 et ADR-0117.
- **Remplace** : aucune.

## Contexte

Les rejets répétés `INVALID_OPERATION` et `INVALID_CANDIDATE_ID` montrent que le
planner ne dispose pas toujours de la bonne recette de composition de page.

Le routeur de skills ne reçoit aujourd’hui que :

- la demande ;
- l’historique ;
- le catalogue des skills.

Il ne voit pas :

- les collections du template ;
- les kinds disponibles ;
- les candidats ;
- les règles d’insertion ;
- les capacités du template.

De plus, `always: true` est déclaré dans le contrat mais n’est pas appliqué.

Le risque à éviter est d’ajouter des règles spécifiques à Puzzle dans le moteur.

## Décision

### 1. Nouveau skill de composition de page

Ajouter un skill de template `puzzle-page-compose`.

Il décrit :

- remplir une page existante ;
- créer une page avec du contenu ;
- ajouter titre, texte, grille et cartes ;
- créer les placements nécessaires.

Il utilise uniquement les opérations DSL existantes :

```text
insert
insertChild
set
unset
```

Il ne contient aucune opération inventée.

### 2. `always` appliqué par le core

Le routeur inclut d’abord les skills `always: true`, puis complète avec les
skills choisis par l’IA.

Règles :

- déduplication ;
- limite globale de 3 skills ;
- les skills `always` sont prioritaires ;
- les skills sélectionnés par l’IA remplissent les places restantes.

### 3. Contexte de routage générique

Le routeur reçoit un contexte dérivé d’Editor V2, sans nom métier Puzzle :

```ts
type SkillRoutingContext = {
  currentPage: { label: string } | null;
  collections: Array<{
    key: string;
    label: string;
    itemKindField: string | null;
  }>;
  candidates: Array<{
    collection: string;
    label: string;
    kind: string | null;
  }>;
  insertionRules: Array<{
    parentKind: string;
    childKinds: string[];
    slot: string;
  }>;
  capabilities: Array<{
    id: string;
    label: string;
  }>;
};
```

Le core ne contient aucun test du type :

```ts
if (template === "puzzle") ...
```

Les connaissances métier restent dans le manifeste et les skills du template.

### 4. Routage IA inchangé dans son principe

Le routeur reste un appel IA contraint :

- il choisit uniquement parmi les skills fournis ;
- il ne produit pas d’opération ;
- il ne remplace pas le planner ;
- il peut demander une clarification.

### 5. Planner inchangé

Le planner reste générique. La correction se fait par :

- la couverture des skills ;
- le contexte de routage ;
- les contraintes déclarées par le template.

Aucune règle spécifique à une page, un menu ou un kind Puzzle n’est ajoutée au
moteur agentique.

## Conséquences

- Le planner reçoit la bonne recette pour remplir une page.
- Le routeur dispose du contexte nécessaire pour choisir cette recette.
- `always` devient effectif.
- Le core reste indépendant des noms métier de Puzzle.
- Les erreurs répétées de plan doivent diminuer sans ajout de règles ad hoc.

## Tests attendus

- `always` est inclus même si l’IA ne le sélectionne pas.
- La limite de 3 skills reste respectée.
- Le contexte générique est transmis au routeur.
- Aucun nom de collection Puzzle n’est codé dans le core.
- Le skill `puzzle-page-compose` est sélectionnable pour une demande de
  remplissage de page.
