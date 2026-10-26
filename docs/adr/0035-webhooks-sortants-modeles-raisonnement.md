# 0035. Webhooks sortants configurables par modèle de raisonnement

- **Statut** : Accepté
- **Date** : 2026-10-26
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0002 (architecture en couches), ADR-0005
  (RBAC), ADR-0011 (modèles de raisonnement), ADR-0017 (fiches et
  archivage), ADR-0025 (multitenancy) et ADR-0034 (champs fichier et pièces
  jointes).

## Contexte

Les fiches de prospection doivent pouvoir être envoyées vers des services
externes : stockage partenaire, CRM, outil métier, etc. Le besoin n'est pas un
webhook automatique unique, mais un **connecteur HTTP sortant configurable**,
déclenché manuellement depuis une fiche.

Les champs exploitables ne sont pas une liste fixe de colonnes : ils sont
déclarés par le **modèle de raisonnement** (`chat_templates`) et figés dans la
version snapshot de chaque fiche. Un webhook doit donc être rattaché à un
modèle, et non à une table générique ou à une liste de colonnes codée en dur.

Contraintes structurantes :

- V1 limitée à la table **`fiches`** (les leads), mais **tous les modèles de
  raisonnement** sont supportés.
- Déclenchement **manuel** depuis une fiche en V1 ; les déclencheurs
  automatiques et les autres tables viendront plus tard.
- Les webhooks peuvent contenir des **données personnelles** et des secrets
  d'authentification.
- Les URLs sont fournies par un administrateur : le risque **SSRF** doit être
  traité comme un risque de premier ordre.
- L'application n'a pas de file de messages aujourd'hui. Il faut une solution
  persistante, sans ajouter un service d'exploitation lourd.
- L'architecture en couches et l'isolation multitenant existantes doivent être
  respectées.

## Décision

### 1. Périmètre V1

Un **webhook sortant** est composé de deux objets :

- un **endpoint** : configuration réutilisable, rattachée à une organisation
  et à un modèle de raisonnement ;
- une **livraison** : exécution d'un endpoint sur une fiche donnée, avec un
  snapshot de la requête et un journal de résultat.

Décisions de périmètre :

- source V1 : table `fiches` uniquement (leads) ;
- rattachement à **`chat_templates.key`**, donc à toutes les versions du
  modèle, pas à une version précise ;
- plusieurs endpoints par modèle ;
- déclenchement manuel uniquement ;
- pas de webhook entrant, pas d'envoi en masse, pas de chaînage de webhooks ;
- les autres tables et les déclencheurs automatiques sont hors V1.

Le webhook est résolu à partir de la fiche :

1. la fiche appartient à l'organisation active ;
2. `fiche.templateKey` correspond au modèle de l'endpoint ;
3. la fiche est lue avec sa version snapshot ;
4. les champs du mapping sont résolus sur cette version.

Une fiche ou un modèle d'une autre organisation est traité comme inexistant.

Le modèle est référencé par sa clé immuable (`chat_templates.key`, comparaison
insensible à la casse). La suppression d'un modèle est refusée tant qu'un
endpoint **non supprimé** le référence. La suppression d'un endpoint est
**logique** (`deleted_at`) afin de conserver l'historique des livraisons.

### 2. Configuration d'un endpoint

L'endpoint porte au minimum :

```text
webhook_endpoints
  id, organization_id, template_key, name, description,
  enabled, http_method, url,
  query_params, headers, body_mode, body_template,
  field_mappings, auth_type, auth_config_enc,
  timeout_ms, max_attempts, retry_backoff_ms,
  follow_redirects, tls_verify, allow_insecure_http, allow_private_network,
  created_by, created_at, updated_at, deleted_at
```

Règles :

- **Méthodes** : `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`.
  `GET`/`HEAD` n'envoient pas de corps ; les autres le permettent.
- **URL** : `http` ou `https`, sans identifiants dans l'URL. HTTPS est le
  défaut ; HTTP doit être explicitement autorisé et audité. Le chemin peut
  contenir des placeholders encodés.
- **Query** : paires clé/valeur, avec placeholders et valeurs fixes.
- **Headers** : noms et valeurs configurables, avec placeholders ; les valeurs
  marquées secrètes sont chiffrées. Les headers interdits par le client HTTP
  (`Host`, `Content-Length`, etc.) sont refusés ou recalculés.
- **Body** : `json`, `form_urlencoded`, `multipart` ou `raw` (texte/XML).
  Le `Content-Type` associé est explicite et peut être surchargé.
- **Mapping** : liste de champs source, clé cible (simple ou chemin imbriqué),
  caractère obligatoire, valeur par défaut et mode d'encodage. Les placeholders
  `{{...}}` et un template JSON/texte sont supportés ; les tableaux sont
  sérialisés en JSON.
- **Timeout** : 1 à 30 secondes, défaut 10 secondes.
- **Retries** : 1 à 5 tentatives, défaut 3, avec backoff exponentiel et jitter.
- **Redirections** : non suivies par défaut ; si activées, 3 maximum, avec
  revalidation SSRF à chaque saut.
- **TLS** : vérification activée par défaut ; la désactivation est une option
  administrateur explicitement auditée.
- **Réseau privé** : interdit par défaut ; exception administrateur explicite,
  auditée, pour un partenaire auto-hébergé.

Un endpoint désactivé ou supprimé logiquement n'est plus proposé au
déclenchement. Une livraison déjà créée n'est pas annulée par cette
désactivation.

### 3. Champs sélectionnables

Le mapping propose :

- les **champs du modèle** de la version snapshot de la fiche
  (`text`, `textarea`, `select`, `multi`, `url`, `email`, `file`) ;
- les **métadonnées de la fiche** : `id`, `createdAt`, `templateKey`,
  `templateVersion`, ids de conversation/prospect, etc. ;
- les informations du **prospect** associé ;
- les **pièces jointes** des champs fichier.

À la création de l'endpoint, l'interface propose les champs de la **version
courante** du modèle. Le mapping est ensuite stocké **par nom** et résolu, à
l'envoi, contre la version snapshot de la fiche.

Chaque champ mappé peut être :

- **obligatoire** : son absence ou une valeur vide bloque la livraison avec
  une erreur explicite ;
- **optionnel** : il est omis du payload (ou envoyé à `null` selon le mode
  choisi).

Un champ fichier est sérialisé :

- en **multipart** : partie binaire avec nom de fichier, type MIME et contenu ;
- en **JSON** : URL signée courte durée, ou base64, selon le mode choisi ;
- jamais par une URL publique devinable.

La résolution se fait contre la version **snapshot de la fiche**, pas contre la
version courante du modèle. Un champ supprimé ou renommé dans une nouvelle
version n'est pas inventé : la livraison échoue si le champ est obligatoire,
ou l'omet s'il est optionnel. L'aperçu et le test permettent de détecter le
problème avant l'envoi.

### 4. Authentification et secrets

Types supportés en V1 :

- aucune ;
- `Bearer` ;
- `Basic` ;
- API key dans un header ;
- API key dans la query ;
- signature HMAC-SHA256 ;
- OAuth2 `client_credentials`.

Règles :

- les secrets sont chiffrés avec une clé dédiée `WEBHOOK_SECRET_KEY`
  (AES-256-GCM, 32 octets, 64 hexadécimaux), distincte de `SESSION_SECRET`, et
  ne sont jamais renvoyés au client ;
- l'interface affiche uniquement le type et un état « configuré » ;
- les logs, aperçus et snapshots masquent `Authorization`, `Cookie`,
  `Set-Cookie`, `X-Api-Key` et les paramètres sensibles de query ;
- le token OAuth2 est mis en cache en mémoire jusqu'à expiration, jamais
  persisté ;
- la signature HMAC couvre au minimum la méthode, l'URL, le corps, l'horodatage
  et l'identifiant de livraison ;
- mTLS, CA personnalisé, AWS SigV4 et autres schémas propriétaires sont hors
  V1 ; le port `WebhookSigner` permet de les ajouter sans modifier le moteur.

### 5. Exécution asynchrone et journal

Le déclenchement manuel ne bloque pas la requête HTTP du backoffice :

1. l'application valide la fiche, le modèle et l'endpoint ;
2. elle crée une livraison `queued` avec un snapshot de la requête résolue ;
3. elle renvoie `202` avec l'identifiant de livraison ;
4. un worker traite la file et met à jour le statut.

La file est **persistée en PostgreSQL** dans `webhook_deliveries`. Le worker
utilise `FOR UPDATE SKIP LOCKED`, ce qui reste correct si l'application est
lancée en plusieurs instances. Il est démarré de façon idempotente par
`instrumentation.ts` et peut être désactivé en test.

Statuts : `queued`, `running`, `succeeded`, `failed`.

Règles de livraison :

- succès si la réponse est `2xx` ;
- retry sur erreur réseau, timeout, `408`, `425`, `429` et `5xx` ;
- pas de retry sur les autres `4xx` ;
- une redirection non suivie est un échec ;
- respect de `Retry-After` lorsqu'il est présent ;
- `Idempotency-Key` optionnel, par défaut l'identifiant de livraison ;
- réponse tronquée à 64 Kio dans le journal ;
- durée, code HTTP, erreur normalisée et nombre de tentatives conservés ;
- relance manuelle possible depuis l'historique, avec une nouvelle livraison ;
- la réponse n'est ni interprétée ni réinjectée dans la fiche en V1.

Le snapshot de requête contient les valeurs envoyées, y compris des données
personnelles. Il est conservé 30 jours par défaut, puis purgé par une tâche
dédiée. Les secrets n'y figurent jamais.

### 6. Modèle de données

```text
webhook_deliveries
  id, organization_id, endpoint_id, fiche_id,
  template_key, template_version,
  is_test, replay_of_id,
  status, attempts, next_attempt_at,
  idempotency_key, request_snapshot,
  response_status, response_body,
  error_code, error_message,
  triggered_by, started_at, finished_at, created_at

webhook_delivery_attempts
  id, delivery_id, attempt, status,
  http_status, error_code, error_message,
  duration_ms, started_at, finished_at, created_at
```

Règles :

- `fiche_id` est nul pour un test sur données d'exemple ;
- `request_snapshot` contient l'URL, la méthode, les headers masqués et le
  corps résolu, pour l'audit et la relance ;
- `webhook_delivery_attempts` est append-only : chaque retry laisse une trace ;
- index : `(organization_id, created_at DESC)`,
  `(endpoint_id, created_at DESC)`, `(fiche_id, created_at DESC)` et
  `(status, next_attempt_at)` ;
- purge des livraisons et tentatives après la durée de rétention ;
- une suppression d'endpoint ne supprime aucune livraison.

### 7. Sécurité

Toute requête sortante passe par un garde SSRF :

- seuls `http` et `https` sont autorisés ;
- résolution DNS puis refus des adresses loopback, privées, link-local,
  multicast, non spécifiées, IPv4-mapped IPv6 et des endpoints de métadonnées
  cloud ;
- l'adresse IP validée est **celle réellement utilisée** pour la connexion
  (pas de re-résolution entre la validation et la connexion) ;
- refus des redirections vers une cible interdite ;
- interdiction des identifiants dans l'URL ;
- plafonnement de la taille des headers, de l'URL et du corps ;
- défense contre l'injection de headers ;
- timeout et taille de réponse bornés.

Le garde est contournable uniquement par l'option administrateur
`allow_private_network`, tracée dans l'audit.

L'isolation multitenant est appliquée à chaque étape : endpoint, fiche,
modèle, livraison et pièces jointes appartiennent à la même organisation.
Aucun `organization_id` n'est accepté depuis le client.

### 8. RBAC

Nouvelles actions :

- `webhooks:list`, `webhooks:read`, `webhooks:trigger` ;
- `webhooks:create`, `webhooks:update`, `webhooks:delete`, `webhooks:test`.

Matrice :

- **admin** : toutes les actions ;
- **marketeur** : `list`, `read`, `trigger` uniquement ;
- **lecteur** : aucune action webhook, y compris la consultation.

`webhooks:read` renvoie uniquement des métadonnées sûres (nom, description,
modèle, état) et l'historique des livraisons de la fiche, jamais l'URL, les
headers ni l'authentification complète. La création, la modification, la
suppression et le test sont réservés aux administrateurs. Un marketeur peut
déclencher un endpoint actif sur une fiche à laquelle il a accès, mais ne voit
ni les secrets ni la configuration.

### 9. Interface

- **Modèles de raisonnement** : action « Webhooks » sur la ligne du modèle
  (visible admin), qui ouvre la liste des endpoints du modèle et permet d'en
  créer un.
- **Paramètres > Webhooks** : liste globale de l'organisation pour les admins,
  avec filtres par modèle et état.
- **Fiche lead** : action « Envoyer via webhook » pour admin et marketeur,
  listant les endpoints actifs du modèle de la fiche. L'utilisateur voit un
  aperçu du payload (secrets masqués), confirme, puis suit le statut.
- **Historique** : livraisons par fiche et vue globale, avec statut, durée,
  code HTTP, erreur et relance.
- **Test** : envoi d'un payload d'exemple ou d'une fiche réelle depuis l'écran
  admin, sans créer de livraison métier visible côté fiche.

Routes API internes :

- `GET|POST /api/webhooks` : liste et création (admin) ;
- `GET|PATCH|DELETE /api/webhooks/[id]` : détail, mise à jour, suppression
  logique (admin) ;
- `POST /api/webhooks/[id]/test` : test admin, livraison `is_test` ;
- `POST /api/fiches/[id]/webhooks/[endpointId]/preview` : aperçu sans effet ;
- `POST /api/fiches/[id]/webhooks/[endpointId]/trigger` : crée une livraison
  et renvoie `202` ;
- `GET /api/webhooks/deliveries` : historique filtré ;
- `POST /api/webhooks/deliveries/[id]/retry` : relance manuelle.

Le déclenchement est toujours un `POST`, jamais un `GET`. Les routes de
configuration et de test sont réservées aux administrateurs. Aucun secret
n'est jamais réaffiché après l'enregistrement.

### 10. Architecture

- **Domaine** : entités `WebhookEndpoint`, `WebhookDelivery`, value objects
  (`HttpMethod`, `BodyMode`, `AuthType`, `FieldMapping`, `DeliveryStatus`).
  Aucun import HTTP, SQL, Next.js ou crypto.
- **Application** : ports `WebhookEndpointRepository`,
  `WebhookDeliveryRepository`, `WebhookSender`, `WebhookSigner`,
  `WebhookTemplateResolver` ; cas d'usage create/update/list/delete/test et
  trigger/process/retry.
- **Infrastructure** : repositories PostgreSQL, client HTTP, garde SSRF,
  chiffrement des secrets, worker de file.
- **Adapters entrants** : routes API et composants UI.
- **Composition** : câblage dans le container existant, sans singleton métier.

Le domaine ne dépend pas de `chat_templates` : il manipule des clés, des noms
de champs et des valeurs. La résolution du modèle et du snapshot passe par les
ports existants.

## Conséquences

### Positives

- Un seul moteur couvre stockage partenaire, CRM et autres APIs HTTP.
- Le webhook suit le modèle de raisonnement et ses champs, sans colonnes
  codées en dur.
- La séparation endpoint/livraison rend les envois auditables et relançables.
- L'exécution asynchrone évite de bloquer l'interface et permet les retries.
- L'architecture est prête pour d'autres tables et déclencheurs automatiques.
- Les secrets et les données sont isolés par organisation.

### Négatives / risques

- La configuration HTTP est puissante : SSRF, fuite de secrets et envoi de
  données personnelles doivent rester sous contrôle admin.
- Les snapshots de livraison contiennent des données personnelles : politique
  de rétention et purge nécessaires.
- Un changement de modèle peut invalider un mapping ; les champs obligatoires
  provoquent un échec explicite.
- Les pièces jointes en base64 ou multipart augmentent la taille des requêtes.
- Le worker in-process doit être surveillé ; une extraction en service dédié
  reste possible si la charge augmente.
- La rotation de `WEBHOOK_SECRET_KEY` impose de ressaisir les secrets ; elle
  doit être documentée et planifiée.
- Les partenaires peuvent être indisponibles ou dupliquer des réceptions ;
  l'idempotence côté partenaire n'est pas garantie par l'application.

## Alternatives écartées

- **Webhooks codés en dur par intégration** : nécessite un développement par
  partenaire, contraire à l'objectif de configuration.
- **Webhook rattaché à une table/colonnes fixes** : incompatible avec les
  champs dynamiques des modèles de raisonnement.
- **Webhook rattaché à une version précise du modèle** : oblige à recréer un
  webhook à chaque version ; la résolution par snapshot couvre le besoin.
- **Envoi synchrone uniquement** : bloque l'interface, ne survit pas aux
  redémarrages et rend les retries fragiles.
- **File mémoire ou broker externe** : perte au redémarrage ou complexité
  d'exploitation disproportionnée pour la V1.
- **Exécution de scripts/JavaScript dans la configuration** : surface
  d'attaque et maintenance inacceptables.
- **URL publique pour les pièces jointes** : fuite de documents personnels.
- **Déclenchement automatique dès la V1** : reporté pour maîtriser le volume,
  les doublons et les règles métier.

## Plan de mise en œuvre

1. Validation de cet ADR et mise à jour de l'index.
2. Migration `0044_webhooks.sql` : endpoints, livraisons, tentatives, index.
3. Domaine, value objects, ports et cas d'usage.
4. Chiffrement des secrets et résolution des champs/prospects/pièces jointes.
5. Garde SSRF et client HTTP avec timeout, redirections, retries.
6. File PostgreSQL et worker `instrumentation.ts`.
7. Routes API, RBAC et gardes multitenant.
8. UI admin (modèle + paramètres), déclenchement depuis la fiche et historique.
9. Tests unitaires, intégration, SSRF, isolation, versions de modèle,
   multipart et E2E.
10. Documentation, build, release et déploiement.

## Liens

- ADR-0002 (architecture en couches)
- ADR-0005 (matrice de rôles)
- ADR-0011 (modèles de raisonnement)
- ADR-0017 (fiches, archivage)
- ADR-0025 (multitenancy)
- ADR-0034 (champs fichier et pièces jointes)
