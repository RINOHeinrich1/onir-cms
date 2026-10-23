# 0006. IA Infomaniak OpenAI-compatible (chat de prospection)

- **Statut** : Accepté
- **Date** : 2026-10-14
- **Décideurs** : équipe projet

## Contexte

Le chat de prospection doit converser en langage naturel (US-CHAT-001, RM-CHAT-001, RM-IA-001).
Le produit dispose d'un accès API IA Infomaniak (secrets `AI_API_TOKEN`, `AI_PRODUCT_ID`)
et demande le modèle « Qwen 3.5 ».

## Décision

- Endpoint OpenAI-compatible `POST /2/ai/{product_id}/openai/v1/chat/completions`
  (`Authorization: Bearer`), timeout 60 s, erreurs 4xx/5xx converties en erreur 502
  sans casser la conversation.
- Modèle configurable via `AI_MODEL` (défaut `qwen3.5`) ; résolution du défaut
  au runtime via `GET /2/ai/{product_id}/openai/v1/models` si aucun modèle configuré.
- L'IA n'est appelée que côté serveur (jamais exposée au client) ; le token
  ne transite que dans l'environnement du process.
- Prompt système cadré : politesse, cadre strictement professionnel (refus
  du hors-sujet), français naturel, conduite vers la fiche projet.

## Conséquences

- Dépendance au quota/crédits Infomaniak : rate limiting obligatoire sur les
  endpoints publics + honeypot (voir `src/lib/chat-limiters.ts`).
- Modèle interchangeable sans changer le code (variable d'environnement).

## Liens

- RM-IA-001, RM-CHAT-001 ; US-CHAT-001.

## Mise à jour (2026-10-14) — latence anormale

Constat mesuré : le modèle `Qwen/Qwen3.5-122B-A10B-FP8` est un modèle
**raisonneur** ; par défaut il émet une longue chaîne de pensée incluse dans
`completion_tokens` (`reasoning_tokens`), d'où des réponses de plusieurs
dizaines de secondes (jusqu'à ~74 s observés) et, avec un plafond de tokens,
une chaîne vide (`content` = 0).

Mesures comparatives (même prompt court) :

| Configuration | Latence | Raisonnement |
|---|---|---|
| Qwen 3.5 par défaut | 3,3 s (200 tokens de raisonnement, réponse vide) | 200 tokens |
| Qwen 3.5 + `enable_thinking: false` | **1,2 s** | 0 |
| Ministral-3-14B | 0,8 s | 0 |

Décisions appliquées :

- `chat_template_kwargs: { enable_thinking: false }` est envoyé pour les
  modèles `Qwen/*` (voir `src/infrastructure/ai/infomaniak-client.ts`).
- `max_tokens` par défaut (700, et 400 pour les réponses de chat) borne la
  latence ; l'historique envoyé est limité aux 20 derniers messages.
- Chaque appel journalise modèle, durée et tokens de raisonnement.

Résultat en production : `raisonnement=0`, 0,8 à 2,2 s par réponse.
