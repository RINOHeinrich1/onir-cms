# 0112. Plan DSL et compilateur d’opérations pour l’édition IA

- **Statut** : Proposé
- **Date** : 2026-11-26
- **Référence** : ADR-0108, ADR-0109, ADR-0110, ADR-0111.
- **Complète** : ADR-0111 (planner et retry borné).
- **Remplace** : aucune.

## Contexte

L’ADR-0111 a introduit un planner et des références symboliques `$ref:<stepId>`.
L’audit preprod a montré un nouvel échec :

```json
{
  "op": "set",
  "target": "blocks:23adba46-...",
  "data": {
    "action_id": "ce5acde8-..."
  }
}
```

Le planner avait compris l’intention, choisi le bon skill et trouvé les bons
objets. Mais il a produit une opération qui ne respecte pas le contrat interne
`TemplateEditOperation`.

Le core a répondu tardivement :

```text
operations[0].undefined — cible incompatible avec set
```

Cette erreur est trop pauvre pour permettre un retry fiable.

Le problème n’est pas le moteur Editor V2. Il est à la frontière entre :

1. le Target Resolver ;
2. le planner IA ;
3. le moteur de mutation.

Ces trois composants utilisent aujourd’hui des représentations trop proches ou
mal séparées.

## Décision

### 1. Séparer le contrat du planner du contrat du moteur

Le planner ne produit plus directement un `TemplateEditOperation`.

Il produit un **Plan DSL**, plus simple et stable :

```text
Target Resolver → IDs de candidats
Planner IA      → Plan DSL
Compiler        → TemplateEditOperation typée
Mutation Engine → validation + exécution
```

Le moteur Editor V2 reste inchangé.

### 2. Plan DSL v1

Un plan contient zéro ou plusieurs étapes :

```ts
type TemplateEditPlanV1 = {
  schemaVersion: 1;
  steps: TemplateEditPlanStepV1[];
  warnings?: string[];
  clarification?: string | null;
};

type TemplateEditPlanStepV1 = {
  id: string;
  description?: string;
  operation: TemplateEditPlanOperationV1;
};
```

Règles :

- `id` en kebab-case, unique ;
- `steps` et `clarification` ne peuvent pas être fournis ensemble ;
- si `steps` est vide, `clarification` ou `warnings` doit expliquer pourquoi ;
- maximum 20 étapes ;
- aucun ID réel inventé par l’IA.

### 3. Opérations du Plan DSL

#### `set`

Deux formes seulement.

Paramètre :

```json
{
  "op": "set",
  "target": { "kind": "param", "path": "global_theme.color_primary" },
  "value": "#112233"
}
```

Champ d’un candidat :

```json
{
  "op": "set",
  "candidateId": "blocks:23adba46-...",
  "field": "action_id",
  "value": "ce5acde8-..."
}
```

Le compiler transforme la seconde forme en :

```json
{
  "op": "set",
  "target": {
    "kind": "collectionItemField",
    "collection": "blocks",
    "itemKey": "id",
    "itemId": "23adba46-...",
    "field": "action_id"
  },
  "value": "ce5acde8-..."
}
```

#### `insert`

```json
{
  "op": "insert",
  "collection": "pages",
  "values": {
    "title": "Nos services",
    "slug": "nos-services"
  }
}
```

Le `id` de l’étape permet de référencer l’objet créé :

```json
"value": "$ref:page"
```

#### `insertChild`

```json
{
  "op": "insertChild",
  "parent": "blocks:nav_main",
  "child": {
    "collection": "blocks",
    "kind": "menu_item",
    "slot": "content",
    "values": {
      "title": "Services",
      "action_id": "$ref:action"
    }
  }
}
```

#### `remove`, `duplicate`, `move`

Toutes les cibles utilisent un `candidateId` ou une référence `$ref` :

```json
{ "op": "remove", "candidateId": "blocks:23adba46-..." }
```

```json
{
  "op": "move",
  "candidateId": "blocks:23adba46-...",
  "parent": "blocks:nav_main",
  "position": 1
}
```

### 4. Compilation stricte avant exécution

Le compiler doit :

1. valider le schéma du plan ;
2. vérifier que chaque `candidateId` existe ;
3. vérifier que chaque `collection` existe ;
4. vérifier que chaque `field` existe dans le schéma de la collection ;
5. vérifier que chaque `kind` est autorisé ;
6. résoudre les `$ref` vers des étapes **précédentes uniquement** ;
7. vérifier qu’aucune référence n’est inventée ;
8. produire des `TemplateEditOperation` typées.

Aucune étape ne doit être exécutée avant la compilation complète réussie.

### 5. Erreurs structurées

Les erreurs doivent être exploitables par le retry :

```json
{
  "code": "INVALID_TARGET_KIND",
  "stepId": "step-1",
  "path": "operation.target",
  "expected": "object",
  "received": "string",
  "message": "Une opération set exige une cible structurée."
}
```

Autres codes :

- `MISSING_REQUIRED_PROPERTY`
- `UNKNOWN_CANDIDATE`
- `UNKNOWN_COLLECTION`
- `UNKNOWN_FIELD`
- `UNKNOWN_REF`
- `INVALID_REF_ORDER`
- `INVALID_KIND`
- `INVALID_STEP_ID`
- `EMPTY_PLAN_WITHOUT_CLARIFICATION`
- `STEPS_AND_CLARIFICATION_CONFLICT`
- `TOO_MANY_STEPS`

Le retry reçoit ces erreurs structurées, le plan précédent et les candidats.

### 6. Retry borné

Le planner est relancé au maximum **2 fois**.

Il reçoit :

- la demande ;
- l’historique ;
- les candidats ;
- le plan précédent ;
- les erreurs structurées ;
- les règles de compilation.

Il doit corriger la structure, pas inventer un nouvel ID.

### 7. Réutilisation d’un objet existant

Quand une page ou un élément existe déjà, le planner doit :

- le réutiliser explicitement ; ou
- demander une clarification.

Il ne doit pas créer un doublon silencieux.  
Le plan doit indiquer `reuse` ou `create` lorsque le choix est ambigu.

### 8. Frontière avec les skills

Les skills doivent décrire leurs compositions dans le **Plan DSL**, pas dans le
contrat interne `TemplateEditOperation`.

Le core conserve :

- le compilateur ;
- les validations ;
- les mutations ;
- les références ;
- l’audit ;
- les permissions.

Le skill ne fournit jamais :

- d’ID ;
- de `collection` inventée ;
- de `field` inventé ;
- de `$ref` vers une étape future ;
- de code exécutable.

### 9. Audit

Pour chaque tentative de plan, l’audit doit contenir :

- `turn_id` ;
- `stage` ;
- candidats fournis ;
- valeurs courantes utiles des candidats ;
- digest du contexte planner ;
- plan brut ;
- plan compilé ;
- erreurs structurées ;
- résultat du retry ;
- version du Plan DSL.

Cela permet de distinguer :

- incompréhension de la demande ;
- cible absente ;
- skill incorrect ;
- plan mal structuré ;
- champ inexistant ;
- référence invalide ;
- erreur d’exécution métier.

### 10. Ce qui ne change pas

- `TemplateEditOperation` reste le contrat interne du moteur.
- `applyTemplateEditProposal` reste le validateur final.
- Le lien n’est jamais modifié avant « Enregistrer ».
- Le routeur de skills reste séparé.
- Le prompt de base ne contient aucune règle spécifique à Puzzle.

## Conséquences

### Positives

- Le planner n’a plus besoin de connaître les détails internes du moteur.
- Les erreurs deviennent exploitables par le retry.
- Les plans invalides sont rejetés avant toute mutation.
- Les skills peuvent cibler un contrat stable.
- L’audit permet de reproduire et corriger les échecs.
- Le moteur Editor V2 reste inchangé.

### Négatives

- Un compiler supplémentaire à maintenir.
- Un schéma Plan DSL à versionner.
- Les prompts et skills doivent évoluer vers ce DSL.
- Les erreurs doivent être maintenues avec stabilité.

## Alternatives écartées

### Modifier Editor V2 pour accepter le format accidentel de l’IA

Refusé : couplage au modèle et perte de validation.

### Laisser le planner produire directement `TemplateEditOperation`

Refusé : contrat trop complexe pour le modèle et erreurs tardives.

### Corriger uniquement le prompt

Refusé : ne garantit pas la structure et ne rend pas le retry fiable.

### Compiler permissif

Refusé : un format accepté aujourd’hui par accident devient un contrat implicite.

## Plan d’implémentation

| Lot | Contenu |
|---|---|
| A | Types Plan DSL v1 |
| B | Schéma de validation strict |
| C | Compiler `candidateId` / `$ref` → `TemplateEditOperation` |
| D | Erreurs structurées |
| E | Retry avec erreurs structurées |
| F | Audit plan brut, plan compilé et digest de contexte |
| G | Règles `reuse` / `create` |
| H | Adaptation des skills Puzzle |
| I | Tests de non-régression et recette préprod |

## Critères d’acceptation

- Un `target` chaîne est rejeté avant exécution.
- Un `set` sans `value` produit `MISSING_REQUIRED_PROPERTY`.
- Un `candidateId` inconnu produit `UNKNOWN_CANDIDATE`.
- Un `field` inconnu produit `UNKNOWN_FIELD`.
- Un `$ref` vers une étape future produit `INVALID_REF_ORDER`.
- Un plan avec `steps` et `clarification` est rejeté.
- Un plan valide avec page, action et menu item s’exécute via `$ref`.
- Un warning vide sans plan devient une clarification visible.
- Aucun ID réel n’est inventé par l’IA.
- Le retry reçoit les erreurs structurées et ne peut pas contourner le compiler.
