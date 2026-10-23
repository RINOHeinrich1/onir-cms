# ADR-0001 — Socle Next.js 16 App Router + TypeScript strict

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Contexte** : Nouveau dépôt `onir-cms` (greenfield). Le projet s'appuie sur
  Next.js App Router + TypeScript strict et sur un référentiel d'architecture
  imposant des modules petits et lisibles.

## Décision

1. **Next.js 16 (App Router)** avec le répertoire source `src/`.
2. **TypeScript strict** : `strict`, `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, alias `@/*` → `./src/*`.
3. **Node 22 obligatoire** (`.nvmrc` = `22`) : le Node 20 système est insuffisant.
4. **Biome** (lint + format, 2 espaces / 100 colonnes, quotes doubles) — pas d'ESLint.
5. **Vitest** pour les tests unitaires.

## Conséquences

- Socle homogène avec le site vitrine, onboarding facilité.
- `npm run typecheck` = `next typegen && tsc --noEmit`.
- Les plans suivants s'appuient sur cette fondation sans la rediscuter.
