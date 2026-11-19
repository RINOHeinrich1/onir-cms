# 0100. Webhooks événementiels sur le cycle de vie des fiches — outbox transactionnelle et dispatcher

- **Statut** : Accepté
- **Date** : 2026-11-19
- **Référence** : ADR-0035, ADR-0061, ADR-0049, ADR-0082, ADR-0025, ADR-0101, ADR-0102.
- **Prolonge** : ADR-0061 (webhooks rattachés aux fiches de collecte).

## Contexte

Les webhooks actuels sont rattachés à un chatbot (`chat_link_id`) et,
optionnellement, à une fiche de collecte (`fiche_key`). Ils sont déclenchés
**manuellement** depuis une fiche persistée : `triggerWebhook` charge la ligne
`fiches`, construit la requête, crée une livraison, puis le worker HTTP
`processWebhookDelivery` l'envoie avec retries et journalisation.

Le brouillon d'une fiche vit dans `conversation_fiche_instances`. Il est enrichi
à chaque tour par la détection IA, par les éditions manuelles et par le
formulaire de collecte. La ligne `fiches` n'est créée qu'à la validation
finale (« Terminer »). Les webhooks ne doivent donc pas être branchés uniquement
sur `fiches` : les transitions utiles se produisent aussi dans le brouillon.

Le besoin est de déclencher automatiquement un webhook lorsqu'une fiche atteint
un état métier fiable, sans ajouter de latence au tour de chat et sans créer de
livraisons incohérentes.

## Décision

### 1. Catalogue d'événements

Le catalogue est fermé, versionné et indépendant des endpoints :

| Événement | Source | Condition |
| --- | --- | --- |
| `fiche.draft.all_fields_filled` | brouillon | tous les champs de la fiche sont remplis, facultatifs inclus |
| `fiche.draft.field_filled` | brouillon | un champ configuré passe de vide à rempli |
| `fiche.draft.required_fields_filled` | brouillon | tous les champs obligatoires de la fiche sont remplis |
| `fiche.validated` | fiche finale | une ligne `fiches` a été créée avec succès après validation |

Règles de transition :

- un événement décrit une **transition**, jamais un état absolu ;
- `field_filled` ne se déclenche que sur `vide → non vide` ;
- `required_fields_filled` se déclenche sur `missingRequired > 0 → 0` ;
- `all_fields_filled` se déclenche lorsque le nombre de champs vides passe de
  `> 0` à `0` ;
- `fiche.validated` se déclenche après `fiches.create` réussi, jamais sur le
  simple statut `complete` d'une instance ;
- les champs conditionnellement obligatoires sont évalués avec
  `isFieldRequired` et `isFieldEmpty` ;
- un événement n'est pas émis pour une instance `abandoned`.

`status = complete` sur `conversation_fiche_instances` reste une information de
collecte ; il ne doit pas être confondu avec `all_fields_filled`.

### 2. Évaluateur de transitions

Un service de domaine pur reçoit :

```text
définition de fiche + état avant + état après + pièces jointes
```

et retourne uniquement les événements réellement franchis. Il ne connaît ni les
endpoints, ni HTTP, ni la base.

### 3. Outbox transactionnelle

Les événements sont écrits dans `fiche_lifecycle_events`, dans la **même
transaction** que la mise à jour de l'instance de fiche. Un événement ne doit
jamais être perdu si l'écriture de la fiche réussit.

L'outbox contient au minimum :

```text
id, organization_id, event_type, source, chat_link_id, config_id,
fiche_key, conversation_id, fiche_instance_id, fiche_id, field_key,
status, payload, occurred_at, dispatched_at
```

Le `payload` est un **snapshot de l'état au moment de l'événement** : données de
la fiche, champs manquants, statut, version de configuration et définition
nécessaire au rendu des mappings. Le worker ne doit pas relire l'instance live
pour construire un payload de brouillon.

### 4. Configuration des déclencheurs

Une table dédiée sépare les abonnements des endpoints :

```text
webhook_endpoint_triggers (
  id, endpoint_id, event_type, field_key, created_at
)
```

- `field_key` est requis pour `fiche.draft.field_filled` ;
- un endpoint peut cumuler plusieurs déclencheurs ;
- un endpoint **sans ligne de trigger reste manuel uniquement** ;
- les endpoints existants ne changent donc pas de comportement après migration ;
- les triggers sont validés contre la définition de fiche au moment de
  l'enregistrement.

Le déclenchement manuel existant reste disponible et distinct.

### 5. Dispatcher et worker

Deux étages séparés :

```text
fiche_lifecycle_events
  → dispatcher : matching endpoints + création des webhook_deliveries
  → worker HTTP existant : envoi, retries, journal
```

Le dispatcher :

- ne fait aucun appel HTTP ;
- traite les événements en `pending` ;
- crée une livraison par couple `(event_id, endpoint_id)` ;
- utilise une contrainte d'unicité `(endpoint_id, fiche_event_id)` ;
- marque l'événement `dispatched` ou `failed` ;
- peut être accéléré par `LISTEN/NOTIFY`, avec polling en filet de sécurité.

Le worker HTTP existant est conservé.

### 6. Payload et compatibilité

Le builder de requête est abstrait en `WebhookPayloadSource` pour accepter :

- une fiche finale (`fiches`) ;
- un brouillon (`conversation_fiche_instances`).

Le payload expose au minimum :

```text
event.type, event.occurredAt,
fiche.id (null en brouillon), fiche.instanceId, fiche.key, fiche.status,
conversation.id, prospect.*, données mappées
```

Les en-têtes ajoutés sont :

```text
X-ONIR-Event
X-ONIR-Event-Id
X-ONIR-Event-Version
Idempotency-Key
```

Le builder existant reste seul responsable des mappings, des secrets, des
pièces jointes et de la validation des valeurs requises.

### 7. Latence et scalabilité

- aucun HTTP dans le tour de chat ;
- une écriture d'instance + une écriture d'outbox dans la même transaction ;
- dispatcher asynchrone, workers HTTP horizontaux ;
- `FOR UPDATE SKIP LOCKED` pour les dispatchers ;
- index sur `(status, occurred_at)` et sur les triggers ;
- possibilité de partitionner `fiche_lifecycle_events` par mois ;
- regroupement des événements d'un même tour si le volume de
  `field_filled` devient important ;
- conservation bornée des payloads de brouillon.

### 8. Sécurité

- conditions évaluées côté serveur uniquement ;
- filtrage par organisation, chatbot et fiche ;
- validation de `field_key` contre la définition ;
- aucun endpoint automatique sans trigger explicite ;
- payload limité aux champs mappés ;
- en-têtes d'événement et idempotence pour éviter les rejeux ;
- rétention et minimisation des données de brouillon.

### 9. Évaluation conditionnelle (A)

Pour éviter de calculer et d'écrire des événements inutiles, le tour de chat
charge un **profil d'automatisation** par couple chatbot / fiche.

```text
hasAnyTrigger(organizationId, chatLinkId, ficheKey)
  → événements automatiques demandés
  → champs `field_filled` demandés
```

- si aucun endpoint automatique actif n'est abonné au périmètre, l'évaluateur
  de transitions n'est pas appelé et aucune ligne d'outbox n'est écrite ;
- l'extraction IA et la mise à jour du brouillon restent inchangées ;
- si un seul événement est demandé, l'évaluateur ne calcule que celui-ci ;
- les endpoints sans trigger restent manuels ;
- un endpoint `fiche_key = null` couvre toutes les fiches du chatbot ;
- un événement ajouté en cours de conversation ne rejoue pas le passé.

Le profil est lu depuis la base dans un premier temps. Si un cache est ajouté,
il doit être invalidé explicitement à chaque création, modification ou
suppression d'endpoint ou de trigger. Les caches de configuration chatbot
existants ne couvrent pas les webhooks.

Ce mécanisme ne supprime jamais l'enregistrement des erreurs de fiche utilisé
par ADR-0102 : l'optimisation ne concerne que les événements webhook.

## Conséquences

### Positives

- webhooks automatiques sans coupler le chat à des appels HTTP externes ;
- transitions fiables, sans faux déclenchements liés aux répétitions IA ;
- outbox auditable et rejouable ;
- compatibilité totale avec les endpoints manuels existants ;
- architecture extensible à d'autres événements de fiche.

### Coûts

- nouvelle table d'événements, de triggers et adaptation du builder ;
- nécessité d'une transaction couvrant état + outbox ;
- nouvelle surface de configuration et de tests ;
- gestion du fan-out des événements `field_filled`.

## Décisions liées

- **ADR-0101** : contrat de payload des déclencheurs automatiques et garde
  d'exécution lorsque des mappings requis ne sont pas garantis.
- **ADR-0102** : contexte runtime des erreurs de webhook et de fiche pour les
  réponses IA, sans transformation en base de connaissances.

## Points ouverts

- granularité de regroupement des événements `field_filled` en cas de fort
  volume ;
- activation d'un mode proactif de réponse après un échec, hors périmètre de
  cette ADR.
