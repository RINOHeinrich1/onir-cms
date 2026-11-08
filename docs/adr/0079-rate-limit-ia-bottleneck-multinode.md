# 0079. Rate limiting IA avec Bottleneck en mono et multi-instance

- **Statut** : Proposé
- **Date** : 2026-11-08
- **Décideurs** : équipe projet
- **Référence** : ADR-0048, ADR-0065, ADR-0074, ADR-0076, ADR-0078.
- **Complète** : ADR-0074, ADR-0076.
- **Remplace** : aucune.

## Contexte

Certains fournisseurs IA, notamment Infomaniak, imposent une limite de débit
globale, par exemple **60 RPM** pour un produit donné.

Cette limite n’est pas par utilisateur ni par conversation :

- elle s’applique à tout le compte/produit ;
- elle est partagée par tous les appels de l’application ;
- elle est partagée par tous les nœuds Next.js ;
- elle inclut les appels de chat, de builder, d’extraction de connaissances et
  de génération de template.

L’application est aujourd’hui multi-instance :

- `141` : ancien nœud Next.js ;
- `167` : nouveau nœud Next.js ;
- HAProxy répartit le trafic.

Les limiteurs actuels (`src/lib/rate-limit.ts`) sont **en mémoire par processus**
et ne permettent donc pas de garantir un quota global. Ils protègent contre
l’abus par utilisateur ou par conversation, mais pas contre le dépassement du
quota fournisseur.

L’ajout d’un gateway IA externe est une cible possible, mais elle est reportée.
La priorité immédiate est une solution rapide intégrée à l’application.

## Décision

### 1. Utiliser Bottleneck dans l’application, pour le moment

Bottleneck est ajouté comme composant d’infrastructure IA.

Il gère :

- le débit maximal (`RPM`) ;
- la concurrence maximale ;
- la file d’attente ;
- la répartition globale entre instances via Valkey.

Il ne devient pas une dépendance des use cases métier.

### 2. Architecture anti-couplage

Un port applicatif est introduit :

```text
AiRateLimiter
```

Adaptateurs :

```text
LocalBottleneckAdapter      → mono-instance
ValkeyBottleneckAdapter     → multi-instance
ResilientAiRateLimiter      → choix et dégradation
```

Règles :

- aucun import de Bottleneck dans `src/application` ni `src/domain` ;
- aucun import direct d’`ioredis` hors infrastructure ;
- les use cases continuent d’appeler `AiClient` ;
- l’enveloppement est fait dans la factory d’infrastructure IA.

### 3. Modes d’exécution

Configuration principale :

```env
REPLICA_COUNT=2
AI_RATE_LIMIT_MODE=auto
AI_RATE_LIMIT_RPM=55
AI_RATE_LIMIT_MAX_CONCURRENT=4
AI_RATE_LIMIT_QUEUE_LIMIT=100
AI_RATE_LIMIT_MAX_WAIT_MS=15000
AI_RATE_LIMIT_DEGRADED=local_share
```

Modes :

| `AI_RATE_LIMIT_MODE` | Comportement |
|---|---|
| `local` | Bottleneck local uniquement, sans Valkey |
| `distributed` | Bottleneck + Valkey obligatoire |
| `auto` | `local` si `REPLICA_COUNT=1`, sinon `distributed` |

Le mode `auto` est le défaut.

### 4. Mono-instance

Configuration :

```env
REPLICA_COUNT=1
AI_RATE_LIMIT_MODE=local
```

Comportement :

- Bottleneck utilise son datastore local ;
- aucune dépendance à Valkey pour le rate limiting ;
- le quota est exact pour cette instance ;
- Valkey peut être indisponible sans impacter le limiteur IA.

### 5. Multi-instance

Configuration :

```env
REPLICA_COUNT=2
AI_RATE_LIMIT_MODE=distributed
```

Bottleneck utilise Valkey avec :

- un `id` identique sur tous les nœuds ;
- `clearDatastore: false` ;
- un namespace ou une base Valkey dédiée ;
- `minTime` et `maxConcurrent` partagés.

Le quota est global entre les nœuds.

### 6. Si Valkey est indisponible en multi-instance

Le comportement est paramétrable :

```env
AI_RATE_LIMIT_DEGRADED=fail_closed
# ou
AI_RATE_LIMIT_DEGRADED=local_share
# ou
AI_RATE_LIMIT_DEGRADED=fail_open
```

#### `fail_closed`

- aucune requête IA n’est envoyée ;
- réponse `503` ou `429` avec `Retry-After` ;
- le reste de l’application continue ;
- le quota fournisseur est strictement protégé.

#### `local_share` — défaut recommandé en multi

Chaque nœud applique :

```text
RPM local = floor(AI_RATE_LIMIT_RPM / REPLICA_COUNT)
```

Exemple :

```text
55 RPM / 2 nœuds = 27 RPM par nœud
```

Conséquences :

- deux nœuds actifs → 54 RPM maximum ;
- un seul nœud actif → 27 RPM seulement ;
- dégradation assumée, mais pas de dépassement si `REPLICA_COUNT` est correct.

#### `fail_open`

Chaque nœud applique le RPM complet.

- deux nœuds → jusqu’à 110 RPM ;
- risque élevé de 429 fournisseur ;
- réservé à un usage exceptionnel ;
- doit être explicitement activé et alerté.

### 7. Retour de Valkey

La façade `ResilientAiRateLimiter` doit :

1. détecter l’indisponibilité Valkey ;
2. basculer vers le mode dégradé ;
3. éviter le flapping avec un délai de stabilisation ;
4. revenir au mode distribué quand Valkey est de nouveau disponible ;
5. laisser les requêtes locales en cours se terminer.

Une alerte doit être émise tant que le mode dégradé est actif.

### 8. File d’attente et surcharge

Bottleneck ne doit pas créer une file illimitée.

Règles :

- `AI_RATE_LIMIT_QUEUE_LIMIT` borne la file ;
- `AI_RATE_LIMIT_MAX_WAIT_MS` borne l’attente ;
- si la file est pleine : refus explicite, pas d’attente infinie ;
- response `429` ou `503` avec `Retry-After` ;
- `fail_open` ne doit pas supprimer ces bornes.

### 9. Retry réseau et fournisseur

Bottleneck limite le débit, mais ne gère pas nativement les `429` amont.

Un wrapper doit gérer :

- `429`, `5xx`, timeouts réseau ;
- respect de `Retry-After` ;
- backoff exponentiel + jitter ;
- maximum 2 tentatives ;
- pas de retry après le premier chunk d’un stream ;
- pas de fallback vers un autre fournisseur dans cette phase.

### 10. Pas de fallback fournisseur pour l’instant

Le fallback vers un autre fournisseur est explicitement hors périmètre.

Raisons :

- le besoin immédiat est le respect du quota ;
- le fallback actuel de l’application peut amplifier les appels ;
- un gateway externe sera étudié plus tard.

La chaîne de fallback applicative existante ne doit pas contourner le limiteur.

### 11. Valkey

Le limiteur utilise Valkey via le protocole Redis et `ioredis`.

Règles :

- mot de passe Valkey obligatoire ;
- namespace ou base dédié au rate limiting ;
- ne pas utiliser une base de cache en `allkeys-lru` ;
- `clearDatastore: false` ;
- pas de flush global de la base ;
- les clés Bottleneck ne doivent pas être évincées par le cache.

### 12. Configuration et rechargement

Phase 1 :

- configuration par variables d’environnement ;
- valeurs identiques sur tous les nœuds ;
- redémarrage des conteneurs après modification.

Phase ultérieure possible :

- configuration en base ;
- notification Valkey ;
- `limiter.updateSettings()` sur chaque nœud.

La phase 1 ne doit pas dépendre d’un rechargement à chaud.

## Plan de mise en œuvre

### Phase 0 — Cadrage

- valider `AI_RATE_LIMIT_RPM=55` avec la marge sous 60 ;
- valider `REPLICA_COUNT` réel ;
- choisir la politique par défaut : `local_share` ;
- préparer une base ou un namespace Valkey dédié.

### Phase 1 — Port et adaptateurs

- créer le port `AiRateLimiter` ;
- créer l’adaptateur Bottleneck local ;
- créer l’adaptateur Bottleneck + Valkey ;
- créer la façade résiliente ;
- ajouter la configuration.

### Phase 2 — Intégration

- envelopper `AiClient` dans la factory ;
- appliquer le limiteur à `complete` et `completeWithTools` ;
- vérifier que chat, builder, extraction et templates passent par le même limiteur ;
- ne modifier aucun use case métier.

### Phase 3 — Tests

- mono-instance sans Valkey ;
- mono-instance avec Valkey indisponible ;
- multi-instance avec deux nœuds ;
- multi-instance avec Valkey indisponible en `local_share` ;
- multi-instance avec `fail_closed` ;
- multi-instance avec `fail_open` explicitement activé ;
- retour de Valkey ;
- file pleine ;
- redémarrage d’un nœud ;
- vérification du total RPM sur deux nœuds.

### Phase 4 — Observabilité

Métriques :

- mode actif (`local`, `distributed`, `degraded`) ;
- Valkey up/down ;
- RPM effectif ;
- profondeur de file ;
- temps d’attente ;
- 429 locaux et amont ;
- taux de retry ;
- nombre de nœuds attendus.

### Phase 5 — Déploiement

- rapid-preprod ;
- deux nœuds ;
- test de charge contrôlé ;
- vérification des logs et du quota ;
- production.

## Conséquences

### Positives

- quota global réellement partagé en multi-instance ;
- pas de couplage des use cases à Bottleneck ou Valkey ;
- fonctionnement mono-instance sans Valkey ;
- dégradation paramétrable et explicite ;
- file bornée ;
- marge de sécurité sous Infomaniak ;
- possibilité de retirer Bottleneck plus tard au profit d’un gateway.

### Négatives

- complexité d’infrastructure supplémentaire ;
- dépendance à `REPLICA_COUNT` pour le mode `local_share` ;
- sous-utilisation du quota si un nœud tombe ;
- file non durable ;
- pas de partage avec d’autres applications ;
- `fail_open` dangereux s’il est activé sans surveillance ;
- configuration par env nécessitant un redémarrage.

## Alternatives écartées

- **Gateway immédiat** : meilleure cible à terme, mais hors priorité immédiate.
- **Fallback vers un autre fournisseur** : hors périmètre.
- **Limiteur en mémoire uniquement en multi** : quota global non respecté.
- **`fail_open` par défaut** : risque de 429 et de saturation fournisseur.
- **File illimitée** : saturation mémoire et attentes incontrôlées.
- **Importer Bottleneck dans les use cases** : couplage métier.
- **Utiliser la base cache Valkey en `allkeys-lru`** : risque d’éviction des
  clés de quota.

## Points ouverts

- faut-il un RPM distinct par fournisseur plutôt qu’un plafond système unique ?
- faut-il une configuration en base à moyen terme ?
- faut-il des priorités par organisation en plus des priorités par opération ?
- faut-il sortir `fail_open` du code ou le laisser comme mode d’urgence ?
- quel seuil d’alerte pour le mode dégradé ?
- quand basculer vers le gateway externe ?

## Critères d’acceptation

- mono-instance fonctionne sans Valkey ;
- multi-instance applique le RPM global ;
- `local_share` respecte `floor(RPM / REPLICA_COUNT)` par nœud ;
- `fail_closed` refuse proprement sans envoyer d’appel IA ;
- `fail_open` est explicitement paramétré et signalé ;
- le retour de Valkey restaure le mode distribué ;
- la file est bornée ;
- aucun use case métier n’importe Bottleneck ou ioredis ;
- les appels IA de chat, builder et extraction partagent le même quota ;
- les logs et métriques permettent de voir le mode actif et le débit effectif.
