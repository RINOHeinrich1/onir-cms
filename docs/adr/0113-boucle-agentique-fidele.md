# 0113. Boucle agentique fidèle pour l’édition IA de l’interface de template

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0109, ADR-0110, ADR-0111, ADR-0112.
- **Complète** : ADR-0111 et ADR-0112.
- **Remplace** : aucune.

## Objectif

Mettre en place une véritable boucle agentique pour le traitement de l’interface
de template par IA : observer, décider, agir, vérifier, puis committer ou
rollbacker.

Le POC d’édition assistée est la première implémentation de cette boucle. Le
modèle doit rester transposable à l’édition de l’interface de template en
général.

## Contexte

Le POC d’édition assistée exécutait un plan, appliquait le candidat à l’aperçu,
puis vérifiait l’objectif. Cette boucle courte ne distinguait pas :

- une étape exécutée avec succès ;
- une étape réellement conservée dans l’état `committed` ;
- un candidat appliqué puis annulé par rollback.

Un cas concret a mis ce défaut en évidence : la suppression d’une page et de son
entrée de menu réussissait, mais laissait une action pointant vers la page
supprimée. La validation référentielle globale rejetait ensuite le candidat.
Le planner recevait seulement le plan précédent et un message d’erreur, sans
savoir quelles étapes avaient réussi, ni qu’elles avaient été rollbackées.

Le risque est qu’un prochain essai considère ces étapes comme déjà acquises alors
qu’elles ne le sont pas.

## Décision

### 1. Séparer les phases

La boucle devient explicitement :

```text
Observation initiale
→ Pensée
→ Action
→ Observation
→ Décision
→ Commit final
```

- **Observation initiale** : état `committed`, rendu réel, contrats, hash.
- **Pensée** : construit un plan depuis l’état `committed`.
- **Action** : compile et exécute sur un état candidat, sans commit.
- **Observation** : vérifie rendu, postconditions, références et objectif.
- **Décision** : commit, rollback, clarification, attente utilisateur, arrêt.

### 2. Matérialiser chaque tentative par un `Attempt`

```ts
type AgentAttempt = {
  attemptId: string;
  baseHash: string;
  candidateHash: string | null;
  committedHash: string;
  transactionStatus: "applied" | "rolled_back" | "committed";
  steps: AgentAttemptStep[];
  referenceErrors: string[];
  postconditions: AgentAttemptPostcondition[];
  errors: string[];
  planRaw: unknown;
};
```

Chaque étape expose :

```ts
type AgentAttemptStep = {
  stepId: string;
  status: "success" | "failed" | "skipped";
  effect: "applied_to_candidate" | "rolled_back" | "committed" | "not_applied";
  replayRequired: boolean;
  error: string | null;
  operation: unknown;
  itemId: string | null;
};
```

### 3. Les succès d’un candidat rollbacké ne sont pas acquis

Après un échec :

```text
currentState = baseState
committedHash = baseHash
transactionStatus = rolled_back
effect = rolled_back
replayRequired = true
```

Le planner reçoit le dernier `Attempt` comme **diagnostic**, avec la règle
explicite que les étapes `replayRequired` doivent être rejouées si nécessaire.

### 4. Commit uniquement après validation complète

Un candidat n’est conservé que si :

- exécution sans erreur ;
- références valides ;
- postconditions satisfaites ;
- puis vérification sémantique satisfaite **ou** validation explicite de
  l’utilisateur après un désaccord sémantique.

Le commit met à jour :

```text
committedHash = candidateHash
transactionStatus = committed
```

### 5. Arrêt sur non-progression

La boucle s’arrête si :

- le même plan est proposé sur le même `baseHash` ;
- la même erreur se répète ;
- la durée maximale est dépassée ;
- le budget d’itérations est épuisé.

### 6. Validation utilisateur sur désaccord sémantique

Un rollback automatique est réservé aux **échecs durs** :

- compilation ;
- opération ;
- référence ;
- contrat ;
- postcondition structurelle ;
- exception.

Si toutes les étapes sont exécutées sans erreur, que les contrôles
déterministes passent, mais que la vérification sémantique IA répond
`non satisfait`, le candidat reste appliqué :

```text
transactionStatus = applied
status = awaiting_user_decision
```

L’utilisateur voit alors :

- les étapes réussies ;
- le rendu candidat ;
- l’observation de l’IA ;
- les éventuelles erreurs.

Il peut choisir :

```text
Garder   → commit du candidat
Corriger → rollback puis nouvelle pensée
Annuler  → rollback
```

La vérification IA est donc un **avis**, pas une décision de rollback.

## Conséquences

- Les étapes réussies sont traçables sans être confondues avec un état acquis.
- Le planner dispose du diagnostic réel de l’essai précédent.
- Les suppressions relationnelles incomplètes sont détectées avant commit.
- Les rollbacks ne peuvent plus être interprétés comme des succès persistants.
- Le POC possède un modèle de tentative réutilisable pour une future
  généralisation hors POC.
