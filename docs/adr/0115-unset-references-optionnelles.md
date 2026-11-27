# 0115. Sémantique `unset` pour les références optionnelles

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0108, ADR-0109, ADR-0111, ADR-0112, ADR-0113, ADR-0114.
- **Complète** : ADR-0112.
- **Remplace** : aucune.

## Contexte

Le Plan DSL permet de créer ou modifier une référence vers un objet existant avec :

```json
{ "$candidate": "actions:go_home" }
```

ou vers un objet créé dans le plan avec :

```json
{ "$ref": "step-action" }
```

Mais il ne permet pas de **retirer une référence optionnelle**.

Exemple réel :

```text
Le planner veut retirer action_id du bouton Découvrir Puzzle
pour privilégier une URL externe portée par value.
```

Les tentatives produisent :

```text
INVALID_REFERENCE_TYPE steps.clear-action-id.value
```

ou :

```text
blocks[29].action_id — valeur invalide
```

Le problème n’est ni le skill ni le planner : le contrat d’édition ne possède
aucune opération pour exprimer “aucune référence”.

## Décision

### 1. Ajouter une opération `unset` au Plan DSL

```json
{
  "op": "unset",
  "candidateId": "blocks:hero_discover",
  "field": "action_id"
}
```

L’opération est générique et s’applique à toute référence optionnelle :

- `action_id`
- `style_id`
- `article_id`
- `header_id`
- `footer_id`

### 2. Utiliser `editor.references[].optional`

Le compilateur autorise `unset` uniquement si :

- le champ existe ;
- le champ est déclaré comme référence ;
- la référence est `optional: true`.

`unset` est refusé sur une référence obligatoire.

### 3. Ajouter l’opération interne correspondante

```ts
{
  op: "unset";
  target: {
    kind: "collectionItemField";
    collection: string;
    itemKey: string;
    itemId: string;
    field: string;
  };
}
```

### 4. Exécution

L’exécuteur écrit une valeur vide compatible avec le schéma :

```text
action_id = ""
```

Il ne supprime pas la clé du JSON.

### 5. Validation

Le compilateur, l’exécuteur et la validation référentielle doivent accepter
explicitement une valeur vide sur une référence optionnelle.

### 6. Prompt et skills

Le planner doit savoir :

```text
Pour retirer une action ou un style :
utiliser unset
ne jamais mettre "", null ou une chaîne brute dans un champ de référence
```

## Conséquences

- Le planner peut exprimer un retrait de référence.
- Le cas URL externe + suppression d’action devient planifiable.
- Le compilateur conserve la validation stricte des références obligatoires.
- Le comportement est générique à tous les templates Editor V2.
- Aucun contournement spécifique au bouton Facebook ou à Puzzle n’est introduit.
