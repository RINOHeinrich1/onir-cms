# 0089. Quota global de stockage par organisation

- **Statut** : Accepté
- **Date** : 2026-11-11
- **Décideurs** : équipe projet
- **Référence** : ADR-0034, ADR-0089.

## Contexte

Les fichiers médias, les pièces jointes de conversation et les assets de
paramètres de template sont stockés hors base, dans S3/SeaweedFS.

Les limites actuelles portent uniquement sur :

- la taille d'un fichier ;
- le nombre de fichiers par champ ;
- le format MIME.

Il n'existe pas de plafond global par organisation. Un client peut donc
remplir le stockage sans limite, indépendamment de son abonnement.

## Décision

### 1. Quota global

Chaque organisation possède un quota :

```text
max_storage_bytes bigint NULL
```

- `NULL` : aucune limite ;
- `0` : aucun nouvel upload ;
- valeur positive : quota total en octets.

Le profil de limites expose une valeur lisible en **Mo** :

```text
maxStorageMb
```

La conversion vers `max_storage_bytes` est faite côté application.

### 2. Périmètre du quota

Sont comptés :

- médias de la bibliothèque ;
- pièces jointes de conversation ;
- assets d'image des paramètres de template.

Ne sont pas comptés :

- previews et assets globaux des templates ;
- factures PDF ;
- fichiers internes de la plateforme.

### 3. Calcul et contrôle

Le contrôle est effectué avant l'écriture dans le stockage :

```text
stockage utilisé + taille du nouveau fichier <= max_storage_bytes
```

La taille utilisée est calculée à partir des métadonnées en base :

- `conversation_attachments.size_bytes` ;
- `template_param_assets.size_bytes` ;
- `medias.size_bytes`.

Le quota est strictement un **blocage** : aucun recyclage automatique de
fichiers. Les fichiers existants restent lisibles.

Un refus retourne une erreur `413` explicite.

### 4. Médias historiques

`medias.size_bytes` peut être `NULL` pour les anciens médias importés avant
cette décision. Ils ne sont pas comptés tant qu'aucune mesure n'est disponible.

### 5. Rétention

La rétention des pièces jointes reste une politique distincte du quota.
Le quota empêche la croissance incontrôlée ; il ne supprime rien
automatiquement.

## Alternatives écartées

### Facturation au Go immédiate

Rejetée pour le moment : complexité de mesure, de facturation et de
réconciliation.

### Suppression automatique des plus vieux fichiers

Rejetée : le stockage est en blocage uniquement. Une suppression de fichiers
client doit être explicite et auditée.

### Compter les fichiers binaires dans PostgreSQL

Rejetée : PostgreSQL ne doit pas stocker les binaires.

## Conséquences

### Positives

- Protection contre les uploads massifs.
- Quota lisible dans le profil de limites.
- Blocage uniquement, sans suppression surprise.
- Aucun impact sur les anciens médias non mesurés.

### Négatives

- Les anciens médias sans taille ne sont pas comptés.
- Une réconciliation périodique avec S3 reste nécessaire.
- Les suppressions client ne décrémentent pas un compteur : le calcul se fait
  à partir des métadonnées restantes.

## Tests attendus

- fichier sous le quota : accepté ;
- fichier qui dépasse le quota : refusé en `413` ;
- quota `NULL` : accepté ;
- media, pièce jointe et asset de template comptés ensemble ;
- suppression d'un média : le quota se libère au calcul suivant ;
- aucun fichier n'est supprimé automatiquement par le quota.
