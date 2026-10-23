# Auto-hébergement

Ce guide décrit une installation Docker à partir des images publiées. Pour le
développement local, voir [`docker-local.md`](docker-local.md).

## Prérequis

- Docker Engine et le plugin Compose
- OpenSSL
- Un nom de domaine et un reverse proxy TLS si l'instance est exposée sur Internet
- PostgreSQL est fourni par le Compose de release ; une base externe est aussi possible

## Images publiées

Chaque release `vX.Y.Z` publie :

| Image | Rôle |
| --- | --- |
| `ghcr.io/rinoheinrich1/onir-cms:X.Y.Z` | Application Next.js |
| `ghcr.io/rinoheinrich1/onir-cms:X.Y.Z-migrate` | Migrations et seed PostgreSQL |

Les packages GHCR sont publics après la première publication si leur visibilité a été
réglée sur **Public** dans GitHub → Packages. Si le package est privé :

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u RINOHeinrich1 --password-stdin
```

## Installation

```bash
git clone https://github.com/RINOHeinrich1/onir-cms.git
cd onir-cms
cp .env.release.example .env.release
```

Générer les secrets :

```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # LINK_TOKEN_KEY
openssl rand -hex 32   # AI_PROVIDER_KEY
openssl rand -hex 16   # POSTGRES_PASSWORD
```

Renseigner `.env.release` :

- `ONIR_CMS_VERSION` : version sans le préfixe `v` (ex. `0.1.0`)
- `POSTGRES_PASSWORD` : mot de passe fort
- `SESSION_SECRET`, `LINK_TOKEN_KEY`, `AI_PROVIDER_KEY`
- `DEFAULT_ADMIN_EMAIL`, `DEFAULT_ADMIN_PASSWORD`
- `APP_URL` : URL publique HTTPS de l'instance
- éventuellement `AI_API_TOKEN`, `AI_PRODUCT_ID`, `AI_MODEL`

Démarrer :

```bash
docker compose --env-file .env.release -f docker-compose.release.yml pull
docker compose --env-file .env.release -f docker-compose.release.yml up -d
```

Le service `migrate` applique le schéma et crée le compte administrateur initial avant le
démarrage de l'application. Vérifier :

```bash
curl http://127.0.0.1:3000/api/health
docker compose --env-file .env.release -f docker-compose.release.yml ps
```

Le compte admin doit changer son mot de passe à la première connexion.

## Reverse proxy et TLS

Exemple nginx générique, à adapter à votre domaine et à votre certificat :

```nginx
server {
  listen 443 ssl http2;
  server_name cms.example.com;

  ssl_certificate     /etc/letsencrypt/live/cms.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/cms.example.com/privkey.pem;

  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 90s;
  }
}
```

Ne publiez que le port 80/443 du reverse proxy. L'application et PostgreSQL restent sur
la boucle locale ou un réseau Docker privé.

## Mise à jour

1. Sauvegarder la base et les médias.
2. Modifier `ONIR_CMS_VERSION` dans `.env.release`.
3. Télécharger les nouvelles images.
4. Relancer le Compose : le service de migration s'exécute avant l'application.

```bash
docker compose --env-file .env.release -f docker-compose.release.yml pull
docker compose --env-file .env.release -f docker-compose.release.yml up -d
```

Lire les release notes avant toute montée de version. Les migrations sont additives ;
aucun rollback SQL automatique n'est fourni.

## Sauvegarde et restauration

Les volumes du Compose de release contiennent PostgreSQL et les médias. Sauvegarder les
deux avant chaque mise à jour :

```bash
docker compose --env-file .env.release -f docker-compose.release.yml stop app
docker run --rm \
  -v onir-cms_db_data:/db \
  -v "$PWD/backups":/backup \
  alpine tar czf /backup/db-$(date +%F).tgz -C /db .
docker run --rm \
  -v onir-cms_media_data:/media \
  -v "$PWD/backups":/backup \
  alpine tar czf /backup/media-$(date +%F).tgz -C /media .
docker compose --env-file .env.release -f docker-compose.release.yml start app
```

Vérifier les noms de volumes avec `docker volume ls` : ils dépendent du nom de projet
Compose.

## Sécurité

- Utiliser des secrets longs et uniques, jamais les valeurs d'exemple.
- Garder `.env.release` hors du dépôt et avec des permissions restrictives (`chmod 600`).
- Terminer TLS au reverse proxy et forcer HTTPS.
- Restreindre l'accès à PostgreSQL.
- Sauvegarder avant chaque migration.
- Mettre à jour les images et les dépendances régulièrement.
- Signaler les vulnérabilités selon [`../SECURITY.md`](../SECURITY.md).

## Désinstallation

```bash
docker compose --env-file .env.release -f docker-compose.release.yml down
```

Cette commande conserve les volumes. Pour supprimer définitivement les données, supprimer
explicitement les volumes après sauvegarde.
