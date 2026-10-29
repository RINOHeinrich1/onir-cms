# 0053. Sauvegarde obligatoire et nettoyage contrôlé des données

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0037 (préproduction et release), ADR-0049
  (suppression des données de test).

## Contexte

Cette ADR complète le §9 de l’ADR-0049 : elle rend la sauvegarde obligatoire et
verrouille la commande globale. En cas de divergence, la présente ADR prévaut.

L’ADR-0049 prévoit une commande explicite de réinitialisation des données de
test. En préproduction, cette commande a été utilisée avec un `TRUNCATE ...
CASCADE` global et a supprimé des données qui n’étaient pas des données de test.

Deux problèmes ont été constatés :

1. la commande ne produisait aucune sauvegarde préalable ;
2. son nom et son mode d’exécution ne distinguaient pas clairement un nettoyage
   de test d’une suppression globale.

Une suppression de données ne doit jamais pouvoir être lancée par erreur sans
moyen de restauration.

## Décision

### 1. Sauvegarde indépendante

Une commande de sauvegarde est disponible :

```bash
BACKUP_DIR=/backups node dist/db-cli.mjs backup
```

Elle utilise `pg_dump` au format custom :

```text
pg_dump --format=custom --no-owner --file <fichier> <DATABASE_URL>
```

Le fichier est horodaté et écrit dans `BACKUP_DIR`. Le dossier doit être un
volume persistant accessible à l’utilisateur du conteneur.

`pg_dump` version 16 est installé dans l’image de maintenance afin de rester
compatible avec le serveur PostgreSQL 16.

### 2. Reset global verrouillé

La commande de suppression globale devient :

```bash
RESET_ALL_CHATBOT_DATA=yes \
BACKUP_DIR=/backups \
node dist/db-cli.mjs reset-all-chatbot-data --execute
```

Elle exige simultanément :

- `RESET_ALL_CHATBOT_DATA=yes` ;
- `BACKUP_DIR` non vide ;
- le drapeau `--execute`.

Sans `--execute`, elle reste en dry-run et n’écrit rien.

### 3. Sauvegarde avant suppression

Avant le `TRUNCATE` :

1. la cible et le nombre de lignes par table sont affichés ;
2. la sauvegarde complète est créée ;
3. si la sauvegarde échoue, la suppression est annulée ;
4. la suppression s’exécute ensuite dans une transaction.

La sauvegarde est donc une condition d’exécution, pas une recommandation.

### 4. Ancienne commande retirée

L’ancien alias `db:reset-chatbot-test-data` est supprimé des scripts. La
commande restante est nommée explicitement `reset-all-chatbot-data` pour rendre
visible son caractère global.

La commande n’est jamais exécutée par une migration, un déploiement ou la CI.

### 5. Périmètre de la suppression

La commande globale ne supprime pas :

- les organisations ;
- les utilisateurs ;
- les fournisseurs IA ;
- les templates visuels ;
- les sauvegardes.

Elle reste une opération exceptionnelle de remise à zéro, réservée aux
environnements de test et soumise à validation humaine.

## Conséquences

### Positives

- Toute suppression globale laisse un dump avant modification.
- Une sauvegarde échouée bloque la suppression.
- Le dry-run permet de vérifier les volumes sans écrire.
- Le nom de la commande ne la présente plus comme un simple nettoyage de test.

### Négatives / risques

- Le dump complet peut être volumineux et contenir des données personnelles.
- Le dossier de sauvegarde doit être monté et protégé ; un dump dans un
  conteneur éphémère ne protège pas l’exploitant.
- La politique de rétention, de chiffrement et de copie hors site reste à
  définir.
- La restauration est une opération manuelle via `pg_restore`.
- Le nettoyage ciblé par identifiant de run de test n’est pas encore implémenté.

## Suivi

Avant toute utilisation en production, il reste nécessaire de :

1. monter un volume de sauvegarde persistant et vérifier les droits d’écriture ;
2. définir la rétention et la copie hors site ;
3. ajouter un nettoyage ciblé par `test_run_id` ou par identifiants de
   ressources de test ;
4. ne jamais exécuter la commande globale sur la production sans validation
   explicite et sauvegarde vérifiée.

## Hors périmètre

- sauvegarde continue ou PITR ;
- chiffrement des dumps ;
- rotation automatique ;
- restauration automatique ;
- nettoyage ciblé des données de test ;
- politique de conservation légale.
