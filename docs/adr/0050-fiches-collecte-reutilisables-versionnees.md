# 0050. Fiches de collecte réutilisables et versionnées

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0017 (fiches multiples), ADR-0045 (champs de
  conversation), ADR-0049 (configuration chatbot et fiches 0..N).

## Contexte

Cette ADR complète l’ADR-0049 sans la remplacer : elle précise la bibliothèque
de fiches et l’import par snapshot. En cas de divergence sur ce point, la
présente ADR prévaut.

L’ADR-0049 place les fiches de collecte dans la configuration du chatbot. Ce
choix garantit qu’une conversation conserve le schéma exact utilisé, mais il
oblige à redéfinir la même fiche pour chaque chatbot qui doit collecter les
mêmes informations.

Le parcours réel a fait apparaître deux besoins :

1. disposer d’une **bibliothèque de fiches réutilisables** au niveau de
   l’organisation ;
2. conserver, dans chaque configuration de chatbot, un **snapshot immuable** de
   la fiche importée.

La réutilisation ne doit pas créer de dépendance vivante entre un chatbot et une
fiche de bibliothèque : modifier la bibliothèque ne doit jamais changer
silencieusement le comportement d’un chatbot existant.

## Décision

### 1. Bibliothèque de fiches par organisation

Deux tables portent la bibliothèque :

```text
fiche_collectes
  id, organization_id, key, label, description, intent,
  fields jsonb, render_template, instructions,
  version, created_by, created_at, updated_at

fiche_collecte_versions
  id, fiche_collecte_id, version, key, label, description, intent,
  fields jsonb, render_template, instructions,
  created_by, created_at
```

`fiche_collectes` porte la version courante pour la lecture rapide.
`fiche_collecte_versions` conserve toutes les versions publiées.

Contraintes :

- `key` est unique par organisation ;
- `version` commence à 1 et ne décroît jamais ;
- `(fiche_collecte_id, version)` est unique ;
- `fields` est un tableau JSONB validé par le moteur de champs existant.

### 2. Versionnement immuable

- La création écrit la version 1 dans les deux tables.
- Une modification crée une nouvelle ligne dans `fiche_collecte_versions` et
  met à jour la version courante dans `fiche_collectes`.
- Aucune version publiée n’est modifiée en place.
- La suppression d’une fiche de bibliothèque supprime ses versions, mais ne
  touche pas aux snapshots présents dans les configurations de chatbot.

### 3. Import par copie dans le chatbot

Un chatbot importe une fiche sous forme de **copie** dans
`chatbot_configs.fiches` :

```text
FicheDefinition
  key, label, description, intent, fields[], renderTemplate,
  instructions, sourceFicheId?, sourceVersion?
```

`sourceFicheId` et `sourceVersion` documentent l’origine du snapshot. Ils ne
créent pas de lien de synchronisation. Une nouvelle version de la bibliothèque
n’est reprise que par un nouvel import explicite.

Les conversations et les configurations existantes conservent donc le schéma
qu’elles ont réellement utilisé.

### 4. Génération des éléments techniques

Pour éviter d’exposer la structure interne :

- la clé de fiche est générée depuis le libellé ;
- en cas de collision dans l’organisation, un suffixe numérique est ajouté ;
- les noms techniques des champs et le rendu Markdown sont générés depuis les
  libellés ;
- les champs techniques ne sont pas demandés dans le formulaire utilisateur.

Les noms générés restent stables dans le snapshot pour ne pas casser les fiches
déjà produites.

### 5. Droits, API et interface

Actions RBAC dédiées :

```text
fiches_collecte:list
fiches_collecte:read
fiches_collecte:create
fiches_collecte:update
fiches_collecte:delete
```

Toutes les lectures et écritures sont limitées à l’organisation active.

L’interface expose :

- une liste des fiches de collecte ;
- la création et l’édition versionnée ;
- la consultation de l’historique des versions ;
- la sélection multiple dans le wizard chatbot ;
- la création inline d’une fiche depuis le wizard.

### 6. Migration

La migration `0060_fiche_collectes.sql` est additive. Elle ne migre ni ne
supprime aucune configuration existante.

## Conséquences

### Positives

- Une fiche commune peut être réutilisée par plusieurs chatbots.
- Les configurations et conversations restent reproductibles.
- La bibliothèque peut évoluer sans effet de bord sur les chatbots existants.
- Les champs techniques restent invisibles pour l’utilisateur métier.

### Négatives / risques

- La duplication des snapshots est assumée.
- Une correction de fiche doit être réimportée dans chaque chatbot concerné.
- L’historique des versions peut croître.
- La suppression d’une fiche de bibliothèque ne doit jamais être confondue avec
  la suppression des fiches déjà générées.

## Hors périmètre

- synchronisation automatique bibliothèque → chatbots ;
- partage de fiches entre organisations ;
- portée des médias ou connaissances au niveau d’une fiche ;
- fusion de versions ou résolution de conflits ;
- bibliothèque de fiches publique.
