# 0119. Session agentique par mission utilisateur

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0109, ADR-0113, ADR-0114, ADR-0117.
- **Complète** : ADR-0113 et ADR-0114.
- **Remplace** : aucune.

## Contexte

Le POC exécutait une boucle par message utilisateur. Chaque message réinitialisait
les compteurs et ne conservait pas le dernier `Attempt`, les révisions ni le
budget de mission. Les réponses de suivi pouvaient donc être traitées comme de
nouvelles demandes.

Le serveur possède déjà `template_edit_sessions` et un champ `state` JSON.

## Décision

### 1. Réutiliser `template_edit_sessions`

Aucune nouvelle table n’est introduite.

Une session active existante devient la mission agentique.

### 2. Ajouter `agentPoc` dans le state

```ts
type AgentPocSessionState = {
  version: 1;
  goal: string;
  status: "active" | "waiting_user" | "paused" | "completed" | "cancelled";
  acceptedValues: TemplateParamValues;
  acceptedHash: string | null;
  currentRevisionId: string;
  lastAttempt: AgentAttempt | null;
  interaction: AgentInteractionRequest | null;
  messages: unknown[];
  revisions: unknown[];
  budget: {
    attemptsUsed: number;
    startedAt: string;
    aiCallsUsed: number;
  };
};
```

### 3. Continuité par défaut

Les messages suivants continuent la mission active.

Une nouvelle mission est créée uniquement :

- s’il n’existe aucune session active ;
- ou si l’utilisateur clique explicitement **Nouvelle mission**.

### 4. Budget de mission

Le budget d’itérations et de durée est porté par `agentPoc.budget`, pas par
l’exécution locale d’un message.

### 5. Révisions et reprise

Les révisions et l’état accepté sont persistés dans `agentPoc`.
Le rechargement de la page reprend l’état de mission.

### 6. Statuts

```text
active
waiting_user
paused
completed
cancelled
```

## Conséquences

- Les messages de suivi appartiennent à la même mission.
- Les budgets ne repartent plus de zéro à chaque message.
- Le dernier `Attempt` et les révisions sont conservés.
- La mission peut être reprise, suspendue ou remplacée.
- Aucun nouveau stockage ni couplage à Puzzle n’est introduit.
