# Passage en production — anciens chatbots et landing

Ce document prépare la bascule sans casser les liens déjà diffusés. Il ne
remplace pas une sauvegarde ni une validation sur copie de production.

## Constat landing

La landing publique `https://cms.onirtech.com` pointe aujourd’hui vers deux
démonstrations sur `cms-backoffice.onirtech.com` :

```text
/l/6jz9EpfYfGyh-gwRr6JOoaTcqwc1nQgX   → démo « Sans 3D »
/l/kp_CX9lKNdHhLOLO-h-W9Fj1G3s1xbiL   → démo « 3D »
```

Ces deux URLs doivent rester valides après la bascule. Si un token doit
changer, une redirection ancien → nouveau doit être prévue dans la landing.

## Principe

1. Le code applicatif conserve le runtime legacy quand
   `chat_links.current_config_id IS NULL`.
2. Les anciens liens ne sont pas migrés en masse.
3. Chaque lien est migré avec un dry-run et une validation.
4. Le rollback d'un lien consiste à remettre `current_config_id = NULL`.
5. Les anciennes tables et données ne sont pas supprimées avant validation
   complète.

## Interdits

- Ne pas exécuter `reset-all-chatbot-data` en production.
- Ne pas réécrire les tokens ou les identifiants des liens sans redirection.
- Ne pas supprimer `chat_templates` / `chat_template_versions` avant que tous
  les liens legacy soient migrés.
- Ne pas restaurer la production telle quelle dans une préprod partagée sans
  isolation ou anonymisation.

## Étape 1 — sauvegarde et copie isolée

```bash
BACKUP_DIR=/backups node dist/db-cli.mjs backup
```

Vérifier le dump, puis le restaurer dans une base isolée. Toutes les commandes
d'audit et les répétitions de migration doivent d'abord tourner sur cette
copie.

## Audit production du 2026-10-29

Audit exécuté en lecture seule sur la base de production :

- dernière migration : `0048_chat_link_channels.sql` ;
- `11` liens legacy, `0` lien bloquant ;
- aucune table de la nouvelle architecture (`chatbot_configs`, etc.) ;
- aucun template/version manquant ;
- trois liens partagent le template `onir-cms-demo` ;
- plusieurs libellés sont vides et devraient être complétés avant la migration.

Conséquence : les migrations `0049` à `0063` doivent être répétées sur une copie
isolée avant toute application en production.

## Étape 2 — audit read-only

```bash
# Rapport lisible
node dist/db-cli.mjs audit-legacy-chatbots

# Rapport JSON
node dist/db-cli.mjs audit-legacy-chatbots --format=json
```

L'audit ne modifie rien. Il indique notamment :

- les liens legacy et les liens déjà configurés ;
- les templates/versions manquants ;
- les conversations, conversations ouvertes et fiches par lien ;
- les connaissances et médias visibles via l'ancienne portée `template_keys` ;
- la présence des tables de la nouvelle architecture.

Un lien est bloquant si son `template_key` est vide ou si le template ou la
version est introuvable.

## Dry-run d'un lien pilote

```bash
node dist/db-cli.mjs plan-legacy-chatbot \
  --link-id=<uuid> \
  --format=json
```

Le dry-run ne crée aucune configuration et ne modifie aucun lien. Il produit :

- le template et le nombre de champs ;
- le prompt historique repris en mode expert ;
- la fiche de collecte proposée ;
- les connaissances/médias visibles via l'ancienne portée ;
- les identifiants de liens à ajouter à `chat_link_ids` ;
- les bloquants et avertissements.

Pilote retenu : `Démo ONIR CMS — simplifiée`
(`f815b152-cc67-420e-95e6-1d1ad93dd217`), template `onir-cms-demo` v1.

Résultat du dry-run : aucun bloquant, 3 champs, 6 connaissances scopées,
1 connaissance globale, 1 média global. Les trois liens partageant le template
`onir-cms-demo` devront être ajoutés à `chat_link_ids` pour conserver la portée
historique.

## Étape 3 — mapping d'un lien

Pour chaque lien legacy :

- conserver `chat_links.id`, token, URL, quotas, canaux et prospect ;
- construire une configuration depuis la version historique du template ;
- reprendre le prompt historique en mode expert pour préserver le comportement ;
- construire une fiche de collecte depuis les champs historiques ;
- mettre `dataSelection.mode = all` par défaut ;
- recopier la portée des contenus `template_keys` vers `chat_link_ids` pour le
  lien migré ;
- conserver les conversations et fiches existantes sans réécriture ;
- décider du sort des conversations ouvertes avant de basculer le lien.

## Exécution d'un lien

```bash
# Dry-run (aucune écriture)
node dist/db-cli.mjs migrate-legacy-chatbot --link-id=<uuid>

# Exécution, si aucune conversation n'est ouverte
node dist/db-cli.mjs migrate-legacy-chatbot --link-id=<uuid> --execute

# Accepter explicitement une bascule avec conversations ouvertes
node dist/db-cli.mjs migrate-legacy-chatbot --link-id=<uuid> --execute --allow-open
```

La commande refuse un lien déjà configuré. Elle crée la configuration, met à
jour `chat_links.current_config_id` et recopie la portée des contenus scopés
vers `chat_link_ids`.

## Étape 4 — migration pilote

Migrer d'abord un seul lien, de préférence un lien de test ou peu utilisé.
Vérifier :

- `/l/<token>` page publique ;
- `/embed/<token>` widget si activé ;
- démarrage et reprise de conversation ;
- réponses IA, connaissances et médias ;
- génération de fiche ;
- absence d'erreur dans les logs.

## Répétition sur copie isolée

Une copie de la production a été restaurée dans une base isolée, puis les
migrations `0049` à `0063` y ont été appliquées.

Deux liens ont été migrés sur cette copie :

- `Recueille de talent` (`40d43d24-dbc9-463f-bf02-1e2428b8c626`) : 0
  conversation ouverte, configuration créée, 0 contenu scopé à recopier.
- `Démo ONIR CMS — simplifiée` (`f815b152-cc67-420e-95e6-1d1ad93dd217`) :
  configuration créée avec `--allow-open`, 6 connaissances scopées recopiées
  dans `chat_link_ids`.

Une application temporaire pointée sur cette copie a répondu `200` pour les
deux liens landing `/l/<token>`.

La production n'a pas été modifiée. La copie isolée a été supprimée après la répétition.

## Rollback

Pour un lien migré :

```sql
UPDATE chat_links
   SET current_config_id = NULL
 WHERE organization_id = '<org>'
   AND id = '<link-id>';
```

Le runtime réutilise alors le template historique. Ne supprimer la
configuration créée que si aucun élément ne la référence.

## Étape 5 — bascule progressive

Migrer ensuite par petits lots, avec le même contrôle. Garder
`current_config_id = NULL` comme chemin de rollback.

## Étape 6 — nettoyage différé

Attendre plusieurs jours sans lien legacy. Ensuite seulement, décider de
l'archivage ou de la suppression des anciens templates. Ne jamais supprimer les
données tant que le rollback reste nécessaire.

## Landing

La landing est un dépôt séparé (`onir-cms-landing`). Après la release :

- vérifier que les deux CTA de démonstration répondent toujours ;
- vérifier que les URLs pointent vers la production et non la préprod ;
- conserver les tokens actuels ou ajouter des redirections ;
- tester les widgets `/embed/...` s'ils sont utilisés.

Mapping constaté :

```text
Landing « simplifiée » → f815b152-cc67-420e-95e6-1d1ad93dd217
Landing « immersive »  → 01be07aa-2561-49ae-b7fe-3e1867a3d761
```

Les tokens publics de la landing doivent rester inchangés. Aucun redirect n'est
nécessaire si les URLs `/l/<token>` sont conservées.
