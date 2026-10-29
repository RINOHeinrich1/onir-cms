# 0058. IA par usage, clusters et overrides par chatbot

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0029, ADR-0047, ADR-0054.

## Contexte

Les paramètres IA étaient organisés par implémentation : défaut d’organisation,
extraction dédiée avec un secours, modèle par défaut du fournisseur. Cette
structure ne permettait pas de régler indépendamment les usages métier, ni de
définir une chaîne de secours multi-fournisseurs.

Les usages sont désormais :

```text
response    génération de réponse
extraction  extraction structurée
selection   sélection des médias et connaissances
summary     résumé de conversation
assistant   assistance interne (configuration préparée)
```

## Décision

### 1. Défauts par usage

Table `organization_ai_usage_defaults`, une cible par organisation et usage :

```text
target_kind = model  → fournisseur + modèle
target_kind = cluster → cluster ordonné
```

L’absence de ligne signifie « hériter du lien » pour extraction, sélection et
résumé, et « legacy » pour response.

Le défaut d’organisation historique est migré vers l’usage `response`. Le
modèle par défaut du fournisseur n’est plus utilisé par le runtime.

### 2. Clusters

`ai_clusters` + `ai_cluster_members` :

- membres ordonnés ;
- fournisseurs différents autorisés ;
- pas de cluster imbriqué ;
- fallback sur erreur technique ;
- fallback aussi sur JSON vide/invalide pour extraction et sélection ;
- les tokens réellement consommés sont tracés par tentative.

### 3. Overrides par lien

Table `chat_link_ai_usage_overrides` :

```text
usage ∈ response | extraction | selection | summary
target_kind ∈ inherit | model | cluster
```

La précédence est :

```text
override du lien
  > défaut d’usage
  > cible de réponse effective (pour extraction/sélection/résumé)
  > legacy
```

Pour `response`, la précédence est :

```text
override du lien
  > défaut d’usage response
  > legacy
```

### 4. Assistant interne

Le rôle `assistant` est configurable dès maintenant mais n’est pas encore
branché à une fonctionnalité. Il n’a pas d’override par lien.

### 5. Migration

La migration `0065_ai_clusters_usage_defaults.sql` est additive. Elle migre :

- le défaut d’organisation vers `response` ;
- les affectations IA des liens vers les overrides `response` ;
- extraction + secours vers un cluster `Extraction migrée`.

Les anciennes colonnes restent en place pour rollback.
