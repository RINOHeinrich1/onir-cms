# 0037. Environnements de préproduction, runners et cadence de release

- **Statut** : Accepté
- **Date** : 2026-10-26
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0002 (architecture en couches) et ADR-0036
  (secrets applicatifs). Concerne les workflows `Preprod`, `Release` et
  `onir-cms-landing`.

## Contexte

La préproduction existait mais était inutilisable comme environnement de
validation :

- application en `0.3.0`, schéma arrêté à la migration `0039` ;
- pipeline `Preprod` désactivé (`PREPROD_ENABLED=false`) ;
- secrets encore portés par l'environnement, sans `CONFIG_MASTER_KEY` ;
- landing page séparée de l'application, sans déploiement preprod dédié.

La production est déployée manuellement après publication d'un tag. Le build
release construisait l'application en `linux/amd64` et `linux/arm64` : le build
arm64 via QEMU représentait l'essentiel des ~11 minutes de release, alors que
l'hôte de production est `x86_64`.

Le flux souhaité est : développer dans le workspace, valider sur preprod,
puis seulement publier/déployer en production.

## Décision

### 1. Rôles des environnements

- **Local / CI** : développement, lint, types, tests, build.
- **Preprod** : environnement d'intégration jetable, redéployé depuis `main`.
- **Production** : uniquement des releases taguées, déploiement manuel.

`main` est la branche d'intégration. Chaque merge sur `main` déploie la
preprod. La production ne reçoit jamais un commit `main` non tagué.

### 2. Préproduction isolée

La preprod est remise à zéro (volumes supprimés) et possède :

- sa propre base PostgreSQL, sans copie brute de la production ;
- son propre `CONFIG_MASTER_KEY` et ses propres secrets `app_secrets` ;
- un accès protégé par Basic Auth et `noindex` ;
- des sauvegardes avant toute remise à zéro.

Les données de production ne sont jamais restaurées telles quelles. Si des
données réalistes deviennent nécessaires, elles devront être anonymisées.

### 3. Landing et application séparées, même hôte preprod

La landing reste un dépôt et un déploiement distincts (`onir-cms-landing`).
Pour éviter d'ajouter un DNS et un certificat, la preprod utilise un seul
hôte, `preprod-cms.onirtech.com` :

- `/` et les fichiers statiques sont servis depuis
  `/var/www/onir-cms-landing-preprod` ;
- les routes applicatives absentes du statique (`/login`, `/dashboard`,
  `/api`, `/l/...`, etc.) sont proxyfiées vers `127.0.0.1:3200` via un
  fallback Nginx `@app` ;
- les liens de la landing vers `cms-backoffice.onirtech.com` sont réécrits
  vers l'application preprod.

La production conserve sa séparation d'hôtes :
`cms.onirtech.com` (landing) et `cms-backoffice.onirtech.com` (application).
Un DNS dédié à la landing preprod pourra être ajouté plus tard sans changer
le dépôt.

### 4. Déploiement sans SSH entrant

Les déploiements preprod utilisent des runners GitHub Actions self-hosted :

- `onir-cms-preprod` pour l'application ;
- `onir-landing-preprod` pour la landing.

Ils s'exécutent sous l'utilisateur `deploy-preprod` (groupe `docker`) et
appellent les scripts locaux :

- `/opt/onir-cms-preprod/deploy.sh <tag>` ;
- `/opt/onir-cms-landing-preprod/deploy/preprod.sh`.

Le build applicatif reste sur `ubuntu-latest` ; seul le job de déploiement
utilise le runner self-hosted. Aucun port SSH n'est ouvert à GitHub Actions.
Les secrets GitHub restants pour la preprod sont uniquement les identifiants
Basic Auth du smoke test.

### 5. Images de release amd64 par défaut

La production est `linux/amd64`. Les images de release sont donc construites
par défaut pour cette seule architecture :

- application et migrations : `platforms: linux/amd64` ;
- QEMU n'est exécuté que si `arm64` est explicitement demandé ;
- le multiarch reste disponible via `workflow_dispatch` avec
  `linux/amd64,linux/arm64`.

Le build arm64 n'est plus dans le chemin normal de release.

### 6. Cadence de release

1. Merge sur `main`.
2. Build et déploiement preprod automatiques.
3. Validation fonctionnelle sur la preprod.
4. Merge de la PR release-please.
5. Tag `vX.Y.Z`, build release, puis déploiement production manuel.

Les petites corrections sont regroupées dans une release plutôt que
déployées une par une en production. Le déploiement production reste une
décision explicite.

## Conséquences

### Positives

- La preprod devient un vrai filet de sécurité avant la production.
- Le déploiement preprod ne dépend plus d'un accès SSH entrant.
- Le build release passe d'environ 11 minutes à un ordre de grandeur de
  2 à 4 minutes (à confirmer sur la prochaine release).
- Les images publiées correspondent à l'architecture réellement déployée.
- La landing bénéficie du même flux de validation que l'application.

### Coûts et risques

- Les runners self-hosted sont une charge d'exploitation : mise à jour,
  surveillance, droits de l'utilisateur `deploy-preprod`.
- Les dépôts sont publics et les runners exécutent des workflows sur `main` :
  la compromission d'un merge permettrait l'exécution de code sur l'hôte.
  Une évolution possible est un runner dédié ou un dépôt privé.
- Les images de release ne sont plus arm64 par défaut ; un besoin ARM exige
  un build multiarch manuel.
- La preprod combine landing et application sur un seul hôte, contrairement
  à la production. C'est un compromis assumé pour éviter un DNS
  supplémentaire.
- La promotion de l'image preprod vers un tag de release n'est pas retenue à
  ce stade : elle couplerait le build preprod au tag et poserait des questions
  de version/labels. Elle reste une option ultérieure.

## Alternatives écartées

- **Ouvrir SSH à GitHub Actions** : surface d'attaque et plage d'IP GitHub
  trop large ; rejeté au profit des runners self-hosted.
- **Conserver le build multiarch par défaut** : coût QEMU injustifié pour un
  hôte de production amd64.
- **Copier la base de production en preprod** : données personnelles et
  conversations exposées ; rejeté.
- **Créer immédiatement un DNS dédié à la landing preprod** : complexité
  d'infrastructure sans bénéfice fonctionnel immédiat ; différé.
- **Promouvoir directement l'image preprod en release** : dépendance au
  timing release-please et au marquage de version ; différé.

## Plan de mise en œuvre

1. Remise à zéro de la preprod et sauvegardes.
2. Ajout de `CONFIG_MASTER_KEY`, régénération des quatre secrets, migration
   jusqu'à `0045`.
3. Déploiement de la landing preprod et configuration Nginx combinée.
4. Activation de `PREPROD_ENABLED` et des runners self-hosted.
5. Build release amd64 par défaut et option multiarch manuelle.
6. Mesure du temps de la prochaine release.
7. Réévaluation de la promotion d'image et du DNS landing si nécessaire.
