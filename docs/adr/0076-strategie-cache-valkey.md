# 0076. Cache runtime local par nœud Next.js

- **Statut** : Proposé
- **Date** : 2026-11-08
- **Décideurs** : équipe projet
- **Référence** : ADR-0074, ADR-0075, ADR-0078, ADR-0079.
- **Complète** : ADR-0074, ADR-0075.
- **Remplace** : aucune.

## Contexte

L’application est multi-instance derrière HAProxy :

- `141` : Next.js ;
- `167` : Next.js + PostgreSQL + Valkey + SeaweedFS ;
- PostgreSQL est distant pour `141`.

La latence mesurée est structurante :

| Liaison | RTT moyen |
|---|---:|
| Next.js `141` → PostgreSQL `167` | **79,0 ms** |
| Next.js `167` → PostgreSQL locale | **0,16 ms** |
| `141` → Valkey `167` | **~79 ms** |

Chaque requête SQL ou accès Valkey depuis `141` coûte donc environ 79 ms.

Le chargement d’un tour de chat peut impliquer :

- le lien et sa configuration stable ;
- la version courante du chatbot ;
- la définition de la fiche de collecte ;
- les connaissances actives ;
- les médias actifs ;
- le prompt compilé ;
- les paramètres d’organisation.

À grande échelle, refaire toutes ces lectures PostgreSQL à chaque tour est
nuisible à la vitesse de chargement des chatbots et à la fluidité des
conversations.

La priorité est donc :

1. accélérer le runtime des chatbots ;
2. accélérer les conversations ;
3. ne pas dépendre d’un cache central distant ;
4. ne pas coupler le métier au cache ;
5. conserver PostgreSQL comme source de vérité.

Les configurations d’administration, les listes du dashboard, les sessions et
les statistiques ne sont **pas** le périmètre prioritaire de cette optimisation.

## Décision

### 1. Un Valkey local par nœud Next.js

Chaque nœud Next.js possède son propre Valkey de cache :

```text
141 : Next.js + Valkey local
167 : Next.js + Valkey local
```

Le Valkey central existant n’est **pas** utilisé pour servir les données de
cache à distance :

- il reste utilisé pour le temps réel ;
- il peut servir de bus d’invalidation ;
- il ne doit pas être le cache de données de `141`.

Un cache local évite les 79 ms de WAN à chaque hit. Le cache ne doit pas
transformer un problème de lecture PostgreSQL en problème de lecture Valkey
distante.

### 2. Architecture à trois niveaux

```text
L1 : mémoire du processus Next.js
     TTL court, pas de réseau
     configs chaudes et pointeurs

L2 : Valkey local au nœud
     TTL plus long, données runtime
     pas de partage de données entre nœuds

Bus : Valkey central
     uniquement événements d’invalidation
     pas de données runtime

DB : PostgreSQL
     source de vérité
```

Règles :

- un hit L1 ne fait aucun appel réseau ;
- un hit L2 reste sur la machine ;
- le bus central ne transporte que des événements légers ;
- PostgreSQL est lu immédiatement en cas de miss ou de panne cache.

### 3. Données cacheables

#### Priorité 0 — runtime de chat

| Donnée | Clé | TTL L1 | TTL L2 local |
|---|---|---:|---:|
| Version de config chatbot | `runtime:config:{configId}` | 5 min | 1 h–24 h |
| Définition de fiche | `runtime:fiche:{configId}:{ficheKey}` | 5 min | 1 h |
| Prompt compilé | `runtime:prompt:{configId}:{revision}:{lang}` | 5 min | 1 h |
| Config stable du lien | `runtime:link:{linkId}:cfg:{revision}` | 60 s | 5 min |
| Connaissances actives | `runtime:knowledge:{linkId}:{revision}` | 30 s | 1–5 min |
| Médias actifs | `runtime:media:{linkId}:{revision}` | 30 s | 1–5 min |
| Organisation | `runtime:org:{orgId}:{revision}` | 30 s | 5 min |

Les données versionnées ou immuables sont préférées : une nouvelle version
crée une nouvelle clé et les anciennes expirent.

### 4. Données non cacheables

| Donnée | Raison |
|---|---|
| Messages et conversations | écrits en continu, SSE, cohérence |
| Prospects, fiches générées, leads | données métier write-heavy |
| Quotas (`tokens_used`, `fiches_generated`, `visit_count`) | risque de dépassement |
| Réponses IA | personnalisées, coûteuses, fuite de données |
| Sessions et rôles | hors priorité, décision séparée |
| Listes paginées | changement permanent, gain faible |
| Binaires médias | laisser S3/CDN/navigateur |
| Statistiques dashboard | hors priorité runtime |
| Référentiels d’administration | hors priorité runtime |

Les messages peuvent être mémoïsés **par requête** (`React.cache`, DataLoader),
mais pas dans Valkey.

### 5. Révisions et pointeurs

L’invalidation doit s’appuyer sur des révisions, pas sur des suppressions
massives.

Révisions nécessaires :

- `chatbot_configs.version` : existe déjà ;
- révision des connaissances par lien ;
- révision des médias par lien ;
- révision des paramètres d’organisation ;
- révision de la config stable du lien.

Pointeurs courts :

```text
runtime:pointer:link:{linkId}
runtime:pointer:knowledge:{linkId}
runtime:pointer:media:{linkId}
runtime:pointer:org:{orgId}
```

TTL : **15–30 s**.

### 6. Convention de clés

```text
onir:runtime:v1:config:{configId}
onir:runtime:v1:fiche:{configId}:{ficheKey}
onir:runtime:v1:prompt:{configId}:{revision}:{lang}
onir:runtime:v1:link:{linkId}:cfg:{revision}
onir:runtime:v1:linktoken:{sha256(token)}:cfg:{revision}
onir:runtime:v1:knowledge:{linkId}:{revision}
onir:runtime:v1:media:{linkId}:{revision}
onir:runtime:v1:org:{orgId}:{revision}
onir:runtime:v1:pointer:{type}:{id}
```

Règles :

- préfixe `onir:runtime:v1` ;
- identifiant d’organisation dans les clés multi-tenant ;
- jamais de token brut : utiliser le hash ;
- ne pas mélanger avec le temps réel (`realtime`) ni le rate limiting
  (`ratelimit`) ;
- base ou namespace Valkey local dédié au cache ;
- base locale distincte de la base de rate limiting.

### 7. Chemin de lecture

```text
L1 mémoire
  ↓ miss
Valkey local
  ↓ miss
PostgreSQL
  ↓
écriture L2 local + L1
```

En cas d’indisponibilité du Valkey local :

```text
L1 → PostgreSQL
```

Le cache ne doit jamais faire échouer une requête.

### 8. Chemin d’écriture et cohérence

Après une écriture :

```text
transaction PostgreSQL
  → incrément de révision
  → COMMIT
  → publication d’un événement d’invalidation
  → mise à jour des pointeurs locaux
  → purge L1/L2 local
```

Ne jamais publier ou supprimer avant le commit.

Événement minimal :

```json
{ "type": "knowledge", "id": "link-123", "revision": 42 }
```

Le bus central ne transporte pas les données, seulement les révisions.

### 9. Invalidation multi-nœuds

- les données ne sont pas partagées entre les Valkey locaux ;
- chaque nœud possède ses propres entrées ;
- l’événement d’invalidation est publié sur le bus central ;
- chaque nœud met à jour son pointeur et supprime ses clés locales ;
- si un événement est perdu, le TTL reste le filet de sécurité ;
- les clés versionnées permettent de ne pas purger les anciennes entrées.

Le bus d’invalidation doit être distinct du bus SSE métier, même s’il peut
réutiliser la même instance Valkey centrale.

### 10. Cohérence attendue

- **config chatbot** : stale max 30 s en cas d’événement perdu ;
- **connaissances/médias** : stale max 1–5 min ;
- **pointeurs** : stale max 15–30 s ;
- **révocation de lien / suspension** : stale max 5 s ou lecture DB directe ;
- **read-your-writes admin** : forcer la version retournée par l’écriture ou
  bypasser le cache pour la lecture immédiate.

Le cache est eventual consistent, pas fortement cohérent.

### 11. Panne Valkey

#### Valkey local indisponible

- L1 reste utilisable ;
- sinon lecture PostgreSQL ;
- aucun échec applicatif ;
- métrique `cache_degraded`.

#### Bus central d’invalidation indisponible

- les caches locaux continuent de servir ;
- les TTL bornent la staleness ;
- alerte sur l’état du bus ;
- reprise automatique des abonnements.

#### Nœud froid

- miss ;
- reconstruction progressive ;
- pas de préchargement massif de toutes les organisations.

### 12. Gestion de la mémoire

- `maxmemory` explicite sur chaque Valkey local ;
- politique `allkeys-lru` pour le cache ;
- ne pas héberger le rate limiting dans ce Valkey local ;
- ne pas cacher toutes les connaissances de toutes les organisations ;
- limiter la taille d’une valeur ;
- si un corpus est trop gros : index d’IDs + documents individuels, ou L1
  local avec taille maximale ;
- métrique mémoire et évictions.

### 13. Sécurité et multi-tenant

- Valkey local non exposé publiquement ;
- accès local uniquement ;
- clé toujours scopée par `organizationId` ;
- pas de secrets, tokens bruts ou mots de passe en cache ;
- pas de logs de valeurs ;
- tests d’isolation inter-organisations ;
- révocation/suspension : TTL court ou DB directe.

### 14. Observabilité

Métriques minimales :

- hit/miss L1 et L2 ;
- latence de lookup ;
- requêtes PostgreSQL évitées ;
- taux de reconstruction ;
- mémoire et évictions ;
- invalidations reçues et échouées ;
- fallback Valkey local → PostgreSQL ;
- staleness détectée ;
- état du bus central.

### 15. Tests

- hit L1 sans réseau ;
- hit L2 local sans PostgreSQL ;
- miss → PostgreSQL → cache ;
- invalidation après commit ;
- propagation vers un second nœud ;
- panne Valkey local → fallback PostgreSQL ;
- panne bus central → TTL ;
- révocation de lien ;
- suspension d’organisation ;
- isolation inter-organisations ;
- mémoire bornée ;
- read-your-writes admin ;
- nœud froid.

### 16. Ordre de mise en œuvre

Cette tâche vient **après** le rate limiting IA (ADR-0079).

1. Mesurer la baseline : requêtes PostgreSQL par tour de chat et p95.
2. Ajouter les révisions manquantes.
3. Créer le port `RuntimeCache` et les adaptateurs L1 / Valkey local / noop.
4. Cacher config, fiche et prompt.
5. Cacher connaissances et médias avec limite de taille.
6. Mettre en place le bus d’invalidation.
7. Ajouter le fallback PostgreSQL.
8. Tester deux nœuds et les pannes.
9. Mesurer et déployer.

## Conséquences

### Positives

- hits de cache sans traversée WAN ;
- réduction forte des lectures PostgreSQL par tour de chat ;
- meilleure fluidité des conversations ;
- cache local indépendant par nœud ;
- pas de couplage métier à Valkey ;
- dégradation propre vers PostgreSQL ;
- politique de cohérence explicite et bornée.

### Négatives

- mémoire supplémentaire sur chaque nœud Next.js ;
- invalidation multi-nœuds à superviser ;
- staleness bornée mais réelle ;
- nécessité de révisions en base ;
- caches froids après redémarrage ;
- pas de cache partagé entre nœuds.

## Alternatives écartées

- **Valkey central comme cache de données** : 79 ms par hit depuis `141`.
- **Cache distribué répliqué** : complexité disproportionnée.
- **Cacher les conversations ou les quotas** : incohérence métier.
- **TTL infini** : mémoire non bornée et données obsolètes.
- **Suppression globale du cache à chaque écriture** : trop brutal et inutile.
- **Cacher les configurations d’administration en priorité** : hors besoin.

## Points ouverts

- taille réelle des connaissances et médias actifs ;
- valeurs exactes des TTL ;
- schéma des révisions connaissances/médias ;
- dimensionnement mémoire des Valkey locaux ;
- choix du bus d’invalidation ;
- niveau de stale acceptable pour les liens publics ;
- politique de préchargement éventuelle des chatbots très actifs.

## Références code

- `src/infrastructure/db/chatbot-config-repository.ts` : configurations
  versionnées.
- `src/infrastructure/db/chat-link-repository.ts` : lien, quotas et tokens.
- `src/infrastructure/db/connaissance-repository.ts` : connaissances actives.
- `src/infrastructure/db/media-repository.ts` : médias actifs.
- `src/lib/template-data-cache.ts` : cache mémoire existant, hors périmètre
  immédiat.
- `src/infrastructure/realtime/valkey-chat-event-bus.ts` : usage Valkey
  existant.
- `src/lib/rate-limit.ts` : rate limiting, traité par ADR-0079.
