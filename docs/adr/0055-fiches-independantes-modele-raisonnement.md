# 0055. Fiches indépendantes du modèle de raisonnement

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0049 (configuration chatbot), ADR-0050 (fiches de collecte),
  ADR-0054 (résumé), ADR-0053 (sauvegarde).

## Contexte

La nouvelle architecture chatbot ne dépend plus d’un modèle de raisonnement
(`chat_templates` / `chat_template_versions`) : la configuration du chatbot
porte ses fiches de collecte et son comportement.

Pourtant, la création manuelle d’une fiche de prospection échoue encore avec
`Modèle inconnu : fiche-projet` lorsque les anciens templates sont absents. Les
fiches restent structurellement liées à l’ancien modèle :

- `fiches.template_key` et `fiches.template_version` sont obligatoires ;
- la création manuelle utilise implicitement `fiche-projet` ;
- le rendu PDF/Markdown cherche le template de raisonnement ;
- les fiches générées par une configuration écrivent encore le template du lien,
  qui peut être vide.

Une fiche de prospection doit pouvoir exister sans modèle de raisonnement, être
rendue depuis son propre snapshot, et être rattachée à zéro ou plusieurs
chatbots.

## Décision

### 1. Le modèle de raisonnement devient optionnel

Les colonnes `fiches.template_key` et `fiches.template_version` deviennent
nullables. Elles restent renseignées pour les fiches historiques.

Une fiche peut exister avec :

- un `template_key` / `template_version` historique ; ou
- un `definition` JSONB, snapshot de la définition utilisée ; ou
- les deux, pour compatibilité.

Le rendu utilise en priorité `definition`, puis le template historique, puis un
rendu manuel générique.

### 2. Snapshot de définition

La colonne `definition jsonb` contient le snapshot de la définition de fiche :

- pour une fiche générée par une configuration : la définition de la fiche de
  collecte utilisée ;
- pour une fiche manuelle : une définition locale de fiche de prospection ;
- pour les anciennes fiches : backfill depuis `chat_template_versions` lorsque
  c’est possible.

Une fiche ne dépend donc plus de la présence future de l’ancien template.

### 3. Création manuelle sans modèle

La création manuelle ne résout plus `chat_templates`. Elle construit une fiche
générique à partir des champs du formulaire, avec une définition locale et
`template_key = NULL`, `template_version = NULL`.

L’erreur `Modèle inconnu : fiche-projet` ne peut plus se produire.

### 4. Relation fiche ↔ 0..N chatbots

Une table d’association est ajoutée :

```text
fiche_chat_links
  fiche_id
  chat_link_id
  organization_id
  created_at
```

- une fiche peut avoir 0, 1 ou N chatbots associés ;
- une fiche manuelle peut rester sans chatbot ;
- une fiche générée depuis une conversation est associée automatiquement au
  chatbot source ;
- les fiches historiques sont backfillées depuis leur conversation ;
- le filtre « chatbot » des leads tient compte de cette relation.

### 5. Rendu et affichage

- Le rendu PDF/Markdown utilise le snapshot `definition`.
- Le fallback `chat_templates` reste uniquement pour les anciennes fiches sans
  snapshot.
- L’interface n’affiche plus « Modèle de raisonnement » pour une fiche manuelle
  ou config-only : elle affiche le libellé de la définition, la clé de fiche ou
  « Fiche manuelle ».
- La page de détail et la liste des leads n’exigent plus de template.

### 6. Compatibilité legacy

Les anciens liens et conversations continuent d’utiliser `chat_templates`
lorsque leur configuration est absente. Cette compatibilité est conservée
jusqu’à la fin de la migration des liens legacy.

Les anciennes fiches conservent leurs colonnes historiques. Aucune donnée n’est
supprimée.

### 7. Migration

La migration `0064_fiches_sans_modele_raisonnement.sql` est additive :

1. suppression des `NOT NULL` sur `template_key` / `template_version` ;
2. ajout de `definition jsonb` ;
3. backfill de `definition` depuis les templates historiques ;
4. création de `fiche_chat_links` ;
5. backfill des associations depuis les conversations.

La migration doit être répétée sur une copie isolée de la production avant
application réelle.

## Conséquences

### Positives

- Création manuelle de fiche sans ancien modèle.
- Fiches config-only rendues depuis leur snapshot.
- Une fiche peut être liée à 0..N chatbots.
- Les anciennes fiches restent lisibles.
- La suppression future des anciens templates ne casse plus les fiches migrées.

### Négatives / risques

- Les anciennes fiches sans définition et sans template restent non rendables ;
  un contrôle d’intégrité doit les signaler.
- Le snapshot duplique la définition.
- La relation N:N ajoute une table et des contrôles d’appartenance.
- Les webhooks historiques restent liés aux templates de raisonnement et
  nécessitent une adaptation séparée.

## Hors périmètre

- suppression des anciens templates ;
- migration des webhooks vers les fiches de collecte ;
- édition d’une fiche après création ;
- partage d’une fiche entre organisations ;
- refonte complète du formulaire de fiche.
