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

## Étape 4 — migration pilote

Migrer d'abord un seul lien, de préférence un lien de test ou peu utilisé.
Vérifier :

- `/l/<token>` page publique ;
- `/embed/<token>` widget si activé ;
- démarrage et reprise de conversation ;
- réponses IA, connaissances et médias ;
- génération de fiche ;
- absence d'erreur dans les logs.

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
