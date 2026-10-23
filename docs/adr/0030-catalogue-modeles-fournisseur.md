# 0030. Catalogue de modèles par fournisseur

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Complète** : `0029-fournisseurs-ia-openai-compatible.md`

## Contexte

L'ADR-0029 a introduit les fournisseurs OpenAI-compatible et la résolution
`fournisseur + modèle` par lien. La première implémentation a volontairement
limité le modèle à :

- `ai_providers.default_model`, une seule chaîne ;
- un catalogue distant lu à la demande via `GET /models` ;
- un champ front en `datalist`, sans gestion d'une collection.

Cette simplification ne correspond pas au besoin métier : un fournisseur peut
exposer plusieurs modèles, et l'administrateur doit pouvoir les gérer depuis
l'interface (synchronisation, ajout manuel, activation, modèle par défaut)
sans recréer le fournisseur.

## Décision

### 1. Table enfant `ai_provider_models`

Un fournisseur possède 0..N modèles. Chaque ligne porte :

- `organization_id` et `provider_id` (FK composite, isolation multi-tenant) ;
- `model_id` (identifiant envoyé à l'API) ;
- `label` (libellé affiché, par défaut `model_id`) ;
- `source` : `catalog` (synchronisé depuis `/models`) ou `manual` ;
- `enabled` (un modèle désactivé n'est plus proposé) ;
- `last_seen_at` pour les modèles de catalogue ;
- `created_by`, `created_at`, `updated_at`.

Contraintes :

- unicité `(provider_id, model_id)` ;
- suppression en cascade avec le fournisseur ;
- `ai_providers.default_model` reste la référence du modèle par défaut et doit
  pointer vers un modèle **actif** ;
- `chat_links.ai_model` reste un identifiant texte, compatible multi-fournisseur.

La migration `0039` backfill les `default_model` existants dans la nouvelle
table pour ne pas perdre la configuration actuelle.

### 2. Synchronisation et ajout manuel

- `POST /api/ai/providers/[id]/models/sync` lit `GET /models`, insère les
  nouveaux identifiants (`source=catalog`, `enabled=true`) et met à jour
  `last_seen_at`. Les modèles absents du catalogue ne sont **pas** supprimés
  automatiquement.
- `POST /api/ai/providers/[id]/models` ajoute un identifiant manuel, utile
  lorsqu'un fournisseur n'expose pas `/models`.
- Les doublons sont refusés ; un modèle manuel existant n'est pas écrasé par la
  synchronisation.
- Le catalogue distant reste une commodité : la table est la source de vérité
  de ce que l'application propose.

### 3. Gestion dans l'interface

- Chaque fournisseur expose une action « Modèles ».
- Le panneau permet : synchroniser, ajouter manuellement, activer/désactiver,
  définir le modèle par défaut et supprimer un modèle non utilisé.
- Le sélecteur de modèle d'un lien (lot 2) et le défaut d'organisation ne
  proposent que les modèles **actifs**.
- Le formulaire fournisseur ne gère plus le modèle par défaut : cette
  responsabilité appartient au panneau Modèles, pour éviter deux sources de
  vérité.

### 4. Garde-fous

- Impossible de désactiver ou supprimer le modèle par défaut du fournisseur.
- Impossible de supprimer un modèle utilisé comme défaut d'organisation ou
  référencé par un lien.
- Impossible de supprimer un modèle de catalogue utilisé ; il peut être
  désactivé.
- Un modèle désactivé n'est plus sélectionnable pour un nouveau lien.
- La suppression du fournisseur reste un archivage ; les modèles sont conservés.

## Conséquences

- Le back expose désormais un vrai sous-objet Modèle, pas seulement une chaîne.
- Le front dispose d'un panneau de gestion par fournisseur, y compris pour un
  fournisseur déjà existant.
- Le lot 2 (affectation par lien) consommera les modèles actifs au lieu d'un
  catalogue distant non maîtrisé.
- Une synchronisation peut être relancée sans perdre les modèles manuels ni les
  activations/désactivations.

## Hors périmètre

- tarification et contexte maximal par modèle ;
- capacités avancées (tools, vision, reasoning) ;
- quota par modèle ;
- synchronisation planifiée automatique.

## Références

- `docs/adr/0029-fournisseurs-ia-openai-compatible.md`
- `src/domain/entities/ai-provider.ts`
- `src/infrastructure/db/migrations/0038_ai_providers.sql`
- `src/components/ai/AiProviderForm.tsx`
- `src/components/ai/AiModelSelect.tsx`
