# 0076. Stratégie de cache Valkey — données, TTL et invalidation

- **Statut** : Proposé
- **Date** : 2026-11-08
- **Décideurs** : équipe projet
- **Référence** : ADR-0004, ADR-0025, ADR-0036, ADR-0074, ADR-0075.
- **Complète** : ADR-0074, ADR-0075.
- **Remplace** : aucune.

## Contexte

L’application est passée en multi-instance derrière HAProxy, avec :

- deux nœuds Next.js dans deux régions ;
- PostgreSQL partagé ;
- SeaweedFS pour le stockage ;
- Valkey pour le temps réel (`REALTIME_MODE=valkey`).

La latence réseau entre les nœuds et PostgreSQL est mesurée :

| Liaison | RTT moyen |
|---|---:|
| Next.js `141` (Gravelines, FR) → PostgreSQL `167` (Montréal, CA) | **79,0 ms** |
| HAProxy `51` (Londres, UK) → PostgreSQL `167` | **77,1 ms** |
| HAProxy `51` → Next.js `141` | **4,2 ms** |
| Next.js `167` → PostgreSQL locale | **0,16 ms** |

Requête `SELECT 1` :

| Origine | p50 | p95 |
|---|---:|---:|
| Next.js `141` → DB `167` | **79,26 ms** | **81,93 ms** |
| Next.js `167` → DB locale | **0,16 ms** | **0,34 ms** |

Conséquences :

- depuis `141`, chaque requête SQL séquentielle coûte ~79 ms ;
- 10 requêtes = ~790 ms ;
- 50 requêtes = ~3,95 s ;
- le cache ne doit pas être pensé uniquement comme un cache « proche de la DB » :
  un Valkey situé à Montréal coûte aussi ~79 ms depuis `141`.

Le cache doit donc principalement :

1. éviter les lectures répétées de **configuration** et de **contexte d’authentification** ;
2. ne pas cacher les données métier write-heavy ;
3. rester correct en multi-instance ;
4. ne jamais devenir une dépendance bloquante.

## Décision

### 1. Principe directeur

Une donnée est cacheable si elle respecte les quatre critères suivants :

1. elle est lue plusieurs fois ;
2. elle est modifiée rarement ;
3. une faible stale est acceptable ;
4. elle n’est pas critique pour la sécurité, les quotas ou la cohérence métier.

Le cache est **cache-aside** :

```text
lire cache
  hit  → retourner
  miss → lire PostgreSQL
         écrire cache avec TTL
```

PostgreSQL reste la source de vérité. Aucune donnée métier ne doit exister
**uniquement** dans Valkey.

### 2. Données à mettre en cache

#### Priorité 0 — sessions et configuration de chat

| Donnée | Clé | L1 mémoire | L2 Valkey | Invalidation |
|---|---|---:|---:|---|
| Session + user + org + rôle | `session:{sha256(token)}` | 15 s | 30 s, plafonné à `expiresAt` | logout, switch org, changement de rôle, mot de passe, compte désactivé |
| Config stable du lien | `link:{linkId}:cfg` et `linktoken:{sha256(token)}:cfg` | 60 s | 5 min | update/revoke/token rotate du lien |
| État du lien | `link:{linkId}:state` | 5 s | 15 s | update/revoke, changement de quota |
| Version de config chatbot | `botcfg:{configId}` | 5 min | 1 h–24 h | aucune : nouvelle version = nouvelle clé |
| Organisation | `org:{orgId}` | 30 s | 5 min | rename, suspension |

La configuration de chat est le meilleur candidat :

- `chatbot_configs` est versionnée et immuable ;
- une nouvelle configuration crée une nouvelle ligne et un nouvel ID ;
- le lien pointe vers `current_config_id` ;
- le cache d’une version peut donc vivre longtemps.

Attention : `chat_links` mélange des champs stables et des champs mutables
(`actif`, `expires_at`, `tokens_used`, `fiches_generated`, `visit_count`).
Il ne faut **pas cacher l’entité `ChatLink` complète** :

```text
link_config  → stable, cacheable
link_state   → actif/expiré/quota, TTL court ou DB
```

La méthode `findByTokenHash` exécute aussi une remise à zéro des périodes de
tokens expirées avant la lecture. Un cache au niveau du repository casserait
cette logique.

#### Priorité 1 — référentiels et configuration

| Donnée | Clé | L1 | L2 | Invalidation |
|---|---|---:|---:|---|
| Catégories | `org:{orgId}:categories` | 60 s | 10 min | CRUD catégorie |
| Confidentialités | `org:{orgId}:confidentialites` | 60 s | 10 min | CRUD confidentialité |
| Templates visuels assignés | `org:{orgId}:visual-templates` | 60 s | 10 min | assign/unassign/import |
| Version de template visuel | `vt:{templateId}:{version}` | 5 min | 1 h–24 h | aucune : version immuable |
| Résultats de bindings de données | clé existante avec `revision` | selon binding | selon binding | nouvelle `revision` = nouvelle clé |
| Médias actifs par lien et type | `media:{linkId}:{type}:{revision}` | 30 s | 2–5 min | CRUD média / assignation |
| Connaissances actives par lien | `knowledge:{linkId}:{revision}` | 30 s | 1–5 min | CRUD connaissance / assignation |

Pour les connaissances et médias :

- ne pas mettre un corpus de plusieurs Mo dans une seule valeur Valkey ;
- si la liste dépasse ~100–250 Ko, cacher un index d’IDs + une révision,
  puis les documents individuellement ;
- ou conserver la liste en L1 local avec une taille maximale.

#### Priorité 2 — agrégats et métadonnées

| Donnée | Clé | TTL | Invalidation |
|---|---|---:|---|
| Statistiques dashboard | `org:{orgId}:stats:{rangeHash}` | 30–60 s | TTL suffit |
| Catalogue de modèles IA | `ai:models:{providerId}` | 5–15 min | mise à jour fournisseur |
| Secrets applicatifs | cache mémoire existant | — | mécanisme ADR-0036 inchangé |
| Cache de données de templates | clé existante + `revision` | TTL du binding | migrer le cache mémoire vers L2 |

### 3. Données à ne pas cacher

| Donnée | Raison |
|---|---|
| Conversations et messages | écrits en continu, SSE, ordre et cohérence importants |
| Prospects, fiches, leads | données métier par utilisateur, write-heavy, invalidation complexe |
| Compteurs de quotas (`tokens_used`, `fiches_generated`, `visit_count`) | une valeur stale peut autoriser un dépassement de quota |
| Réponses IA | personnalisées, coûteuses à invalider, risque de fuite de données |
| Hash de mot de passe et tokens bruts | jamais en cache |
| Décisions d’autorisation longues | risque d’élévation de privilèges après retrait d’un rôle |
| Listes paginées du dashboard | changement permanent, gain faible |
| Corps binaire des médias | laisser S3/CDN/navigateur s’en charger |
| Pages HTML complètes personnalisées | dépendantes de l’utilisateur et de l’organisation |

Les listes de conversations, prospects, fiches et leads peuvent utiliser une
mémoïsation **par requête** (React `cache`, DataLoader), mais pas un cache
persistant Valkey.

### 4. Convention de clés

```text
onir:v1:session:{sha256(token)}
onir:v1:org:{orgId}
onir:v1:link:{linkId}:cfg
onir:v1:link:{linkId}:state
onir:v1:linktoken:{sha256(token)}:cfg
onir:v1:botcfg:{configId}
onir:v1:vt:{templateId}:{version}
onir:v1:org:{orgId}:categories
onir:v1:org:{orgId}:confidentialites
onir:v1:org:{orgId}:visual-templates
onir:v1:org:{orgId}:stats:{rangeHash}
onir:v1:media:{linkId}:{type}:{revision}
onir:v1:knowledge:{linkId}:{revision}
onir:v1:template-data:{bindingId}:{revision}:{contract}:{inputs}
```

Règles :

- préfixe `onir:v1` pour permettre une invalidation globale par changement de
  version de schéma ;
- identifiant d’organisation dans toutes les clés multi-tenant ;
- jamais de token brut dans une clé : utiliser le hash ;
- ne pas partager les préfixes du bus temps réel (`realtime`) et des rate limits
  (`ratelimit`) avec le cache de données ;
- utiliser un `db` Valkey séparé ou une instance séparée pour le cache si les
  politiques d’éviction diffèrent.

### 5. Politique de TTL

- TTL obligatoire sur toutes les clés de cache de données ;
- jitter de ±10 % pour éviter les expirations simultanées ;
- L1 plus court que L2 ;
- session plafonnée à `expiresAt` ;
- pas de TTL infini, même pour une version immutable : garder un plafond
  (1 h–24 h) et une éviction LRU ;
- une clé peut être supprimée avant son TTL par invalidation.

Valeurs de départ recommandées :

| Donnée | TTL L1 | TTL L2 |
|---|---:|---:|
| Session | 15 s | 30 s |
| État de lien | 5 s | 15 s |
| Config de lien | 60 s | 5 min |
| Config chatbot | 5 min | 1 h |
| Organisation | 30 s | 5 min |
| Référentiels | 60 s | 10 min |
| Connaissances / médias | 30 s | 1–5 min |
| Statistiques | 15 s | 30–60 s |
| Templates visuels | 5 min | 1 h |

### 6. Politique d’invalidation

#### Règle 1 — invalider après commit

```text
écriture PostgreSQL
  → COMMIT
  → suppression des clés L2
  → publication d’un événement d’invalidation
  → suppression des clés L1 sur chaque instance
```

Ne jamais écrire ou supprimer le cache avant le commit.

#### Règle 2 — préférer les clés versionnées

Pour les données versionnées ou immuables, ne pas invalider :

```text
botcfg:{configId}
vt:{templateId}:{version}
template-data:{bindingId}:{revision}:...
```

Une nouvelle version crée une nouvelle clé. Les anciennes expirent.

#### Règle 3 — matrice d’invalidation

| Événement | Clés à invalider |
|---|---|
| login / logout / switch organisation | `session:{hash}` ; index des sessions de l’utilisateur |
| changement de rôle / retrait de membre | sessions de l’utilisateur + `membership:{orgId}:{userId}` |
| mise à jour ou révocation d’un lien | `link:{id}:cfg`, `link:{id}:state`, `linktoken:{hash}:cfg` |
| rotation du token de lien | ancien et nouveau `linktoken:{hash}:cfg` |
| nouvelle version de config chatbot | nouvelle clé `botcfg:{configId}` ; invalider `link:{id}:cfg` |
| suspension d’organisation | `org:{id}` + sessions de l’org + configs de liens de l’org |
| CRUD catégories | `org:{id}:categories` |
| CRUD confidentialité | `org:{id}:confidentialites` |
| CRUD média | `media:{linkId}:{type}:{revision}` |
| CRUD connaissance | `knowledge:{linkId}:{revision}` |
| sauvegarde d’un binding de données | nouvelle `revision` ; pas de purge |
| publication d’un template visuel | nouvelle clé `vt:{id}:{version}` |

#### Règle 4 — invalidation multi-instance

- supprimer la clé L2 partagée ;
- publier un événement `cache:invalidate` sur Valkey ;
- chaque instance supprime ses clés L1 correspondantes ;
- en cas d’échec de publication, le TTL reste le filet de sécurité.

Le bus d’invalidation doit être distinct du bus SSE métier, même s’il peut
réutiliser la même instance Valkey.

### 7. Architecture de cache

```text
L1 : mémoire du processus Next.js
     TTL court, petite taille, pas de réseau
     configs chaudes, sessions, petits référentiels

L2 : Valkey
     TTL plus long, partagé entre instances
     invalidation par pub/sub

DB : PostgreSQL
     source de vérité
```

Le L1 est indispensable dans la topologie actuelle :

- `141` → Valkey `167` coûte aussi ~79 ms ;
- un cache L2 central à Montréal ne réduit donc pas la latence de `141` ;
- il peut seulement remplacer plusieurs requêtes SQL par un seul aller-retour
  Valkey ;
- le L1 local évite complètement ce coût.

#### Multi-région

Deux options :

1. **Recommandé** : rapprocher les nœuds Next.js, PostgreSQL et Valkey dans la
   même région ;
2. si les régions restent séparées :
   - L1 local fort ;
   - Valkey par région ;
   - invalidation inter-régions par pub/sub ;
   - ou accepter 79 ms par accès L2.

Un cache Valkey à Montréal n’est pas un cache local pour le nœud de Gravelines.

### 8. Gestion des accès concurrents

- **single-flight** par instance pour les clés chaudes ;
- verrou distribué `SET NX PX 5000` pour éviter le stampede multi-instance ;
- stale-while-revalidate toléré **30 s maximum** pour les données non critiques ;
- TTL avec jitter ;
- taille maximale par valeur (par exemple 100–250 Ko) ;
- éviction LRU pour les données de cache.

### 9. Panne Valkey

Le cache ne doit jamais faire tomber l’application :

- timeout court, par exemple **20–50 ms** ;
- si Valkey est indisponible → lire PostgreSQL ;
- circuit breaker ;
- métriques de fallback ;
- pour les sessions : fallback DB obligatoire ;
- pour les rate limits : décision distincte à prendre, mais pas de blocage
  silencieux de l’application.

### 10. Sécurité et multi-tenant

- Valkey non exposé publiquement ;
- accès réseau restreint et authentification si disponible ;
- aucune valeur de secret (mot de passe, token brut, clé API) dans le cache ;
- données de session limitées au strict nécessaire ;
- pas de log de valeur de cache ;
- clé toujours scopée par `organizationId` ;
- tests d’isolation inter-organisations obligatoires ;
- révocation d’un lien ou suspension d’une organisation : invalidation
  immédiate, avec TTL de secours très court (15 s maximum) ;
- les actions d’administration sensibles peuvent bypasser le cache.

### 11. Observabilité

Métriques minimales :

- taux de hit/miss par famille de clés ;
- latence de lookup L1/L2 ;
- nombre d’évictions ;
- taille mémoire ;
- stale-while-revalidate servi ;
- échecs d’invalidation ;
- fallback Valkey → DB ;
- taux de stampede / verrous pris.

Un cache sans métriques de hit rate et d’invalidation est un pari, pas une
décision d’architecture.

### 12. Tests

- hit/miss et TTL ;
- invalidation après commit ;
- lecture sur une seconde instance après invalidation ;
- isolation entre organisations ;
- fallback DB quand Valkey est indisponible ;
- stampede sur une clé froide ;
- révocation de lien et suspension d’organisation ;
- changement de rôle et switch d’organisation ;
- absence de fuite de tokens ou de secrets dans les clés et les logs.

### 13. Ordre de mise en œuvre

1. **Sessions + rôles + organisations** : gain sur toutes les pages dashboard.
2. **Config de lien + config chatbot** : gain sur le parcours public de chat.
3. **Templates visuels + confidentialités + catégories**.
4. **Données de templates** : déplacer le cache mémoire vers L2.
5. **Médias + connaissances**, avec limite de taille.
6. **Statistiques** en TTL court.
7. **Rate limits** en Valkey.

Le rate limiting n’est pas du cache de données, mais il est nécessaire à la
cohérence multi-instance : `src/lib/rate-limit.ts` est aujourd’hui en mémoire
par processus. Avec deux nœuds, chaque nœud applique sa propre limite et un
client peut consommer le double.

## Conséquences

### Positives

- réduction forte des lectures répétées de configuration et de session ;
- meilleure utilisation des deux nœuds Next.js ;
- politique explicite sur ce qui ne doit pas être caché ;
- invalidation traçable et testable ;
- possibilité de garder le L1 local pour les nœuds éloignés de Valkey ;
- pas de dépendance du cache pour la vérité métier.

### Négatives

- complexité d’invalidation multi-instance ;
- nécessité d’un bus d’invalidation et de métriques ;
- risque de stale sur les sessions, les rôles et les révocations ;
- cache L2 central peu utile pour un nœud situé dans une autre région ;
- nécessité de tests multi-instance ;
- le cache mémoire existant des données de templates doit être revu.

## Alternatives écartées

- **Cacher les entités complètes `ChatLink` / conversations** : trop de champs
  mutables, quotas et SSE.
- **Cacher les réponses IA** : personnalisation, coût d’invalidation et fuite de
  données.
- **Un seul gros cache Valkey sans préfixe** : collisions avec le temps réel et
  les rate limits.
- **TTL infini** : mémoire non bornée et données obsolètes.
- **Invalidation avant commit** : cache potentiellement désynchronisé.
- **Cache uniquement central à Montréal** : ne corrige pas la latence de `141`.
- **Sticky sessions** : ne règlent ni le cache ni la cohérence multi-instance.

## Points ouverts à étudier

- faut-il déplacer PostgreSQL et/ou les nœuds Next.js dans la même région ?
- faut-il un Valkey par région ou un Valkey central ?
- niveau de stale acceptable pour les sessions et les révocations de liens ;
- taille réelle des listes de connaissances et de médias ;
- cache L1 mémoire versus cache L2 pour les données de templates ;
- stratégie des rate limits : Valkey, PostgreSQL ou HAProxy ;
- politique d’éviction et dimensionnement mémoire de Valkey ;
- nécessité d’un cache de statistiques par utilisateur ou par organisation.

## Références code

- `src/app/api/_lib/require-user.ts` : session + rôle lus en DB à chaque requête.
- `src/infrastructure/session/current-user.ts` : même résolution côté server
  components.
- `src/infrastructure/db/session-repository.ts` : jointure session + user + org.
- `src/infrastructure/db/chat-link-repository.ts` : lecture du lien, quotas et
  remise à zéro des tokens.
- `src/infrastructure/db/chatbot-config-repository.ts` : configurations
  versionnées et immuables.
- `src/infrastructure/db/connaissance-repository.ts` : connaissances actives par
  lien.
- `src/infrastructure/db/media-repository.ts` : médias actifs par lien et type.
- `src/lib/template-data-cache.ts` : cache mémoire local des données de templates.
- `src/lib/rate-limit.ts` : rate limiting en mémoire par processus.
- `src/infrastructure/realtime/valkey-chat-event-bus.ts` : usage Valkey existant
  pour le temps réel.
