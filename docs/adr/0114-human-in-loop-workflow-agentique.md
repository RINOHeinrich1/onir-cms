# 0114. Human-in-loop dans la boucle agentique d’édition de template

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0109, ADR-0110, ADR-0111, ADR-0112, ADR-0113.
- **Complète** : ADR-0113.
- **Remplace** : aucune.

## Objectif

Intégrer l’utilisateur comme acteur explicite de la boucle agentique :
clarification de demande, confirmation de résultat, choix entre options et
instructions de correction.

L’objectif est de sortir du seul trio `Garder / Corriger / Annuler` et de
permettre à l’utilisateur de préciser **ce qu’il faut corriger**.

## Contexte

La boucle de l’ADR-0113 sépare correctement :

```text
Observation initiale → Pensée → Action → Observation → Décision → Commit
```

Mais l’interaction humaine reste pauvre :

- la Pensée ne peut pas demander de clarification ;
- l’Observation ne peut pas demander de confirmation ;
- “Corriger” ne transporte aucune instruction utilisateur ;
- l’utilisateur ne peut pas choisir parmi des interprétations.

## Décision

### 1. L’interaction est un état explicite de la boucle

```text
awaiting_user_input
```

Pendant cet état :

- le candidat reste `applied` ;
- aucun commit ;
- aucun rollback automatique.

### 2. Deux points d’entrée

#### Pensée — ambiguïté de demande

La Pensée peut demander une interaction si :

- la cible est ambiguë ;
- la portée est ambiguë ;
- une information est manquante ;
- l’action est risquée ;
- la demande n’est pas supportée par le template.

#### Observation — ambiguïté de résultat

L’Observation peut demander une interaction si :

- l’IA n’est pas certaine du résultat ;
- plusieurs résultats sont acceptables ;
- un effet de bord est détecté ;
- une correction est nécessaire ;
- une confirmation utilisateur est requise.

### 3. Contrat d’interaction

```ts
type AgentInteractionRequest = {
  id: string;
  sourcePhase: "thought" | "observation";
  kind: "clarification" | "confirmation" | "choice" | "correction" | "missing";
  question: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
    value?: unknown;
  }>;
  allowFreeText: true;
  context?: unknown;
};

type AgentInteractionResponse = {
  requestId: string;
  optionId?: string;
  text?: string;
};
```

L’utilisateur peut toujours choisir une option **ou** fournir sa propre réponse.

### 4. Décision après interaction

- **Garder** → commit ;
- **Choisir une option** → nouvelle Pensée avec cette contrainte ;
- **Corriger avec texte** → nouvelle Pensée avec l’instruction utilisateur ;
- **Continuer sur le candidat** → prochain essai à partir du candidat ;
- **Annuler** → rollback vers `baseHash`.

### 5. Règle de placement

```text
Ambiguité de demande  → Pensée
Ambiguité de résultat → Observation
Décision de validation → Utilisateur
Échec dur              → Rollback automatique
```

L’observation initiale fournit seulement les faits et les ambiguïtés factuelles.
Elle ne pose pas de question à l’utilisateur.

### 6. États

```text
observing_initial
thinking
awaiting_user_input
acting
observing
deciding
awaiting_user_decision
committed
rolled_back
blocked
failed
```

### 7. Commit final

Un candidat est conservé uniquement si :

- postconditions OK ;
- références OK ;
- objectif atteint ;
- ou validation explicite de l’utilisateur.

```text
committedHash = candidateHash
transactionStatus = committed
```

## Conséquences

- L’utilisateur peut préciser une correction au lieu d’un simple bouton.
- Les ambiguïtés de demande sont traitées avant exécution.
- Les ambiguïtés de résultat sont traitées sans rollback automatique.
- Le candidat reste visible et appliqué pendant l’attente.
- La décision humaine est traçable dans la boucle.
- La boucle reste compatible avec le modèle `Attempt` de l’ADR-0113.
