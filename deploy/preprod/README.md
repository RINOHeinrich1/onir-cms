# Preprod ONIR CMS

Environnement isolé pour valider `main` avant une release de production.

## Modèle

- URL : `https://preprod-cms.onirtech.com`
- Répertoire hôte : `/opt/onir-cms-preprod`
- Landing : `https://preprod-cms.onirtech.com/` (déployée depuis `onir-cms-landing`)
- Application : routes `/login`, `/dashboard`, `/api`, `/l/...`
- Projet Compose : `onir-cms-preprod`
- App : `127.0.0.1:3200`
- PostgreSQL : `127.0.0.1:5436`
- Volumes : `onir-cms-preprod_db_data`, `onir-cms-preprod_media_data`
- Accès protégé par basic auth Nginx, `noindex`.
- Base et secrets séparés de la production.

## Flux

1. Merge sur `main`.
2. GitHub Actions construit `preprod-<sha>` et `preprod-<sha>-migrate`.
3. Déploiement SSH dans `/opt/onir-cms-preprod`.
4. Smoke tests applicatifs sur `preprod-cms.onirtech.com`.
5. La landing est déployée séparément par le workflow du dépôt `onir-cms-landing`.
6. Après validation des deux dépôts, la release `vX.Y.Z` est publiée.
7. Le déploiement production reste manuel avec approbation.

## Activation

Le workflow est désactivé tant que la variable GitHub `PREPROD_ENABLED` n'est pas à `true`.

Après le bootstrap de l'hôte :

```bash
gh variable set PREPROD_ENABLED --body true
```

## Déploiement manuel / rollback

```bash
ssh deploy-preprod@preprod-cms.onirtech.com \
  "/opt/onir-cms-preprod/deploy.sh preprod-<sha>"
```

Le tag `preprod-<sha>` est immuable : un rollback consiste à redéployer un tag précédent.

## Runner et secrets

Le job de déploiement utilise le runner self-hosted `onir-cms-preprod` (utilisateur
`deploy-preprod`, groupe `docker`). Le build reste sur `ubuntu-latest`.

Les secrets de l'environnement GitHub `preprod` sont :

- `PREPROD_BASIC_USER`
- `PREPROD_BASIC_PASSWORD`

## Données

Ne jamais copier la base de production. Utiliser une base vide et un compte admin de preprod.

La remise à zéro s’effectue avec `docker compose down -v` puis un nouveau déploiement ; les secrets applicatifs sont alors régénérés dans `app_secrets`.
