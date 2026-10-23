# ONIR CMS

**ONIR CMS** est un CMS open source de prospection et de conversation assistée par IA.
Il permet de créer des liens de chat publics, de collecter des informations qualifiées,
de générer des fiches de prospection et de piloter plusieurs organisations depuis une
même instance.

Le projet est publié sous licence **MIT**. Le cœur est ouvert et autonome ; des modules
premium pourront être développés séparément dans un dépôt privé.

> **Statut : alpha (`0.x`).** L'API, le schéma de base de données et le format des
> templates peuvent encore évoluer. Les changements incompatibles sont documentés dans
> les release notes.

## Fonctionnalités

- **Liens de chat publics** : liens spécifiques ou standard, jetons chiffrés, expiration,
  révocation, consentement du visiteur et reprise de conversation.
- **Modèles de raisonnement** : comportements de prospection stockés en base, avec un mode
  simple (prompt et fiche générés) et un mode expert.
- **Fiches de prospection** : collecte guidée, génération Markdown, export PDF.
- **Sources de connaissances** : base de connaissances, photothèque et liens activables
  par lien de chat.
- **Fournisseurs IA OpenAI-compatible** : clés chiffrées, catalogue de modèles, modèle par
  défaut et affectation par lien.
- **Multitenancy** : organisations, memberships, rôles et isolation des données.
- **Templates visuels** : packages UI, SDK JavaScript et template immersif 3D.
- **Documentation intégrée** : guides d'installation, SDK et création de templates.

## Stack

- Next.js 16 (App Router), React 19, TypeScript strict
- PostgreSQL 16, SQL brut via `pg`
- Tailwind CSS 4
- Biome, Vitest, Playwright
- Node.js 22

## Démarrage rapide

### Docker (recommandé)

Prérequis : Docker avec le plugin Compose, Git et OpenSSL.

```bash
git clone https://github.com/RINOHeinrich1/onir-cms.git
cd onir-cms
./scripts/docker-dev-init.sh
docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d
```

Ouvrir <http://localhost:3000>. Le script génère les secrets locaux et affiche le mot de
passe du compte administrateur initial. Ce mot de passe doit être changé à la première
connexion.

Détails : [`docs/docker-local.md`](docs/docker-local.md).

### Développement local avec Node.js

```bash
npm ci
cp .env.example .env
# Renseigner DATABASE_URL, SESSION_SECRET, LINK_TOKEN_KEY et les clés IA si nécessaire.
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Le compte admin par défaut est créé avec une rotation forcée à la première connexion.

## Configuration

Les variables sont documentées dans [`.env.example`](.env.example). Les principales :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL |
| `SESSION_SECRET` | Signature des sessions |
| `LINK_TOKEN_KEY` | Chiffrement des jetons de liens (64 caractères hex, 32 octets) |
| `AI_PROVIDER_KEY` | Chiffrement des clés fournisseurs IA (64 caractères hex, 32 octets) |
| `DEFAULT_ADMIN_EMAIL` | Compte admin initial |
| `DEFAULT_ADMIN_PASSWORD` | Mot de passe initial, à changer immédiatement |
| `APP_URL` | URL publique de l'instance |
| `MEDIA_DIR` | Stockage persistant des médias |

Ne jamais committer de secret. Utilisez `openssl rand -hex 32` pour générer les clés.

## Tests et qualité

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:e2e        # nécessite Playwright et une base de test
```

Les tests d'intégration refusent toute base dont le nom ne contient pas `test`.

## Auto-hébergement et images

Les releases publient deux images sur GitHub Container Registry :

- `ghcr.io/rinoheinrich1/onir-cms:<version>`
- `ghcr.io/rinoheinrich1/onir-cms:<version>-migrate`

Guide complet : [`docs/self-hosting.md`](docs/self-hosting.md).

## Architecture

```
src/
  domain/           # métier pur, entités, règles, erreurs
  application/      # cas d'usage et ports
  infrastructure/   # PostgreSQL, stockage, IA, migrations
  app/              # routes et pages Next.js
  components/       # UI
packages/           # SDK et générateur de templates
template-kit/       # starter-kit, templates visuels et outillage
docs/               # documentation et ADR
```

La règle de dépendance est `app → application → domain`. L'infrastructure implémente
les ports de l'application. Les décisions d'architecture sont dans
[`docs/adr/`](docs/adr/).

## Versionnement

- SemVer, releases taguées `vX.Y.Z`.
- `main` protégée, PR obligatoire, CI obligatoire.
- Conventional Commits et release-please.
- Migrations de base de données immuables.
- Les images Docker sont versionnées ; `latest` suit la dernière release stable.

## Roadmap

Voir [`ROADMAP.md`](ROADMAP.md).

## Contribuer

Les contributions externes sont bienvenues. Merci de lire
[`CONTRIBUTING.md`](CONTRIBUTING.md) et le
[`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

Les commits doivent être signés avec le **Developer Certificate of Origin** :

```bash
git commit -s -m "feat: ..."
```

## Sécurité

Merci de ne pas ouvrir d'issue publique pour une vulnérabilité. Voir
[`SECURITY.md`](SECURITY.md).

## Licence et marque

Le code de ce dépôt est distribué sous licence **MIT** — voir [`LICENSE`](LICENSE).
Les dépendances et assets tiers conservent leurs licences respectives ; voir
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

La licence MIT ne concède aucun droit sur les marques, noms commerciaux ou logos
« ONIRTECH » / « ONIR CMS ». Voir [`TRADEMARK.md`](TRADEMARK.md).

Les contenus de démonstration et les prompts fournis sont des exemples : adaptez-les à
votre instance avant une mise en production.
