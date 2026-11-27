# 0116. Cohérence transactionnelle de l’aperçu candidat

- **Statut** : Proposé
- **Date** : 2026-11-27
- **Référence** : ADR-0113, ADR-0114.
- **Complète** : ADR-0113.
- **Remplace** : aucune.

## Contexte

Une exception pendant `observeCandidate` ou `verify` pouvait interrompre la
boucle après application du candidat sans restaurer l’aperçu. L’état de
référence, l’état candidat et le journal transactionnel pouvaient alors diverger.

## Décision

### 1. Les phases post-application sont transactionnelles

Dès qu’un candidat peut être appliqué à l’aperçu, toute exception déclenche une
tentative de restauration de l’état de référence.

### 2. Échec dur vs vérification indisponible

- exécution/validation invalide → rollback puis poursuite éventuelle ;
- observation ou vérification indisponible → rollback puis arrêt `blocked` ;
- objectif non satisfait → candidat conservé, attente utilisateur.

### 3. Rollback impossible

Si la restauration échoue, la boucle s’arrête avec :

```text
status = inconsistent
initialError
rollbackError
transactionStatus = inconsistent
```

Aucune nouvelle tentative n’est autorisée sur cet état.

### 4. Conservation de l’erreur initiale

L’erreur initiale et l’erreur de rollback sont toutes deux conservées dans le
résultat, le journal et l’`Attempt`.

### 5. Attente utilisateur

L’attente de validation humaine reste un état volontaire :

```text
transactionStatus = applied
status = awaiting_user_input
```

Aucun rollback automatique n’est effectué.

## Conséquences

- Aucun chemin ne laisse silencieusement l’aperçu et l’état de référence
  incohérents.
- Une vérification IA indisponible ne devient pas un faux échec fonctionnel.
- Un rollback échoué est visible et bloque toute reprise dangereuse.
- Le candidat peut rester affiché pour une décision humaine.
