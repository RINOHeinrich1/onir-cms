# ADR-0002 — Architecture en couches (domain / application / infrastructure)

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Contexte** : Le référentiel backend Onirtech impose une architecture en
  couches avec ports & adapters et une règle de dépendance descendante. La
  maintenabilité pour relecture humaine est un critère d'acceptation.

## Décision

Organisation par responsabilité :

- `src/domain/` — modèle métier pur (`User`, rôles RBAC, hachage) sans
  dépendance au framework ni à la base.
- `src/application/` — cas d'usage et **ports** (interfaces de dépôt). Aucun
  import d'infrastructure.
- `src/infrastructure/` — adapters concrets (Pool `pg`, dépôts SQL, cookies).
- `src/app/` — adapters entrants (route handlers, pages, middleware).
- `src/lib/` — utilitaires transverses (`env`, `rate-limit`).

**Règle de dépendance** : `app` → `application` → `domain` ;
`infrastructure` implémente les ports de `application`. Le domaine ne dépend de rien.

## Conséquences

- Les cas d'usage sont testables avec des dépôts en mémoire (injection).
- Un changement de base ne touche que `src/infrastructure/db/`.
