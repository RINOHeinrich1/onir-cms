# ADR-0005 — Matrice de rôles centralisée `can(role, action)`

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Contexte** : US-ROLES-001 / RM-ROLE-* définissent trois rôles
  (`admin`, `marketeur`, `lecteur`). Sans source unique, les vérifications
  d'autorisation se dispersent et divergent entre API et UI.

## Décision

1. Une **matrice unique** dans `src/domain/rbac.ts` : `can(role, action)` et
   `actionsFor(role)`.
2. Rôles :
   - `admin` : toutes les actions.
   - `marketeur` : tout **sauf** l'administration des utilisateurs (`users:*`).
   - `lecteur` : **lecture seule** (`dashboard:view`, `prospects:list/read`,
     `project:read`).
3. Application **côté serveur** : `assertCan(actor, action)` dans les cas d'usage
   (autorité), `requireRole(request, action)` dans les route handlers, et filtre
   de navigation (`DashboardNav`).
4. Toute nouvelle action est ajoutée à l'union `Action` **et** à la matrice, puis
   couverte par un test.

## Conséquences

- Une seule vérité d'autorisation, testée et réutilisée par l'API et l'UI.
- L'ajout d'un rôle exige une évolution explicite de la matrice (revue humaine).
