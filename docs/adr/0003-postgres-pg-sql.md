# ADR-0003 — PostgreSQL dédié via `pg` et SQL brut

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Contexte** : RM-DATA-001 exige une persistance PostgreSQL **dédiée** (le
  cluster de l'orchestrateur occupe déjà 5432). Le schéma est simple (users,
  sessions) ; un ORM n'apporte pas de valeur et masquerait le SQL.

## Décision

1. Conteneur **PostgreSQL 16** dédié (`docker-compose.yml`), port hôte **5433**,
   volume `onirtech_pgdata`, base `onir_cms`.
2. Accès via le driver **`pg`** (`Pool` singleton `getPool()`) et **SQL brut**
   paramétré (`$1`, `$2`, …) — jamais de concaténation de valeurs.
3. **Migrations** en SQL versionné (`src/infrastructure/db/migrations/NNNN_*.sql`),
   appliquées de façon idempotente par `npm run db:migrate` (table
   `schema_migrations`). Une migration appliquée est **immuable** : toute
   évolution crée un nouveau fichier.
4. **Seed** du compte admin par défaut (`npm run db:seed`), mot de passe haché.

## Conséquences

- Le SQL est lisible et indexable en revue ; pas de code généré.
- Les dépôts (`pgUserRepository`, `pgSessionRepository`) respectent les ports.
