# 0122. Orchestration adaptative des missions agentiques complexes

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0112, ADR-0113, ADR-0114, ADR-0116, ADR-0117, ADR-0118, ADR-0119, ADR-0120, ADR-0121.
- **Complète** : ADR-0113, ADR-0118, ADR-0119 et ADR-0121.
- **Remplace** : aucune.

## Objectif

Permettre à l’agent de traiter une mission qui dépasse un seul plan DSL, en
décomposant cette mission en objectifs observables et adaptables.

La décomposition est **LLM-driven**. Le core ne juge pas si le découpage est
pertinent ; il garantit uniquement le contrat, l’état, les preuves, les budgets
et l’exécution transactionnelle.

## Contexte

Une mission peut nécessiter :

- plusieurs plans ;
- plusieurs observations ;
- plusieurs interventions humaines ;
- plusieurs révisions ;
- des objectifs qui changent après inspection du rendu.

Le runtime actuel dispose déjà :

- d’une session agentique ;
- d’une boucle Pensée → Action → Observation → Décision ;
- d’un plan DSL borné ;
- d’un `AgentAttempt` transactionnel ;
- d’une mémoire opérationnelle ;
- de révisions et de checkpoints ;
- de budgets de mission.

Le problème n’est pas l’absence de boucle, mais la confusion entre :

```text
mission
objectif intermédiaire
plan
tentative
```

## Décisions

### 1. Séparer les quatre échelles

```text
Mission
  └── Objectif
        └── Plan DSL
              └── AgentAttempt
```

- **Mission** : intention globale de l’utilisateur.
- **Objectif** : résultat observable attendu.
- **Plan** : lot d’opérations DSL validé.
- **Tentative** : exécution transactionnelle d’un plan.

Une mission peut contenir plusieurs objectifs.
Un objectif ne contient pas directement des opérations DSL.
Un plan ne définit pas à lui seul la mission.

### 2. Décomposition LLM-driven

Le LLM peut :

- créer des objectifs ;
- les fusionner ;
- les scinder ;
- les réordonner ;
- les remplacer ;
- en ajouter après une observation.

Aucune validation déterministe ne juge :

- la pertinence du découpage ;
- la complétude de la mission ;
- la qualité sémantique des critères ;
- la fidélité à l’intention utilisateur.

Ces jugements relèvent du LLM, des preuves et éventuellement de l’humain.

### 3. Validation structurelle uniquement

Le core valide :

- le schéma JSON ;
- l’unicité des clés ;
- les champs obligatoires ;
- les dépendances ;
- l’absence de cycles ;
- les budgets ;
- les références à des objectifs existants ;
- les kinds de preuve autorisés ;
- l’absence d’identifiants techniques inventés.

Le core ne valide pas le sens de l’objectif.

### 4. Contrat d’objectif

```ts
type MissionObjective = {
  key: string;
  title: string;
  goal: string;
  rationale?: string;

  acceptanceCriteria: string[];

  evidence: Array<{
    kind: "state" | "render" | "reference" | "user" | "manual";
    description: string;
  }>;

  dependencies: string[];
  constraints: string[];

  scope?: {
    paths?: string[];
    collections?: string[];
    kinds?: string[];
  };

  budget?: {
    maxPlans: number;
    maxAttempts: number;
    maxDurationMs?: number;
  };

  priority?: number;
  supersedes?: string[];
};
```

Le LLM propose `key`. Le core génère l’identifiant technique stable.

### 5. Un objectif = un plan accepté dans le modèle actuel

Dans le périmètre actuel :

```text
un objectif est exécuté par un plan
un plan est atomique
un échec de plan déclenche un rollback complet
```

Conséquence :

```text
un objectif ne peut pas être partiellement acquis
```

Les statuts d’objectif sont :

```ts
type MissionObjectiveStatus =
  | "pending"
  | "running"
  | "satisfied"
  | "accepted_with_gaps"
  | "blocked"
  | "failed"
  | "superseded";
```

- `satisfied` : tous les critères et preuves sont validés.
- `accepted_with_gaps` : l’utilisateur accepte explicitement un résultat incomplet.
- `blocked` : progression impossible sans nouvelle information ou décision.
- `failed` : échec terminal de l’objectif.
- `superseded` : objectif remplacé.

`partial` n’est pas un statut d’objectif dans ce modèle.

### 6. Une tentative échouée n’est pas un acquis

Un plan rollbacké ne laisse aucune opération acquise.

La mémoire opérationnelle conserve néanmoins :

- l’erreur ;
- la contrainte découverte ;
- la stratégie échouée ;
- les opérations annulées ;
- les stratégies ayant fonctionné.

Une nouvelle tentative peut réutiliser ces enseignements sans considérer les
opérations annulées comme appliquées.

### 7. Boucle externe légère

```text
Charger la mission et vérifier la cohérence
Observer l’état de travail
Décomposer ou réviser les objectifs
Sélectionner un objectif réalisable
Exécuter runAgentLoop sur cet objectif
Enregistrer le résultat et les preuves
Réobserver
Poursuivre, suspendre ou arrêter
```

La boucle externe ne réimplémente pas :

- la planification DSL ;
- la compilation ;
- l’exécution ;
- les références ;
- le rollback.

Elle orchestre les objectifs avec les abstractions existantes.

### 8. Limites explicites

Le planner doit recevoir les limites effectives :

```text
PLAN_DSL_MAX_STEPS
MAX_SKILLS
nombre de candidats exposés
```

Ces limites doivent être cohérentes avec celles du compilateur et du catalogue
de candidats, sur le même `baseHash`.

`TOO_MANY_STEPS` est un signal de réduction du périmètre ou de création d’un
nouvel objectif, jamais une invitation à supprimer arbitrairement des étapes.

### 9. Découverte des cibles

Les candidats ne doivent pas être figés sur une demande globale.

Réutiliser le resolver, les capacités Editor V2 et les skills pour :

- rechercher par portée ;
- rechercher par page ;
- rechercher par collection ;
- rechercher par kind ;
- rechercher par libellé ;
- rechercher par relation.

Le catalogue exposé au planner doit être celui utilisé par le compilateur.
Après un checkpoint, les objets créés doivent être redécouverts dans l’état
réel, pas référencés par un `$ref` obsolète.

### 10. Preuves et satisfaction

Une preuve est rattachée à :

```text
missionId
objectiveId
attemptId
revisionId
stateHash
```

Aucun objectif ne devient `satisfied` sur simple déclaration du LLM.

La satisfaction peut combiner :

- contrôles structurels déterministes ;
- rendu observable ;
- validation sémantique ;
- validation humaine lorsque nécessaire.

Un objectif `accepted_with_gaps` doit être explicitement accepté et tracé.

### 11. Révision et adaptation

Le LLM peut renvoyer un patch de décomposition :

```ts
type ObjectivePatch = {
  add?: MissionObjective[];
  update?: Array<{ key: string; patch: Partial<MissionObjective> }>;
  remove?: string[];
  supersede?: Array<{ key: string; by: string }>;
};
```

Le core applique le patch avec les mêmes validations structurelles.

Une modification qui invalide un objectif déjà satisfait doit rouvrir cet
objectif ou le marquer `superseded`.

### 12. Budgets

Le budget de mission reste global.

Un objectif peut avoir un budget local, toujours inférieur ou égal au budget
global.

Règles :

- attente humaine exclue du temps actif ;
- budget consommé persisté ;
- nouvel objectif sans reset silencieux ;
- budget épuisé → arrêt ou reprise explicitement autorisée ;
- les retries sont comptés.

### 13. Erreurs et récupération

| Situation | Réaction |
|---|---|
| `TOO_MANY_STEPS` | Réduire le périmètre ou créer un objectif plus petit. |
| `INVALID_CANDIDATE_ID` | Redécouvrir les cibles et reconstruire le plan. |
| JSON invalide / tronqué | Retry borné ou réduction du périmètre avec diagnostic réel. |
| État obsolète | Réobserver, reconstruire sur le `baseHash` courant. |
| Contrainte partagée | Utiliser la mémoire et chercher une alternative locale autorisée. |
| Vérification indisponible | Bloquer/rollback selon ADR-0116. |
| Budget épuisé | Arrêt explicite, checkpoints conservés. |
| Résultat tardif | Rejet ; aucune mutation sur mission annulée. |

### 14. Humain

L’humain intervient pour :

- une ambiguïté réelle ;
- une décision subjective ;
- une autorisation ;
- un blocage non résoluble ;
- une acceptation `accepted_with_gaps`.

Une vérification négative correcte automatiquement ne doit pas systématiquement
déclencher une interaction.

### 15. Traçabilité et UI

L’UI distingue :

- objectif courant ;
- objectifs satisfaits ;
- objectifs bloqués ;
- objectifs remplacés ;
- preuves réellement rattachées ;
- état accepté ;
- état candidat ;
- état initial.

Aucun succès global ne doit être affiché sur la base d’un succès local seul.

### 16. Non-objectifs

- Pas de nouvelle table.
- Pas de microservice.
- Pas de nouveau stockage.
- Pas de workflow spécifique à Puzzle.
- Pas de validation sémantique déterministe des objectifs.
- Pas de `partial` au niveau objectif dans le modèle actuel.
- Pas de reset silencieux des budgets.
- Pas de publication automatique.

## Conséquences

### Positives

- Les missions longues deviennent traitables par lots.
- La décomposition reste réellement LLM-driven.
- Les objectifs restent vérifiables par des preuves.
- Les progrès validés survivent aux échecs locaux.
- Les échelles mission/objectif/plan/tentative restent distinctes.

### Négatives

- L’orchestration externe augmente la complexité.
- Une mauvaise décomposition reste possible et doit être détectée par la
  mémoire, les budgets et la vérification, pas par une validation sémantique.
- Les checkpoints partiels et l’acceptation humaine doivent être strictement
  tracés.
- La découverte globale de cibles peut nécessiter des extensions du resolver.

## Alternatives écartées

- Augmenter uniquement les budgets ou les étapes : ne résout pas la confusion
  mission/plan.
- Décomposition rigide : incompatible avec les missions évolutives.
- Validation déterministe de la pertinence des objectifs : opposée à une
  décomposition LLM-driven.
- `partial` sur un objectif à plan atomique : faux concept transactionnel.
- Multi-agents et file distribuée immédiate : complexité non démontrée.

## Mise en œuvre

1. Ajouter le contrat et l’état des objectifs dans `agentPoc`.
2. Ajouter la boucle externe minimale réutilisant `runAgentLoop`.
3. Exposer les limites DSL et aligner catalogue/compilation.
4. Ajouter les preuves et checkpoints.
5. Ajouter la découverte ciblée et l’adaptation LLM.
6. Ajouter les tests de non-régression et le benchmark.

## Invariant

```text
Le LLM décide de la décomposition.
Le core valide le contrat.
Le core exécute et rattache les preuves.
Le LLM et l’humain évaluent la satisfaction.
Une opération rollbackée n’est jamais un acquis.
```
