# 0062. Suppression du stack legacy « modèles de raisonnement »

- **Statut** : Accepté
- **Date** : 2026-11-03
- **Décideurs** : équipe projet
- **Référence** : ADR-0049, ADR-0055, ADR-0060, ADR-0061, migration 0069.

## Contexte

Les fiches de collecte (`chatbot_configs.fiche_definitions`) et le snapshot
`fiches.definition` remplacent progressivement les anciens « modèles de
raisonnement » (`chat_templates` / `chat_template_versions`). L’assistance IA
de génération de modèles (`template_ai_*`) et les sélecteurs de modèles legacy
n’ont plus d’utilisateur.

Vérifications préalables :

- les 15 liens existants sont config-based (`current_config_id` renseigné) ;
- les 9 fiches existantes ont un `definition` non nul (backfill 0068) ;
- `render-fiche` ne lit plus que `fiche.definition` ;
- les webhooks utilisent `chat_link_id` ;
- connaissances et médias utilisent `chat_link_ids` ;
- le runtime de chat exige une configuration.

## Décision

Supprimer **définitivement** le stack legacy. Les objets conservés changent de
source de vérité, jamais de nature.

### 1. Tables supprimées

- `chat_template_versions`
- `chat_templates`
- `template_ai_generations` (si présente)

### 2. Colonnes supprimées

| Table | Colonnes |
| --- | --- |
| `chat_links` | `template_key`, `template_version` |
| `fiches` | `template_key`, `template_version` |
| `base_connaissances` | `template_keys`, `source_template_key`, `ai_generation_id` |
| `medias` | `template_keys` |
| `webhook_endpoints` | `template_key` |
| `webhook_deliveries` | `template_key`, `template_version` |
| `chatbot_drafts` | `ai_sources` (et clés d’état `aiSources` / `stagedKnowledge`) |

La contrainte de périmètre webhook est recréée sur `chat_link_id` seul. Les
endpoints actifs sans chatbot sont soft-deleted (aucun ne peut fonctionner sans
modèle ni configuration).

### 3. APIs et UI supprimées

- `/api/chatbots/ai/*` (génération et modèles de l’assistant IA) ;
- le bouton « Créer avec l’IA » et son état dans `LinkForm` ;
- les routes et permissions legacy `templates:*` ;
- les composants `TemplateAiAssistPanel`, `TemplateAiReview`,
  `KnowledgeMergeDialog`, `TemplateForm`, `TemplatesTable`, `TemplatePreview`,
  `TemplateLivePreview`, `TemplateCards` et les types de génération IA ;
- les sélecteurs de modèle dans la création manuelle de fiche.

### 4. Code supprimé

- `application/use-cases/templates/*` (génération/applique/modèles/prompt IA) ;
- `template-ai-repository` et son adapter PostgreSQL ;
- `chat-template-repository` et son adapter PostgreSQL ;
- `domain/template-ai-draft.ts` ;
- `countAiByTemplate`, `buildFicheFromConversation` (branche modèle legacy) ;
- la portée legacy `template_keys` (connaissances, médias, webhooks) ;
- les champs `templateKey` / `templateVersion` des entités, DTO, dépôts,
  API v1, OpenAPI, API publique et UI.

### 5. Création manuelle de fiche conservée

La création manuelle (`/api/fiches`, `FicheForm`) utilise une définition
intégrée `MANUAL_FICHE_DEFINITION` (champs historique « fiche-projet » :
plateformes, description, budget, durée, contact, statut, contraintesTechno,
lienDocSpec). La fiche est écrite dans `fiches` avec son snapshot `definition`.
Aucune table de modèle n’est requise.

### 6. Objets conservés

- `fiches` (avec `definition`) et `fiche_chat_links` ;
- `chatbot_configs` et `fiche_definitions` ;
- `conversation_fiche_instances` ;
- `conversations`, `prospects` ;
- `base_connaissances`, `medias` (contenu et portée `chat_link_ids`) ;
- **templates visuels** : `visual_templates`, `/templates-visuels`,
  APIs `visual-templates` ;
- `chat_links` (désormais sans colonnes de modèle).

## Migration

1. **0068** : backfill de `fiches.definition` depuis la version de modèle
   correspondante, sans toucher aux fiches déjà pourvues.
2. **0069** : suppression destructive et idempotente (`IF EXISTS`) des objets
   legacy, après recréation de la contrainte webhook.

La suppression est sûre car : 0 lien legacy, 0 fiche sans `definition`, et les
webhooks legacy actifs sont soft-deleted (ils ne peuvent plus être exécutés).

## Vérification

- [ ] `npm run typecheck` passe.
- [ ] `npm run lint` passe.
- [ ] `npm test` passe.
- [ ] `APP_URL=http://localhost:3000 npm run build` passe.
- [ ] Sur une base migrée : `chat_templates`, `chat_template_versions` et
      `template_ai_generations` absents.
- [ ] `chat_links`, `fiches`, `base_connaissances`, `medias`,
      `webhook_endpoints`, `webhook_deliveries`, `chatbot_drafts` sans les
      colonnes listées.
- [ ] Les fiches existantes s’affichent (rendu depuis `fiches.definition`).
- [ ] La création manuelle d’une fiche fonctionne sans modèle.
- [ ] Un chatbot config-based fonctionne (chat, fin, pièces jointes, webhooks).
- [ ] `visual_templates`, `/templates-visuels` et les APIs `visual-templates`
      fonctionnent toujours.
- [ ] Aucune route `/api/chatbots/ai/*` ni `/api/templates/*`.
