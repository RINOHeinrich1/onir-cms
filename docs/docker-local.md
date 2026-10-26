# Docker — environnement local

Cet environnement monte **l'application et PostgreSQL** dans Docker, avec un
build de type production (pas de hot reload). Il est destiné aux développeurs
qui veulent démarrer l'application sans installer Node ni PostgreSQL sur leur
machine.

Ce mode ne remplace pas un déploiement de production. Pour consommer les
images publiées sur GHCR, voir [`self-hosting.md`](self-hosting.md).

## Prérequis

- Docker avec le plugin Compose (`docker compose version`).
- Linux/macOS : `openssl` pour générer les secrets locaux.
- Windows : PowerShell (le script `docker-dev-init.ps1` n'a pas besoin d'OpenSSL).

## Démarrage rapide

```bash
git clone https://github.com/RINOHeinrich1/onir-cms.git
cd onir-cms
```

Linux / macOS :

```bash
./scripts/docker-dev-init.sh
docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d
```

Windows (PowerShell) :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\docker-dev-init.ps1
docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d
```

Ouvrir <http://localhost:3000>. Le script affiche l'email et le mot de passe du
compte administrateur initial. Ce compte subit une rotation forcée à la première
connexion.

Le premier build prend quelques minutes. Les suivants sont plus rapides grâce
au cache Docker.

## Ce que fait le démarrage

1. PostgreSQL 16 démarre et crée :
   - la base `onir_cms` ;
   - la base jetable `onir_cms_test` ;
   - l'extension `pgcrypto`.
2. Le service `migrate` attend que PostgreSQL soit prêt, applique les migrations
   puis crée le compte admin si nécessaire. Les deux opérations sont idempotentes.
3. L'application démarre après la fin des migrations, sur le port `3000`.
4. Un healthcheck appelle `/api/health` (qui vérifie aussi la base).

## Commandes utiles

```bash
# État des services
docker compose --env-file .env.docker -f docker-compose.dev.yml ps

# Logs
docker compose --env-file .env.docker -f docker-compose.dev.yml logs -f app

# Arrêt (les données sont conservées)
docker compose --env-file .env.docker -f docker-compose.dev.yml down

# Reconstruction après une modification du code ou des dépendances
docker compose --env-file .env.docker -f docker-compose.dev.yml up --build -d

# Tests unitaires
docker compose --env-file .env.docker -f docker-compose.dev.yml \
  --profile tools run --rm tools npm test

# Tests d'intégration (base de test recréée par le harnais)
docker compose --env-file .env.docker -f docker-compose.dev.yml \
  --profile tools run --rm tools npm run test:integration

# Adminer (profil facultatif) : http://localhost:8080
docker compose --env-file .env.docker -f docker-compose.dev.yml \
  --profile tools up -d adminer
```

Adminer : système `PostgreSQL`, serveur `db`, utilisateur `onir_cms`, mot de
passe `POSTGRES_PASSWORD` de `.env.docker`, base `onir_cms`.

## Variables et secrets

Le fichier `.env.docker` est généré localement et **jamais versionné**. Il
contient :

- `POSTGRES_PASSWORD`, `CONFIG_MASTER_KEY`, `SESSION_SECRET`, `LINK_TOKEN_KEY`,
  `WEBHOOK_SECRET_KEY`, `AI_PROVIDER_KEY` et `DEFAULT_ADMIN_PASSWORD`, générés
  aléatoirement ; les quatre secrets applicatifs sont ensuite gérés dans
  `/configuration` ;
- les ports et l'URL de l'application ;
- les variables IA, facultatives.

`CONFIG_MASTER_KEY` doit rester **64 caractères hexadécimaux**. Les quatre
secrets applicatifs sont ensuite gérés dans `/configuration` : leur rotation
ré-chiffre automatiquement les données dépendantes. Changer
`CONFIG_MASTER_KEY` rend tous les secrets gérés en base illisibles.

Sans `AI_API_TOKEN` / `AI_PRODUCT_ID`, l'infrastructure et l'application démarrent,
mais le chat legacy ne peut pas appeler le fournisseur. La page
`/parametres/ia` permet ensuite de configurer les fournisseurs OpenAI-compatible.

## Volumes et remise à zéro

| Volume | Contenu |
| --- | --- |
| `db_data` | Données PostgreSQL |
| `media_data` | Photos et médias importés (`/app/var/media`) |

Pour repartir d'une base vide (les médias sont aussi supprimés) :

```bash
docker compose --env-file .env.docker -f docker-compose.dev.yml down -v
```

Le prochain `up` recréera la base, appliquera les migrations et refera le seed
avec le mot de passe présent dans `.env.docker`.

## Conflits de ports

Par défaut, la stack Docker utilise `3000` (application), `5434` (PostgreSQL)
et `8080` (Adminer). Le port `5433` reste réservé au `docker-compose.yml`
historique (PostgreSQL seul), ce qui permet de faire cohabiter les deux.

Pour changer un port, modifier `.env.docker` :

```dotenv
APP_PORT=3001
POSTGRES_PORT=5435
ADMINER_PORT=8081
APP_URL=http://localhost:3001
```

Puis relancer la commande `up`.

## Dépannage

- **Le build échoue sur les types Playwright** : le build Docker installe les
  devDependencies, contrairement à un `npm run build` local sans
  `@playwright/test`.
- **Le compte admin existe déjà** : le seed est idempotent. Pour changer le mot
  de passe initial, utiliser l'interface ou repartir avec `down -v`.
- **Le chat renvoie une erreur de configuration** : renseigner `AI_API_TOKEN` et
  `AI_PRODUCT_ID` dans `.env.docker`, puis relancer `up -d`.
- **Port déjà utilisé** : ajuster `APP_PORT` / `POSTGRES_PORT` comme ci-dessus.
