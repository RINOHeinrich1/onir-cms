# 0042. API publique v1 — contrat OpenAPI, scopes et architecture

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Décideurs** : équipe projet
- **Référence** : s'appuie sur ADR-0002 (architecture en couches), ADR-0005
  (RBAC), ADR-0025 (multitenancy), ADR-0035 (webhooks), ADR-0037
  (environnements) et ADR-0040/0041 (diffusion des chatbots).

## Contexte

L'API publique est aujourd'hui limitée à deux routes :

```text
GET /api/v1/fiches
GET /api/v1/fiches/:id
```

Elle possède déjà de bons fondamentaux :

- authentification server-to-server par clé API `Bearer` ;
- portée organisation, sans `organizationId` fourni par le client ;
- scope `fiches:read` ;
- pagination par curseur ;
- limiteur 60 requêtes/minute et 1 000 requêtes/heure ;
- enveloppe `data`, `pagination` et `error` ;
- `X-Request-Id` et `Cache-Control: no-store`.

Mais elle ne couvre pas les besoins d'intégration d'un CRM ou d'un outil
externe : prospects, conversations, chatbots, modèles, webhooks, statistiques.
Elle ne possède pas non plus de contrat OpenAPI, et la logique HTTP est
dupliquée entre les routes.

Le produit veut une API :

- **complète** pour les intégrations server-to-server ;
- **stable** et documentée par un contrat machine ;
- **isolée** par organisation ;
- **limitée par scopes** ;
- **cohérente** avec l'architecture hexagonale existante.

## Décision

### 1. Une API REST versionnée, séparée du backoffice

L'API publique reste sous :

```text
/api/v1
```

Elle est exclusivement server-to-server :

```http
Authorization: Bearer onir_live_...
```

- L'organisation est **toujours** déduite de la clé API.
- Aucun `organizationId` n'est accepté dans le path, le body ou le query.
- Les routes de session du backoffice (`/api/*` avec cookie) ne sont jamais
  exposées comme API publique.
- L'API publique ne donne pas accès à l'administration : organisations,
  utilisateurs, clés API, fournisseurs IA, secrets et configuration restent
  dans le backoffice.

La version de l'API est indépendante de la version applicative. Le préfixe
`/v1` est le contrat public ; les évolutions compatibles sont additives. Le gel
contractuel complet reste aligné sur la roadmap 0.3.

### 2. Scopes par ressource

`API_KEY_SCOPES` est étendu. Les scopes existants restent valides.

| Scope | Usage |
|---|---|
| `fiches:read` | lire les fiches |
| `fiches:write` | archiver / désarchiver une fiche |
| `prospects:read` | lire les prospects |
| `prospects:write` | créer / modifier un prospect |
| `conversations:read` | lire les conversations et messages |
| `conversations:write` | clôturer une conversation |
| `chatbots:read` | lire les chatbots et leurs URLs |
| `chatbots:write` | créer / modifier / supprimer un chatbot |
| `modeles:read` | lire les modèles de raisonnement |
| `webhooks:read` | lire les endpoints et livraisons |
| `webhooks:write` | créer / modifier / relancer |
| `statistiques:read` | lire les agrégats |

Règles :

- une clé possède **au moins un scope** ;
- les clés existantes conservent `fiches:read` ;
- la création d'une clé dans le backoffice permet de choisir les scopes ;
- l'absence de scope requis renvoie `403 insufficient_scope` ;
- les scopes ne sont jamais déduits du rôle de l'utilisateur qui a créé la clé.

Les scopes d'administration (`api_keys:*`, `organizations:*`, `users:*`,
`ai:*`) ne sont pas exposés à l'API publique.

### 3. Surface publique

Le vocabulaire public suit le produit :

- `/chatbots` correspond à l'entité interne `chat_links` ;
- `/modeles` correspond aux modèles de raisonnement (`chat_templates`) ;
- `/statistiques` regroupe les agrégats ;
- `/webhooks` reste le terme technique.

#### Socle

| Méthode | Route | Scope |
|---|---|---|
| `GET` | `/me` | aucun |
| `GET` | `/openapi.json` | public |

`GET /me` permet à un intégrateur de valider sa clé et de découvrir ses scopes,
son organisation et ses limites. Il ne renvoie jamais le hash ni le secret.

#### Lecture

| Méthode | Route | Scope |
|---|---|---|
| `GET` | `/fiches` | `fiches:read` |
| `GET` | `/fiches/:id` | `fiches:read` |
| `GET` | `/fiches/:id/export?format=markdown\|pdf` | `fiches:read` |
| `GET` | `/prospects` | `prospects:read` |
| `GET` | `/prospects/:id` | `prospects:read` |
| `GET` | `/prospects/:id/conversations` | `conversations:read` |
| `GET` | `/prospects/:id/fiches` | `fiches:read` |
| `GET` | `/conversations` | `conversations:read` |
| `GET` | `/conversations/:id` | `conversations:read` |
| `GET` | `/conversations/:id/messages` | `conversations:read` |
| `GET` | `/conversations/:id/fiches` | `fiches:read` |
| `GET` | `/chatbots` | `chatbots:read` |
| `GET` | `/chatbots/:id` | `chatbots:read` |
| `GET` | `/modeles` | `modeles:read` |
| `GET` | `/modeles/:key` | `modeles:read` |
| `GET` | `/modeles/:key/versions` | `modeles:read` |
| `GET` | `/modeles/:key/versions/:version` | `modeles:read` |
| `GET` | `/statistiques/summary` | `statistiques:read` |
| `GET` | `/statistiques/timeseries` | `statistiques:read` |

`GET /chatbots/:id` peut exposer `publicUrl`, `embedUrl` et le snippet. Le token
n'est pas un secret d'administration : il est déjà public par nature.

#### Écriture

| Méthode | Route | Scope |
|---|---|---|
| `POST` | `/prospects` | `prospects:write` |
| `PATCH` | `/prospects/:id` | `prospects:write` |
| `POST` | `/fiches/:id/archive` | `fiches:write` |
| `POST` | `/fiches/:id/unarchive` | `fiches:write` |
| `POST` | `/conversations/:id/close` | `conversations:write` |
| `POST` | `/chatbots` | `chatbots:write` |
| `PATCH` | `/chatbots/:id` | `chatbots:write` |
| `DELETE` | `/chatbots/:id` | `chatbots:write` |

Les actions idempotentes (`archive`, `unarchive`, `close`) ne exigent pas de
`Idempotency-Key`. Les créations (`POST /prospects`, `POST /chatbots`,
`POST /webhooks`) l'exigent.

#### Webhooks

| Méthode | Route | Scope |
|---|---|---|
| `GET` | `/webhooks` | `webhooks:read` |
| `GET` | `/webhooks/:id` | `webhooks:read` |
| `POST` | `/webhooks` | `webhooks:write` |
| `PATCH` | `/webhooks/:id` | `webhooks:write` |
| `DELETE` | `/webhooks/:id` | `webhooks:write` |
| `GET` | `/webhooks/:id/deliveries` | `webhooks:read` |
| `GET` | `/webhook-deliveries/:id` | `webhooks:read` |
| `POST` | `/webhook-deliveries/:id/retry` | `webhooks:write` |

Les secrets webhook sont write-only. Une lecture renvoie `authConfigured` et des
valeurs masquées, jamais un token, un mot de passe ou une clé en clair.

### 4. Hors périmètre de l'API publique v1

- gestion des organisations ;
- gestion des utilisateurs et invitations ;
- gestion des clés API ;
- fournisseurs IA et secrets applicatifs ;
- upload média ;
- moteur de chat public `/api/chat` ;
- création de modèles de raisonnement ;
- suppression de prospects ;
- gestion des templates visuels et de leurs assets ;
- API GraphQL.

Ces surfaces restent dans le backoffice ou dans leurs canaux publics dédiés.

### 5. Conventions de requête et de réponse

#### Enveloppe

Réponse unitaire :

```json
{
  "data": {}
}
```

Réponse de liste :

```json
{
  "data": [],
  "pagination": {
    "limit": 25,
    "hasMore": true,
    "nextCursor": "eyJ..."
  }
}
```

Erreur :

```json
{
  "error": {
    "code": "invalid_request",
    "message": "limit doit être compris entre 1 et 100",
    "details": [
      {
        "path": "limit",
        "code": "out_of_range",
        "message": "Valeur attendue entre 1 et 100"
      }
    ]
  },
  "requestId": "uuid"
}
```

#### Listes

Paramètres communs :

- `limit` : 1 à 100, défaut 25 ;
- `cursor` : curseur opaque ;
- `sort` : liste blanche (`createdAt:asc|desc`, `updatedAt:asc|desc`) ;
- `q` : recherche texte, 200 caractères maximum ;
- `createdFrom`, `createdTo`, `updatedFrom`, `updatedTo` : ISO 8601 ;
- filtres propres à la ressource (`prospectId`, `conversationId`,
  `chatbotId`, `templateKey`, etc.).

Règles :

- pagination **keyset**, jamais d'offset ;
- tri stable avec `id` comme discriminant ;
- pas de `total` par défaut ;
- `linkId` reste accepté comme alias déprécié ; `chatbotId` est le nom
  canonique ;
- les inclusions (`include=prospect,chatbot,fiches`) sont limitées à un niveau
  et documentées par route.

#### Écritures

`POST` de création :

```http
POST /api/v1/prospects
Authorization: Bearer onir_live_...
Idempotency-Key: 9f06c3e1-...
Content-Type: application/json
```

```json
{
  "nom": "Rakoto",
  "prenom": "Jean",
  "nature": "physique",
  "email": "jean.rakoto@example.com",
  "activite": "Agence digitale",
  "fonction": "Directeur",
  "detail": "Rencontré au salon"
}
```

`PATCH` :

- JSON partiel ;
- objets imbriqués remplacés en bloc, jamais de merge profond implicite ;
- `ETag` renvoyé par les lectures ;
- `If-Match` accepté sur les mutations sensibles ;
- `412 precondition_failed` en cas de version obsolète.

`DELETE` réussi : `204 No Content`.

Créations réussies : `201 Created` + `Location`.

Actions asynchrones (`retry`) : `202 Accepted`.

#### Idempotence

Table dédiée :

```text
api_idempotency_keys (
  organization_id,
  api_key_id,
  method,
  path,
  idempotency_key,
  request_hash,
  response_status,
  response_body,
  created_at,
  expires_at
)
```

- même clé + même corps ⇒ même réponse, sans doublon ;
- même clé + corps différent ⇒ `409 idempotency_conflict` ;
- expiration : 24 heures ;
- l'idempotence ne s'applique pas aux `GET`, `PATCH`, `PUT` et `DELETE`.

#### Erreurs

Codes publics stables :

- `invalid_api_key` ;
- `insufficient_scope` ;
- `invalid_request` ;
- `not_found` ;
- `conflict` ;
- `idempotency_conflict` ;
- `precondition_failed` ;
- `rate_limited` ;
- `internal_error`.

Une ressource d'une autre organisation renvoie **404**, jamais 403. Le 403 est
réservé au scope manquant.

### 6. Architecture

```text
src/
  contracts/
    api-v1/
      common.ts
      fiches.ts
      prospects.ts
      conversations.ts
      chatbots.ts
      modeles.ts
      webhooks.ts
      statistiques.ts
      openapi.ts

  application/
    public-api/
      principal.ts
      use-cases/
        fiches/
        prospects/
        conversations/
        chatbots/
        modeles/
        webhooks/
        statistiques/
      dto/

  app/api/v1/
    _lib/
      handler.ts
      errors.ts
      pagination.ts
      idempotency.ts
      dto.ts
    me/route.ts
    openapi.json/route.ts
    fiches/...
    prospects/...
    conversations/...
    chatbots/...
    modeles/...
    webhooks/...
    statistiques/...
```

Règles de dépendance :

1. `app/api/v1` est un adaptateur HTTP.
2. Une route ne contient ni SQL ni accès repository.
3. Un use case public reçoit un `PublicApiPrincipal` :

```ts
type PublicApiPrincipal = {
  organizationId: string;
  apiKeyId: string;
  scopes: ApiKeyScope[];
};
```

4. Les use cases backoffice restent basés sur `Actor`. Les règles métier
   communes sont extraites dans des fonctions `ForOrganization` :

```ts
listProspectsForOrganization(deps, organizationId, filter)
getConversationForOrganization(deps, organizationId, id)
createChatbotForOrganization(deps, organizationId, input, apiKeyId)
```

5. Un use case public vérifie son scope et ne reçoit jamais un rôle utilisateur.
6. Les DTO publics sont explicites et stables. Aucune entité interne n'est
   renvoyée directement.
7. Le wrapper `withApiKey()` centralise authentification, scope, rate limit,
   `X-Request-Id`, erreurs et headers.

Cette séparation évite de réutiliser un faux `Actor` pour une clé API et évite
de dupliquer l'autorisation dans chaque route.

### 7. OpenAPI 3.1

Le contrat est **contract-first** :

- document OpenAPI 3.1 ;
- servi sur `GET /api/v1/openapi.json` ;
- page `/documentation/api` alimentée par le même document ;
- schémas de requête/réponse générés depuis les validateurs (Zod + générateur
  OpenAPI), jamais maintenus en double ;
- `x-required-scopes` sur chaque opération ;
- `x-tenant-scoped: true` sur les opérations métier ;
- `x-idempotent: true` sur les créations ;
- `operationId` stables ;
- exemples pour chaque ressource ;
- validation du contrat en CI (`@redocly/cli` ou équivalent) ;
- test vérifiant que chaque route publique est présente dans l'OpenAPI et
  possède un scope.

Le document OpenAPI ne contient aucun secret, seulement le contrat.

### 8. Sécurité, audit et limites

- Ne jamais accepter `organizationId` du client.
- Ne jamais exposer `key_hash`, secrets webhook, clés IA, credentials SQL.
- Les écritures sont auditées dans `api_key_audit` : route, ressource,
  `requestId`, statut, `api_key_id`, organisation.
- Les lectures ne sont pas auditées individuellement pour éviter le bruit ;
  les échecs d'authentification le sont déjà.
- Les logs applicatifs ne contiennent ni PII ni secret.
- Rate limit actuel conservé : 60/min et 1 000/h par clé.
- Headers : `X-RateLimit-Limit`, `X-RateLimit-Remaining`,
  `X-RateLimit-Reset`, `Retry-After`.
- Le limiteur mémoire doit être remplacé par PostgreSQL ou Redis dès que
  l'application est répliquée.
- `Cache-Control: no-store` sur toutes les réponses authentifiées.
- `X-Request-Id` sur toutes les réponses, y compris les erreurs.

### 9. Compatibilité et migration

- Les routes `/api/v1/fiches` existantes restent compatibles.
- Les champs existants ne sont pas supprimés ; les nouveautés sont additives.
- `archivee` reste le champ existant pour les fiches.
- `linkId` reste accepté comme alias déprécié ; `chatbotId` devient le nom
  canonique des nouveaux DTO.
- Les clés existantes conservent `fiches:read`.
- La création de clé API accepte désormais une liste de scopes.
- Une migration ajoute `api_idempotency_keys`.
- Aucune donnée métier n'est migrée.
- Aucune route existante n'est supprimée dans cette décision.

### 10. Tests attendus

- validation des schémas de requête et de réponse ;
- couverture OpenAPI ↔ routes ;
- scopes manquants → 403 ;
- cross-tenant → 404 ;
- clé expirée/révoquée → 401 ;
- idempotence : replay, conflit, expiration ;
- rate limit : 429 + `Retry-After` ;
- absence de secrets dans toutes les réponses ;
- pagination et tri stables ;
- export fiche limité à l'organisation ;
- tests d'intégration sur les écritures et l'audit.

## Conséquences

### Positives

- Une API d'intégration complète et documentée.
- Un contrat OpenAPI unique pour les clients, la doc et les tests.
- Des accès limités par scopes, sans élargir les privilèges du backoffice.
- Une architecture cohérente : adaptateur HTTP mince, cas d'usage applicatifs.
- Une base saine pour l'idempotence, l'audit et l'observabilité.

### Négatives

- Plus de use cases à exposer ou à extraire (`ForOrganization`).
- Plus de surface à tester et à maintenir.
- L'idempotence ajoute une table et un cycle de vie.
- Le rate limiter mémoire reste une limite tant que l'instance n'est pas
  répliquée.
- Le vocabulaire public `chatbots` / `modeles` doit être maintenu comme
  traduction stable des entités internes `chat_links` / `chat_templates`.

## Alternatives écartées

1. **GraphQL** : plus flexible, mais ajoute un runtime, une complexité
   d'autorisation par champ et un contrat moins simple à versionner pour des
   intégrations CRM.
2. **Réutiliser les routes de session du backoffice** : couple l'API aux
   cookies, aux rôles utilisateurs et à l'UI ; ne permet pas une clé
   server-to-server propre.
3. **API en lecture seule** : insuffisante pour les intégrations qui doivent
   créer des prospects, archiver des fiches ou provisionner un chatbot.
4. **OpenAPI écrit à la main à côté des validateurs** : double maintenance et
   risque de dérive immédiat.
5. **Pagination offset** : instable sur les données qui évoluent et coûteuse
   sur les grandes tables.
6. **Exposer toutes les ressources d'administration** : surface d'attaque et
   responsabilité trop larges pour une clé d'intégration.
7. **Créer une API v2 immédiatement** : inutile ; les routes existantes peuvent
   être complétées de façon additive.

## Références

- ADR-0002 : architecture en couches.
- ADR-0005 : RBAC.
- ADR-0025 : multitenancy par organisation.
- ADR-0035 : webhooks sortants.
- ADR-0037 : environnements preprod/release.
- ADR-0040 : surface widget.
- ADR-0041 : canaux de diffusion multiples.
- `docs/adr/README.md` : index des décisions.
