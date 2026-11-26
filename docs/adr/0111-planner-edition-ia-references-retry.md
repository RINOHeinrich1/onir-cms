# 0111. Planner d’édition IA, références symboliques et retry borné

- **Statut** : Proposé
- **Date** : 2026-11-26
- **Référence** : ADR-0108, ADR-0109, ADR-0110.
- **Complète** : ADR-0109 (édition assistée), ADR-0110 (skills de template).
- **Remplace** : aucune.

## Contexte

L’édition assistée sait résoudre une cible et produire une proposition d’opérations.
Elle échoue toutefois sur les demandes relationnelles du type :

> « crée une page Services et rattache-la à l’entrée Services du menu »

Le problème n’est pas le modèle seul :

- plusieurs objets doivent être ciblés ;
- un objet créé doit être référencé par une opération suivante ;
- les IDs sont générés par l’hôte ;
- une étape peut échouer et nécessiter une correction ;
- l’IA ne peut pas inventer `page_id`, `menu_items` ou un ID qui n’existe pas encore.

Le système a besoin d’un **plan exécutable**, pas d’une proposition isolée.

## Décision

### 1. Le planner est une étape distincte

Le flux devient :

```text
demande
  ↓
historique complet de la session
  ↓
routage des skills
  ↓
contexte multi-candidats
  ↓
planner IA
  ↓
exécution séquentielle
  ↓
validation étape par étape
  ↓
succès ou erreurs d’étape
  ↓
retry borné avec erreurs
  ↓
proposition finale
```

Le planner ne choisit pas librement des objets : il travaille sur une liste fermée
de candidats réels (pages, blocs, menus, styles, actions, etc.).

### 2. Un plan est une suite d’opérations existantes

```ts
type TemplateEditPlanStep = {
  id: string;
  description?: string;
  operation: TemplateEditOperation;
};

type TemplateEditPlan = {
  steps: TemplateEditPlanStep[];
  warnings?: string[];
  clarification?: string | null;
};
```

Les opérations restent celles du core :

- `set`
- `insert`
- `insertChild`
- `remove`
- `duplicate`
- `move`

Le planner ne peut pas ajouter une opération au core.

### 3. Références symboliques `$ref:<stepId>`

Un objet créé dans une étape peut être référencé par une étape suivante :

```json
{
  "steps": [
    {
      "id": "page",
      "operation": {
        "op": "insert",
        "target": { "kind": "collection", "collection": "pages" },
        "values": { "title": "Services", "slug": "services" }
      }
    },
    {
      "id": "action",
      "operation": {
        "op": "insert",
        "target": { "kind": "collection", "collection": "actions" },
        "values": {
          "kind": "navigate_page",
          "target_id": "$ref:page"
        }
      }
    },
    {
      "id": "menu",
      "operation": {
        "op": "insertChild",
        "parent": {
          "kind": "collectionItem",
          "collection": "blocks",
          "itemKey": "id",
          "itemId": "nav_main",
          "itemKind": "menu"
        },
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
    }
  ]
}
```

Le core :

1. exécute `page` ;
2. récupère l’ID réel généré ;
3. remplace `$ref:page` par cet ID ;
4. exécute `action` ;
5. récupère l’ID de l’action ;
6. remplace `$ref:action` ;
7. exécute `menu`.

Aucun ID généré n’est demandé au modèle.

### 4. Exécution et validation par étape

Le core clone les valeurs, puis :

- résout les références de l’étape ;
- exécute une seule opération ;
- valide les paramètres, collections et structure ;
- enregistre les IDs créés sous `refs[step.id]` ;
- passe à l’étape suivante.

Une étape échouée retourne :

- `stepId` ;
- erreurs ;
- valeurs courantes ;
- références déjà résolues ;
- opérations déjà exécutées.

Aucun état partiellement appliqué n’est persisté dans le lien.

### 5. Retry borné

Le planner est rappelé au maximum **2 fois** avec :

- la demande ;
- l’historique ;
- les candidats ;
- le plan précédent ;
- les erreurs d’étape.

Il doit produire un plan corrigé. Le retry n’est pas une boucle infinie et ne
peut pas contourner les validations du core.

### 6. Warnings et clarification

Si le planner ne peut pas produire un plan avec les opérations existantes :

- `steps: []` ;
- `clarification` ou `warnings`.

Le core traite cela comme une **réponse fonctionnelle**, pas comme une erreur
technique :

- événement `clarification_required` ;
- message assistant visible ;
- aucune tentative de mutation.

### 7. Multi-candidats

Pour les demandes relationnelles, le resolver fournit un contexte large :

- pages ;
- blocs ;
- menu items ;
- actions ;
- styles ;
- éléments partagés.

Le planner reçoit les candidats, leur kind, leur portée et leur valeur courante.
Il peut sélectionner plusieurs objets dans le plan.

### 8. Historique

Tous les messages précédents de la session sont transmis :

- au routeur de skills ;
- au planner ;
- au cas échéant au classement de cibles.

L’historique est borné par une limite de sécurité de contexte. Il ne remplace pas
la validation et ne constitue pas une source de vérité.

### 9. Audit

Chaque tour possède un `turnId`. Les événements enregistrent :

- `target_candidates` ;
- `skill_routing` ;
- `clarification_required` ;
- `proposal_created` ;
- `proposal_rejected` ;
- `proposal_applied` ;
- `link_saved` ;
- `error`.

Pour les rejets et erreurs :

- `stage` ;
- `raw_response` ;
- `validation_errors` ;
- `turn_id`.

Cela permet de distinguer :

- une cible absente ;
- un plan vide ;
- un plan invalide ;
- une erreur d’exécution ;
- une erreur de génération.

### 10. Frontière avec les skills

Les skills guident le planner :

- intentions ;
- compositions ;
- vocabulaire métier ;
- contraintes.

Ils ne fournissent jamais :

- d’ID ;
- d’opération nouvelle ;
- de code ;
- de contournement de validation.

## Conséquences

### Positives

- Les demandes relationnelles deviennent exécutables.
- Les IDs restent générés par le core.
- Les erreurs d’étape sont exploitables.
- Le retry corrige un plan au lieu de masquer l’échec.
- Les warnings sont visibles dans le chat.
- L’audit est corrélé par `turnId`.

### Négatives

- Un appel planner supplémentaire.
- Un plan peut être plus coûteux qu’une proposition simple.
- Le retry doit rester borné.
- Les références symboliques doivent être strictement validées.
- Les skills doivent être précis sur les compositions.

## Alternatives écartées

### Continuer avec une proposition mono-opération

Refusé : impossible de créer et lier plusieurs objets.

### IDs fournis par l’IA

Refusé : collisions, objets fantômes et références cassées.

### Prompt spécifique à Puzzle dans le core

Refusé : couplage fort et non reproductible.

### Retry infini ou auto-réparation libre

Refusé : coût, boucles et risque de mutation dangereuse.

## Plan d’implémentation

| Lot | Contenu |
|---|---|
| A | Types `TemplateEditPlan` et exécuteur avec `$ref` |
| B | Résolution multi-candidats |
| C | Prompt planner + parse strict |
| D | Retry borné avec erreurs d’étape |
| E | Intégration session, warnings et clarifications |
| F | Audit `turnId`, `stage`, `raw_response`, `validation_errors` |
| G | Tests d’exécution, de retry et de refus |
| H | Recette préprod Puzzle |

## Critères d’acceptation

- Un plan peut créer une page, une action et un menu item liés.
- Aucun ID inventé n’est accepté.
- Une référence `$ref` inconnue échoue proprement.
- Un plan invalide est retenté au maximum une fois.
- Un warning sans opérations est affiché comme clarification.
- Toute tentative et tout rejet sont audités.
- Le lien n’est jamais modifié avant « Enregistrer ».
- Un template sans skill continue de fonctionner.
