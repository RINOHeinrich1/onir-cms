# 0120. Délais et annulation cohérents dans la boucle agentique

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0113, ADR-0114, ADR-0119.
- **Complète** : ADR-0113.
- **Remplace** : aucune.

## Contexte

Les délais étaient dispersés :

- client POC : 60 s pour le planner, 30 s pour la vérification ;
- provider IA : 120 s codé en dur ;
- routes : 300 s ;
- mission : 180 s codé dans la boucle.

Un dépassement de délai était traité comme une erreur inconnue, parfois suivi
d’un rollback alors qu’aucun candidat n’avait été appliqué.

## Décision

### 1. Configuration centralisée

Les délais sont configurables via :

```text
AGENT_PLAN_TIMEOUT_MS
AGENT_EXECUTE_TIMEOUT_MS
AGENT_VERIFY_TIMEOUT_MS
AGENT_EXPLAIN_TIMEOUT_MS
AGENT_MISSION_TIMEOUT_MS
AI_REQUEST_TIMEOUT_MS
```

La page POC lit cette configuration côté serveur et la transmet au client.

### 2. Distinguer les causes

```text
timeout
cancellation
network_error
business_error
```

Un timeout produit une erreur explicite avec :

- phase ;
- durée écoulée ;
- délai autorisé ;
- cause.

### 3. Annulation propagée

Le signal d’annulation client est transmis :

```text
client → route Next.js → planner/IA → fetch fournisseur
```

### 4. Résultats tardifs

Un résultat tardif ne peut plus modifier l’état courant ou la mission annulée.

### 5. Rollback conditionnel

Aucun rollback n’est exécuté si aucun candidat n’a été appliqué à l’aperçu.

### 6. Traces

Les interruptions sont tracées avec la phase, la durée, le timeout et la cause.

### 7. Statut de succès

Un message de succès ne peut être affiché que depuis une décision de succès
réelle. Un timeout ou une annulation ne doit jamais produire un statut de succès.

## Conséquences

- Les modèles de raisonnement disposent de budgets adaptés.
- Les timeouts client, serveur, fournisseur et mission sont cohérents.
- L’utilisateur voit une cause précise.
- Les missions lentes ne sont plus interrompues par un délai client arbitraire.
