# 0117. Contexte conversationnel transmis au planner agentique

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0110, ADR-0111, ADR-0112, ADR-0113, ADR-0114.
- **Complète** : ADR-0114.
- **Remplace** : aucune.

## Contexte

Le chat de l’éditeur agentique conserve les demandes et réponses dans l’UI.
Cependant, la route de planification ne recevait que la demande courante,
l’état courant, l’observation et le dernier `Attempt`.

Les demandes de suivi devenaient donc ambiguës :

- « je ne vois rien quand j’ouvre Services » ;
- « la page Services que j’ai demandée » ;
- « je te laisses corriger ».

Le planner ne savait pas à quel échange précédent ces phrases faisaient
référence. Le moteur possédait déjà `PlanTemplateEditInput.history` et
`formatTemplateEditHistory()`, mais le POC ne les alimentait pas.

## Décision

### 1. Historique conversationnel explicite

L’UI construit une liste :

```ts
type TemplateEditHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};
```

Elle contient les messages précédents, sans les traces techniques.

### 2. La demande courante n’est pas dupliquée

Avant d’envoyer la requête :

```text
history = messages avant l’ajout de la demande courante
request = demande courante
```

Le planner reçoit donc :

```text
history + request
```

et non :

```text
history + request + request
```

### 3. Transmission serveur

La route `POST /agent-poc/plan` :

- valide `history` ;
- conserve uniquement `role` et `content` ;
- borne la taille ;
- transmet l’historique à `planTemplateEdit`.

### 4. Rôle de l’historique

L’historique sert à :

- résoudre les références conversationnelles ;
- comprendre les corrections ;
- retrouver la page ou l’élément dont parle l’utilisateur ;
- éviter de recréer un élément déjà demandé.

Il ne remplace pas :

- l’état `committed` ;
- l’observation courante ;
- le dernier `Attempt` ;
- les logs techniques.

### 5. Pas de nouvelle architecture

Aucun nouveau stockage serveur n’est introduit.
L’historique est celui de la session de chat courante.
La persistance serveur des conversations reste hors périmètre de cet ADR.

## Conséquences

- Les demandes de suivi deviennent compréhensibles par le planner.
- Les corrections ne sont plus traitées comme des demandes isolées.
- Les traces techniques restent dans l’UI et ne polluent pas le contexte IA.
- Le moteur agentique et les templates ne sont pas modifiés.

## Tests attendus

- L’historique est transmis à `planTemplateEdit`.
- La demande courante n’est pas dupliquée.
- L’historique ne contient pas les traces techniques.
- Une demande de suivi peut référencer une demande précédente.
