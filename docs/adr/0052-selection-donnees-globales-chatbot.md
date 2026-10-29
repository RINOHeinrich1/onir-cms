# 0052. Sélection des données globales par configuration chatbot

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0012 (base de connaissances), ADR-0013 (médias),
  ADR-0049 (portée des contenus et configuration chatbot).

## Contexte

Cette ADR précise le §7 de l’ADR-0049 : la portée reste portée par les contenus,
tandis que la configuration choisit les données globales utilisables.

L’ADR-0049 distingue les connaissances et médias :

- globaux ;
- scopés à un ou plusieurs chatbots.

Le runtime utilisait jusqu’ici **toutes** les données globales pour chaque
chatbot. Cela ne permettait pas de réserver certains contenus à un chatbot
précis sans les scoper explicitement, et exposait trop largement des contenus
pourtant globaux.

Il fallait un réglage de configuration lisible, sans modifier la portée des
contenus eux-mêmes.

## Décision

### 1. Bloc `dataSelection` dans la configuration

Chaque version de configuration porte :

```json
{
  "mode": "all",
  "connaissanceIds": [],
  "mediaIds": []
}
```

- `mode = all` : toutes les données globales sont utilisables.
- `mode = selected` : seules les données globales listées sont utilisables.
- `connaissanceIds` et `mediaIds` sont limités à 2000 identifiants chacun.
- Le mode par défaut est `all`.
- Les identifiants sont dédupliqués et normalisés à l’écriture.

La sélection est stockée dans `chatbot_configs.data_selection` (JSONB) et suit
le versionnement de la configuration.

### 2. Effet sur la portée

La sélection ne s’applique qu’aux contenus **globaux** :

- un contenu scopé à ce chatbot reste toujours utilisable ;
- un contenu scopé à un autre chatbot reste inaccessible ;
- un contenu global est utilisable si `mode = all`, ou s’il est explicitement
  listé en mode `selected`.

La sélection ne modifie jamais la portée stockée sur la connaissance ou le
média. Elle filtre à la lecture, au moment du runtime.

### 3. Runtime et compatibilité

- Une configuration sans `dataSelection` est interprétée comme `mode = all`.
- Le runtime applique le filtre pour les connaissances et pour chaque nature de
  média.
- Les conversations existantes conservent la configuration avec laquelle elles
  ont été démarrées.
- Le mode legacy sans configuration conserve le comportement historique.

### 4. Interface

L’étape « Données » du wizard :

- affiche les données globales en lecture seule ;
- permet d’ajouter des connaissances ou médias au brouillon ;
- permet de choisir `all` ou `selected` ;
- permet de rechercher et sélectionner les données existantes avec pagination ;
- ne modifie pas les données globales elles-mêmes.

### 5. Migration

La migration `0061_chatbot_configs_data_selection.sql` est additive :

- ajout de la colonne `data_selection` ;
- backfill des configurations existantes en `mode = all` ;
- contrainte JSONB de type objet.

## Conséquences

### Positives

- Un chatbot peut utiliser un sous-ensemble explicite des données globales.
- Les contenus scopés au chatbot restent toujours disponibles.
- Les contenus existants ne sont ni déplacés ni supprimés.
- Le comportement par défaut reste compatible avec les configurations
  existantes.

### Négatives / risques

- La liste d’identifiants peut devenir longue et doit être maintenue.
- Une donnée globale supprimée laisse un identifiant inutile dans la sélection.
- La lisibilité dépend de l’interface de sélection.
- Le filtre est appliqué au runtime : une erreur de repository pourrait
  élargir ou restreindre l’accès.

## Hors périmètre

- sélection de données scopées à d’autres chatbots ;
- sélection par fiche de collecte ;
- héritage de sélection entre configurations ;
- synchronisation automatique des identifiants supprimés ;
- règles de visibilité par visiteur.
