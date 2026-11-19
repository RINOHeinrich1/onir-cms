# 0094. Cache chaud des chatbots — hot set LRU borné par nœud

- **Statut** : Accepté
- **Date** : 2026-11-17
- **Décideurs** : équipe projet
- **Référence** : ADR-0074, ADR-0075, ADR-0076.
- **Complète** : ADR-0076 (§11, §12 et point ouvert « politique de préchargement »).
- **Remplace** : aucune.

## Contexte

Le cache runtime V1 (ADR-0076) fonctionne uniquement à la demande :

```text
requête → L1 → Valkey local → PostgreSQL
```

Il n'existe aucune politique de préchargement. Les entrées sont créées au
premier accès, puis expirent selon leur TTL. Les TTL V1 sont courts pour les
données variables :

| Donnée | TTL L2 |
|---|---:|
| Config chatbot | 1 h |
| Config de lien | 30 s |
| Connaissances | 60 s |
| Médias | 60 s |

Deux effets en découlent :

1. un chatbot peu sollicité est souvent froid ;
2. le trafic étant réparti entre plusieurs nœuds, un chatbot chauffé sur un
   nœud peut être froid sur l'autre.

Le point ouvert d'ADR-0076 (« politique de préchargement éventuelle des
chatbots très actifs ») est donc traité ici.

La proposition retenue est un **hot set borné** : précharger un nombre limité
de chatbots, puis remplacer les moins récemment utilisés seulement lorsque la
capacité est atteinte. Sous le seuil, aucune éviction n'a lieu.

Ce dispositif concerne les **données runtime** du chatbot (config,
connaissances, médias). Il ne préchauffe pas le fournisseur IA et ne met pas en
cache les réponses IA.

## Décision

### 1. Hot set par nœud

Chaque nœud Next.js possède son propre hot set, comme son cache L2 local.

- capacité configurable `N` ;
- aucune donnée runtime partagée entre nœuds ;
- le bus central reste réservé à l'invalidation.

Le hot set est un ensemble de **références** vers des chatbots chauds. Les
données restent dans les clés de cache existantes.

### 2. Index LRU dans le Valkey local

Index :

```text
onir:runtime:v1:hot:links     ZSET
membre : <organizationId>:<chatLinkId>
score  : timestamp de dernière utilisation (ms)
```

Règles :

- un accès met à jour le score (`ZADD`) ;
- tant que `ZCARD < N`, on ajoute sans supprimer ;
- quand `ZCARD >= N`, on ajoute le nouveau puis on retire le membre de plus
  petit score (LRU) ;
- l'ancienneté est la **dernière utilisation**, jamais la date de création ou
  de préchargement ;
- l'ajout et l'éviction doivent être atomiques (script Lua ou transaction
  Valkey) pour éviter les courses entre requêtes concurrentes.

### 3. Préchargement initial

Au démarrage du serveur, un warmer asynchrone remplit le hot set avec les `N`
chatbots les plus récemment actifs.

- source : liens actifs triés par activité récente de conversation ;
- chargement initial non bloquant : le serveur ne doit pas attendre le
  warm-up pour répondre ;
- les erreurs de warm-up sont journalisées et n'échouent jamais une requête ;
- aucun préchargement massif de toutes les organisations.

Un rafraîchissement périodique complète les entrées manquantes ou expirées. Il
ne réécrit pas tout le cache à chaque passage.

### 4. Admission à l'usage

Le hot set est mis à jour dans le chemin normal, sans requête supplémentaire :

- hit de config, connaissances ou médias → `touchHotLink` ;
- miss → chargement PostgreSQL, écriture cache, puis `touchHotLink` ;
- si le lien est déjà membre, seul son score change ;
- s'il est absent et que la capacité n'est pas atteinte, il est ajouté ;
- s'il est absent et que la capacité est atteinte, il est ajouté puis le LRU
  est évincé.

Cette règle applique exactement le comportement demandé : **pas de
remplacement tant que le seuil n'est pas atteint**.

### 5. Périmètre préchargé

Phase 1 :

- configuration courante du chatbot ;
- définition de fiche utile au runtime.

Phase 2, si les métriques montrent un gain :

- connaissances sélectionnées ;
- médias actifs, uniquement si leur volume est faible.

Ne pas précharger :

- les gros corpus de médias ;
- les conversations, messages, quotas et prospects ;
- les réponses IA ;
- les listes d'administration.

La config de lien (`link-config`) conserve son TTL court : le chat résout déjà
sa configuration par `configId`, elle n'est donc pas la cible principale du
hot set.

### 6. TTL du hot set

Le hot set ne doit pas être vidé par les TTL courts conçus pour le cache à la
demande.

- config : TTL actuel de `1 h` ;
- connaissances/médias préchargés : TTL dédié de `5 à 15 min` ;
- rafraîchissement avant expiration pour les membres du hot set ;
- l'invalidation après écriture reste prioritaire et immédiate.

Une entrée chaude expirée peut rester membre du hot set : le warmer la recharge
ou elle est évincée naturellement si elle n'est plus utilisée.

### 7. Éviction

À l'éviction d'un chatbot :

1. retirer le membre du ZSET ;
2. supprimer ses clés `knowledge` et `media` locales ;
3. supprimer sa clé `config` via une correspondance
   `hot:link:<org>:<link>` → `configId` ;
4. purger les entrées L1 correspondantes ;
5. ne pas publier d'invalidation centrale : l'éviction est locale au nœud.

Cela nécessite une méthode de purge **locale** distincte de
`invalidatePrefix`, qui aujourd'hui publie aussi sur le bus central.

### 8. Protection contre les tempêtes

Un single-flight par `organizationId:chatLinkId` est requis :

- une seule requête charge un chatbot froid ;
- les requêtes concurrentes attendent le même résultat ;
- le single-flight est local au processus ou au nœud.

Sans cela, plusieurs requêtes simultanées peuvent charger PostgreSQL en parallèle
et annuler le bénéfice du cache.

### 9. Configuration

Variables proposées :

```text
RUNTIME_CACHE_HOT_LINKS=30
RUNTIME_CACHE_HOT_KNOWLEDGE_TTL_MS=600000
RUNTIME_CACHE_HOT_MEDIA_TTL_MS=600000
RUNTIME_CACHE_WARM_INTERVAL_MS=300000
```

- `RUNTIME_CACHE_HOT_LINKS=0` désactive le hot set ;
- `N` est un paramètre par nœud, pas un quota global ;
- les valeurs doivent être ajustées selon la mémoire et le hit rate observés.

### 10. Mémoire et éviction Valkey

Le hot set applicatif ne remplace pas les garde-fous Valkey :

- `maxmemory` explicite sur chaque Valkey local ;
- politique `allkeys-lru` pour le cache ;
- métriques mémoire et évictions ;
- taille maximale par valeur ;
- pas de rate limiting dans ce Valkey.

Le L1 actuel est un FIFO de 1 000 entrées. Il reste best-effort, mais une
politique LRU est préférable pour rester cohérent avec le hot set.

### 11. Observabilité

Métriques minimales :

- taille du hot set et nombre d'évictions ;
- hits/misses L1 et L2 par famille ;
- durée et succès/échec du warm-up ;
- requêtes PostgreSQL évitées ;
- single-flight : attentes et abandons ;
- état de Valkey local ;
- latence des étapes de chargement du chatbot.

Les logs ne doivent jamais contenir de données métier ni de secrets.

## Alternatives écartées

### Précharger tous les chatbots actifs

Mémoire non bornée, warm-up long et charge PostgreSQL inutile pour des chatbots
rarement sollicités.

### Évincer selon la date de création

Un chatbot ancien mais très utilisé serait supprimé à tort. Le critère correct
est la dernière utilisation (LRU).

### Utiliser le Valkey central comme cache de données

Contrairement à ADR-0076 : coût WAN de ~79 ms depuis le nœud `141` et couplage
entre nœuds.

### Cacher les réponses IA

Personnalisées, coûteuses et sensibles. Hors périmètre d'ADR-0076.

### Ne faire que du réglage infra

`maxmemory` et `allkeys-lru` bornent la mémoire, mais n'implémentent ni le
préchargement initial ni la règle « pas d'éviction sous le seuil ». La logique
doit être portée par le code.

## Conséquences

### Positives

- chatbots fréquents maintenus chauds sur chaque nœud ;
- moins de lectures PostgreSQL sur les premiers messages ;
- mémoire bornée par `N` ;
- comportement simple et prévisible sous le seuil ;
- compatible avec l'invalidation multi-nœuds existante ;
- pas de changement du modèle de cohérence.

### Négatives

- warm-up à superviser et à tester ;
- duplication des données chaudes sur chaque nœud ;
- staleness possible si un événement d'invalidation est perdu, bornée par les
  TTL ;
- risque de favoriser les chatbots les plus actifs au détriment des autres ;
- nécessité d'une éviction atomique et d'un single-flight corrects.

## Vérifications attendues

- sous `N` : ajout sans éviction ;
- à `N` : éviction du moins récemment utilisé ;
- un accès met à jour le score sans changer la taille ;
- l'éviction purge les clés locales et le L1 ;
- l'invalidation centrale vide toujours les entrées ;
- deux nœuds ont des hot sets indépendants ;
- warm-up non bloquant et résilient aux erreurs ;
- single-flight respecté sous concurrence ;
- `RUNTIME_CACHE_HOT_LINKS=0` désactive complètement le dispositif ;
- conservation de l'isolation inter-organisations ;
- tests de charge avec Valkey local et PostgreSQL.

## Migration

Aucune migration de base de données.

Le déploiement nécessite :

1. le code du hot set et du warmer ;
2. les variables d'environnement ;
3. le réglage `maxmemory` / `allkeys-lru` des Valkey locaux ;
4. les métriques et alertes associées.

## Références code

- `src/infrastructure/cache/runtime-cache.ts` : L1, L2 local, invalidation.
- `src/infrastructure/db/runtime-cache-repositories.ts` : repositories cachés.
- `src/infrastructure/db/chatbot-config-repository.ts` : config versionnée.
- `src/infrastructure/db/connaissance-repository.ts` : connaissances.
- `src/infrastructure/db/media-repository.ts` : médias.
- `src/instrumentation.ts` : démarrage des workers applicatifs.
- `src/application/use-cases/chat/send-message.ts` : chemin runtime du chat.
