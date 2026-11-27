# Plan — Orchestration adaptative des missions agentiques

- **Date** : 2026-11-27
- **Référence** : ADR-0122, ADR-0119, ADR-0120, ADR-0121.
- **Objectif** : intégrer une orchestration mission → objectifs → plans, sans nouvelle table et sans couplage à un template.
- **Principe** : la décomposition est LLM-driven ; le core ne valide que le contrat, les références, les budgets et les preuves.

## Lots

### Lot 0 — Socle de contrat

Statut : fait.

- types `MissionDecomposition`, `MissionObjective`, `MissionProgress` ;
- validation structurelle ;
- statuts objectif sans `partial` ;
- tests de contrat ;
- ADR-0122.

### Lot 1 — Décomposition IA

Statut : fait.

Fichiers :
- `src/application/use-cases/visual-templates/agent-poc/decompose-mission.ts`
- `src/app/api/links/[id]/agent-poc/decompose/route.ts`
- tests dédiés.

Contenu :
- prompt de décomposition ;
- contexte : objectif global, contraintes, historique, observation, mémoire, budget ;
- sortie JSON `MissionDecomposition` ;
- validation par `validateMissionDecomposition` ;
- aucune interprétation sémantique déterministe ;
- aucun ID technique inventé ;
- retour des erreurs structurelles exploitables.

Tests :
- décomposition valide ;
- clé dupliquée ;
- cycle ;
- preuve manquante ;
- budget invalide ;
- objectif vague accepté si le contrat est valide.

### Lot 2 — État de mission persisté

Statut : fait.

Fichiers :
- `agent-session.ts`
- `mission-objective.ts`
- route session POC
- tests.

Contenu :
- `createMissionProgress()` ;
- initialisation des objectifs à `pending` ;
- conservation de l’objectif global et des contraintes ;
- persistance dans `agentPoc.missionProgress` ;
- reprise sans perte ;
- transitions de statut contrôlées par le core.

Tests :
- création d’une progression ;
- reprise après session ;
- objectif `satisfied` sans preuve refusé ;
- objectif `accepted_with_gaps` uniquement avec validation humaine.

### Lot 3 — Boucle externe minimale

Statut : à faire.

Contenu :
- sélectionner un objectif exécutable ;
- appeler `runAgentLoop` sur son objectif ;
- enregistrer le résultat, la preuve, la révision et la mémoire ;
- passer à l’objectif suivant ;
- gérer les dépendances ;
- ne jamais réinitialiser le budget de mission.

### Lot 4 — Récupération et erreurs

Statut : à faire.

Contenu :
- `TOO_MANY_STEPS` → réduction d’objectif ;
- `INVALID_CANDIDATE_ID` → redécouverte ;
- état obsolète → réobservation ;
- contrainte partagée → mémoire ;
- vérification indisponible → blocage/rollback ;
- cycles inter-objectifs.

### Lot 5 — Preuves et checkpoints

Statut : à faire.

Contenu :
- preuves rattachées à `missionId`, `objectiveId`, `attemptId`, `revisionId`, `stateHash` ;
- checkpoint interne non publié ;
- distinction état initial / état accepté / candidat ;
- `accepted_with_gaps` humain ;
- invalidation d’un acquis après régression.

### Lot 6 — UI objectifs

Statut : à faire.

Contenu :
- liste des objectifs et statuts ;
- objectif courant ;
- preuve et révision ;
- reprise ;
- aucune confusion avec la publication.

### Lot 7 — Limites et découverte

Statut : à faire.

Contenu :
- exposer `PLAN_DSL_MAX_STEPS` au planner ;
- même catalogue exposé/compilé sur le même `baseHash` ;
- recherche ciblée par page, collection, kind, libellé ;
- redécouverte après checkpoint ;
- `MAX_SKILLS = 3` par planification.

### Lot 8 — Validation globale et benchmark

Statut : à faire.

Contenu :
- vérification de mission ;
- tests de non-régression ;
- benchmark STUDIO NORD ;
- métriques : objectifs satisfaits, plans rejetés, erreurs répétées, appels IA, tokens, temps actif, interventions humaines.

## Ordre d’exécution

```text
Lot 1
Lot 2
Lot 3
Lot 4
Lot 5
Lot 6
Lot 7
Lot 8
```

## Invariants

- Une opération rollbackée n’est jamais un acquis.
- Une mission peut avoir plusieurs plans.
- Un objectif ne peut pas être `partial` dans le modèle actuel.
- Le LLM décompose ; le core valide le contrat et exécute.
- Aucune publication automatique.
- Aucun couplage à Puzzle dans le core.
