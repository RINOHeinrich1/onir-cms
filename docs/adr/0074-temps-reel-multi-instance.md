# 0074. Temps réel multi-instance — bus local, Valkey et repli polling

- **Statut** : Proposé
- **Date** : 2026-11-07
- **Décideurs** : équipe projet
- **Référence** : ADR-0042, ADR-0043, ADR-0044, ADR-0035, ADR-0075.
- **Complète** : ADR-0043.
- **Remplace** : aucune.

## Contexte

Le chat utilise SSE pour pousser les nouveaux messages et changements d’état,
avec un polling de secours côté navigateur (ADR-0043). Le bus SSE actuel est
local au process (`src/lib/chat-realtime.ts`, `Map` en mémoire).

En mono-instance, ce fonctionnement est correct. En multi-instance :

- un message publié sur le nœud A n’est pas reçu par un SSE ouvert sur le nœud B ;
- le polling de secours ne s’active que si SSE échoue ; il ne corrige pas un SSE
  resté ouvert mais qui rate les événements des autres nœuds.

Le mode multi-instance sans bus distribué ne doit donc pas conserver un SSE
local silencieusement incorrect.

Valkey est un fork open source de Redis sous licence BSD-3, compatible avec le
protocole Redis. Aucun ADR existant ne le cite ; ADR-0043 mentionne
`LISTEN/NOTIFY`, ADR-0042 mentionne Redis/PostgreSQL pour les rate limits.
Le stockage S3 et les modes mono/multi sont traités par ADR-0075.

## Décision

### 1. Séparer le transport et le bus

Deux responsabilités distinctes :

```text
Transport navigateur : SSE ou polling
Bus serveur          : mémoire locale, Valkey Pub/Sub ou désactivé
```

Le client conserve le SSE comme transport nominal et le polling comme secours.
Valkey ne remplace pas SSE : il transporte les événements entre instances.

### 2. Port applicatif `ChatEventBus`

Un port découple la logique métier de l’infrastructure :

```ts
export interface ChatEventBus {
  publish(conversationId: string, event: ChatRealtimeEvent): Promise<void>;
  subscribe(
    conversationId: string,
    handler: (event: ChatRealtimeEvent) => void,
  ): Promise<() => void>;
  readonly distributed: boolean;
}
```

Adaptateurs :

```text
InProcessChatEventBus   → Map mémoire, mono-instance
ValkeyChatEventBus      → Pub/Sub Valkey, multi-instance
DisabledChatEventBus    → aucun SSE, polling uniquement
```

Les routes et use cases publient via le port. La génération de réponse, la
persistance des messages et les règles métier restent inchangées.

### 3. Modes

| Mode | Bus | Transport |
|---|---|---|
| `local` | mémoire | SSE + polling |
| `valkey` | Valkey Pub/Sub | SSE + polling |
| `polling` | désactivé | polling uniquement |

Le mode `polling` ne doit pas ouvrir de SSE : sinon le client resterait connecté
à un flux qui ne reçoit pas les événements des autres nœuds.

### 4. Configuration

```text
REALTIME_MODE=auto|local|valkey|polling
VALKEY_URL=redis://...
REPLICA_COUNT=1
```

Résolution de `auto` :

1. `VALKEY_URL` défini et Valkey joignable → `valkey` ;
2. sinon `REPLICA_COUNT > 1` → `polling` ;
3. sinon → `local`.

La détection du nombre réel d’instances n’est pas fiable depuis l’application.
`REPLICA_COUNT` doit être fourni par le déploiement. Un mode explicite est
préférable en production.

### 5. Panne Valkey

En cas de perte de connexion Valkey :

- les abonnements SSE sont fermés ;
- les clients basculent en polling ;
- le bus local n’est **pas** utilisé en multi-instance ;
- les messages restent persistés en base et sont récupérés par le polling après
  le dernier `after` connu.

Le SSE ne doit jamais rester ouvert sur un bus dégradé qui ne diffuse plus.

### 6. Capability endpoint

Optionnel, pour éviter une tentative SSE inutile en mode polling :

```text
GET /api/realtime/capabilities
→ { transport: "sse" | "polling", distributed: boolean }
```

Le client peut démarrer directement en polling si `transport=polling`.
Le fallback actuel sur erreur SSE reste suffisant si cet endpoint n’est pas
ajouté.

### 7. Rate limiting

Hors périmètre de cette ADR. Le rate limiting distribué fera l’objet d’une
décision séparée (Valkey, PostgreSQL ou HAProxy). Le bus Valkey pourra être
réutilisé pour ce besoin, mais les deux ports restent distincts.

### 8. HAProxy

- Aucun sticky session nécessaire pour les sessions (stockées en PostgreSQL).
- Timeouts client suffisamment longs pour le SSE.
- Santé des instances via `/api/health`.
- Valkey n’est jamais exposé publiquement.

### 9. Tests

- Mono-instance : SSE + polling, comportement actuel.
- Multi + Valkey : message publié sur A reçu par SSE sur B.
- Multi sans Valkey : `transport=polling`, aucun SSE ouvert.
- Panne Valkey : SSE fermé, polling récupère les messages manquants.
- Rate limit et upload non modifiés par cette ADR.

## Conséquences

### Positives

- trois modes explicites et testables ;
- pas de duplication de la génération de réponse ;
- bus remplaçable sans toucher au métier ;
- fallback polling sûr en multi sans Valkey ;
- compatibilité mono-instance conservée.

### Négatives

- un port et plusieurs adaptateurs à maintenir ;
- Valkey devient une dépendance d’exploitation en mode distribué ;
- le mode polling est moins instantané ;
- la configuration `REPLICA_COUNT` doit être correcte.

## Alternatives écartées

- **SSE local en multi-instance** : rate silencieusement les événements.
- **Sticky sessions seules** : ne diffusent pas les événements entre nœuds.
- **Fallback automatique Valkey → bus local** : faux en multi-instance.
- **Dupliquer les parcours SSE et polling** : maintenance inutile.
- **LISTEN/NOTIFY PostgreSQL** : viable, mais Valkey est retenu pour le pub/sub
  et la réutilisation possible du rate limiting.
