# 0075. Modes de déploiement mono-instance et multi-instance

- **Statut** : Proposé
- **Date** : 2026-11-07
- **Décideurs** : équipe projet
- **Référence** : ADR-0013, ADR-0036, ADR-0043, ADR-0044, ADR-0074.
- **Complète** : ADR-0074.
- **Remplace** : aucune.

## Contexte

L’application doit pouvoir tourner :

- en **mono-instance**, comme aujourd’hui, sans dépendance S3 ni Valkey ;
- en **multi-instance** derrière HAProxy, avec un stockage partagé et un temps
  réel cohérent.

Le stockage local reste valide en mono-instance, mais devient incohérent en
multi-instance : un fichier uploadé sur un nœud n’est pas visible sur un autre.
Le mode temps réel est traité par ADR-0074 ; le stockage doit avoir sa propre
règle explicite.

## Décision

### 1. Deux modes de déploiement

```text
MONO-INSTANCE
MULTI-INSTANCE
```

Le mode est déterminé par la topologie de déploiement et par `REPLICA_COUNT`.

### 2. Stockage

```text
STORAGE_DRIVER=auto|disk|s3
```

- `auto` :
  - S3 configuré → `s3` ;
  - sinon → `disk`.
- `disk` : autorisé **uniquement** en mono-instance.
- `s3` : obligatoire en multi-instance.

Garde-fou :

```text
REPLICA_COUNT > 1 + STORAGE_DRIVER=disk → démarrage refusé
```

Donc S3 n’est **pas obligatoire en mono-instance**. L’application continue de
fonctionner sans S3 dans ce mode.

### 2.1 Backend S3 initial — SeaweedFS

Pour le premier déploiement S3, **SeaweedFS** est retenu :

- licence **Apache 2.0** ;
- passerelle **S3-compatible** ;
- léger et adapté à un premier nœud ;
- évite le crédit OVH Public Cloud immédiat.

SeaweedFS est utilisé uniquement via son API S3 de base :

- `PutObject` ;
- `GetObject` ;
- `DeleteObject` ;
- `ListObjects`.

L’application ne doit pas dépendre de fonctions S3 spécifiques à SeaweedFS :
pas de politiques de bucket, pas de verrouillage d’objet, pas de versioning
propriétaire.

Configuration initiale :

```text
S3_ENDPOINT=http://<hôte-seaweedfs>:8333
S3_FORCE_PATH_STYLE=true
S3_BUCKET=onir-cms
```

Déploiement initial :

- SeaweedFS **mono-nœud** dans un premier temps ;
- volume de données dédié ;
- accès S3 non exposé publiquement ;
- sauvegarde du volume et export régulier des objets.

Cette installation n’est **pas hautement disponible**. Elle est acceptable pour
valider le multi-instance. La migration vers OVH S3 se fera sans changement de
code applicatif, en conservant les mêmes clés d’objet.

### 3. Temps réel

Le mode est celui d’ADR-0074 :

```text
REALTIME_MODE=auto|local|valkey|polling
```

- mono sans Valkey → `local` (SSE + polling) ;
- multi avec Valkey → `valkey` (SSE + polling) ;
- multi sans Valkey → `polling` uniquement.

### 4. Haute disponibilité et sessions

- sessions en PostgreSQL, pas de sticky session ;
- une seule base partagée en multi-instance ;
- migrations exécutées une fois, pas sur chaque nœud ;
- secrets partagés : `SESSION_SECRET`, `CONFIG_MASTER_KEY`, secrets applicatifs.

### 5. Document d’installation

Le document d’installation doit désormais comporter deux parcours distincts :

1. **Installation mono-instance**
   - disque local autorisé ;
   - SSE local + polling ;
   - une seule instance ;
   - aucune dépendance S3/Valkey.

2. **Installation multi-instance**
   - S3 obligatoire via SeaweedFS puis OVH S3 ;
   - `REPLICA_COUNT > 1` ;
   - Valkey ou polling forcé ;
   - HAProxy ;
   - base partagée ;
   - migrations centralisées ;
   - validation cross-node.

Un tableau des variables d’environnement doit indiquer clairement quelles
variables sont requises dans chaque mode.

### 6. Migration mono → multi

1. provisionner S3 ;
2. copier les médias et pièces jointes existants ;
3. vérifier les checksums et les clés d’objet ;
4. passer `STORAGE_DRIVER=s3` ;
5. vérifier upload/lecture sur deux nœuds ;
6. configurer `REPLICA_COUNT > 1` ;
7. choisir `REALTIME_MODE=valkey` ou `polling` ;
8. ajouter les backends HAProxy ;
9. exécuter la validation multi-instance du plan.

## Conséquences

### Positives

- mono-instance inchangée sans S3/Valkey ;
- multi-instance avec stockage réellement partagé ;
- refus explicite d’une configuration multi incohérente ;
- documentation d’installation alignée sur les deux modes.

### Négatives

- deux parcours d’installation à maintenir ;
- migration disque → S3 nécessaire lors du passage multi ;
- S3 devient une dépendance obligatoire en multi-instance.
