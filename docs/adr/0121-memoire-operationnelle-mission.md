# 0121. Mémoire opérationnelle de mission et validation préalable

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0113, ADR-0114, ADR-0119, ADR-0120.
- **Complète** : ADR-0113 et ADR-0119.
- **Remplace** : aucune.

## Contexte

Chaque appel à `runAgentLoop` reconstruisait son contexte local. Après une
reprise de mission, l’agent conservait le budget mais perdait les erreurs,
stratégies et contraintes déjà découvertes.

Les erreurs étaient comparées uniquement à la dernière signature, ce qui ne
détectait pas les alternances d’erreurs.

Certaines mutations de collections partagées étaient refusées seulement à
l’exécution, alors que le compilateur disposait déjà des règles de portée.

## Décision

### 1. Mémoire opérationnelle compacte

La session agentique conserve :

```ts
type AgentOperationalMemory = {
  errors: Array<{
    key: string;
    signature: string;
    kind: "temporary" | "plan" | "constraint" | "state" | "fatal";
    message: string;
    count: number;
    baseHash: string;
  }>;
  recentFailures: Array<{ baseHash: string; signature: string }>;
  constraints: string[];
  failedStrategies: string[];
  successfulStrategies: string[];
  validatedOperations: string[];
  cancelledOperations: string[];
};
```

La mémoire est bornée et persistée dans `template_edit_sessions.state.agentPoc`.

### 2. Portée de la mémoire

Elle est transmise :

```text
session → runAgentLoop → planner
```

Le planner reçoit les stratégies échouées, les contraintes et les opérations
validées, sans considérer comme acquises les opérations rollbackées.

### 3. Détection des répétitions

Les erreurs sont clés par :

```text
baseHash + signature
```

Cela permet :

- de bloquer une même erreur sur le même état ;
- de détecter une alternance A/B/A/B ;
- d’autoriser une nouvelle tentative après changement d’état.

### 4. Validation préalable des collections partagées

La règle `scope = shared` est réutilisée par le compilateur.

Une mutation directe d’un élément partagé est refusée avant exécution avec :

```text
SHARED_COLLECTION_MUTATION
```

L’exécuteur conserve sa validation défensive.

### 5. Détails techniques des erreurs

Les erreurs HTTP sont conservées avec :

- phase ;
- code HTTP ;
- corps utile ;
- cause ;
- cible si disponible.

Elles ne sont plus remplacées uniquement par un message générique.

## Conséquences

- Chaque tentative enrichit réellement la suivante.
- Les reprises de mission réutilisent les erreurs et stratégies connues.
- Les cycles d’erreurs ne consomment plus tout le budget.
- Les mutations interdites échouent avant l’exécution.
- Les erreurs restent diagnosticables sans exposer d’identifiants à l’utilisateur.
