# 0051. Brouillons persistants de création de chatbot

- **Statut** : Accepté
- **Date** : 2026-10-29
- **Décideurs** : équipe projet
- **Référence** : ADR-0013 (médias), ADR-0041 (canaux de diffusion),
  ADR-0048 (quotas), ADR-0049 (configuration chatbot).

## Contexte

Cette ADR complète l’ADR-0049 : le brouillon est un objet de travail distinct du
chatbot et de sa configuration publiée.

Le wizard de création d’un chatbot comporte plusieurs étapes : comportement,
fiches de collecte, données, diffusion et récapitulatif. Un abandon ou un
rechargement de page faisait perdre la saisie.

Un stockage uniquement local (navigateur) ne suffit pas :

- il ne survit pas à un changement d’appareil ni à une purge de stockage ;
- il ne permet pas de retrouver un brouillon depuis la liste des chatbots ;
- il ne permet pas de rattacher proprement des photos temporaires ;
- il ne garantit pas l’isolation par organisation.

Le brouillon doit rester distinct d’un chatbot : il ne possède ni jeton public,
ni URL, ni configuration runtime.

## Décision

### 1. Persistance en base

La table `chatbot_drafts` porte les brouillons :

```text
chatbot_drafts
  id uuid
  organization_id uuid NOT NULL
  created_by uuid NULL
  label text
  state jsonb
  created_at timestamptz
  updated_at timestamptz
```

`state` contient l’état sérialisé du wizard :

- étape courante ;
- configuration du chatbot ;
- fiches sélectionnées ;
- sélection de données ;
- canaux de diffusion ;
- quotas ;
- métadonnées des photos temporaires.

Le brouillon n’est jamais exposé comme chatbot public et ne porte aucun secret,
token ou URL publique.

### 2. Cycle de vie

- Un brouillon est créé à la première sauvegarde significative ; le client évite
  de créer des brouillons vides.
- L’autosave met à jour le brouillon sans changer son identité.
- La liste des chatbots affiche les brouillons avec un badge distinct.
- Un brouillon peut être repris, renommé ou supprimé.
- La création finale du chatbot s’effectue depuis le brouillon ; une fois le
  chatbot créé, le brouillon est supprimé.

### 3. Photos temporaires

Les photos ajoutées au brouillon sont des médias temporaires :

- `actif = false` ;
- aucune portée chatbot ;
- rattachées uniquement à l’état du brouillon.

À la création du chatbot, elles sont finalisées : portée et activation sont
appliquées, puis le brouillon est supprimé en conservant les médias finalisés.

À la suppression d’un brouillon, le nettoyage des photos temporaires est
best-effort. Un média déjà actif ou rattaché à un chatbot n’est jamais supprimé
par ce nettoyage.

### 4. Sécurité et isolation

- Toutes les opérations sont limitées à l’organisation active.
- Les droits utilisés sont ceux du domaine chatbots :
  `links:list`, `links:create`, `links:update`, `links:revoke`.
- Un brouillon n’est pas accessible depuis une route publique.
- La création finale reste soumise aux validations et quotas du chatbot.

### 5. Migration

La migration `0062_chatbot_drafts.sql` est additive. Aucun chatbot existant
n’est modifié.

## Conséquences

### Positives

- La saisie survit au rechargement et au changement d’appareil.
- Les brouillons sont visibles et reprenables depuis le dashboard.
- Les photos temporaires ne polluent pas la photothèque active.
- Le brouillon ne peut pas être confondu avec un chatbot publié.

### Négatives / risques

- Le schéma de `state` doit rester compatible avec les versions successives du
  wizard.
- Le nettoyage des photos est best-effort : un média orphelin reste possible en
  cas d’échec du stockage.
- Aucune purge automatique des brouillons abandonnés n’est définie à ce stade.
- L’autosave ajoute des écritures régulières en base.

## Hors périmètre

- brouillons collaboratifs ;
- verrouillage concurrent d’un même brouillon ;
- durée de rétention automatique ;
- versionnement de l’état du brouillon ;
- publication automatique d’un brouillon.
