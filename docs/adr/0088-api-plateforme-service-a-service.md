# 0088. API plateforme — authentification service-à-service

- **Statut** : Accepté
- **Date** : 2026-11-11
- **Décideurs** : équipe projet
- **Référence** : ADR-0025, ADR-0066.

## Contexte

Le backoffice commercial `onir-cms-commercial-back` doit appeler ONIR-CMS
pour gérer les profils de limites, provisionner une organisation, la suspendre
et la réactiver.

Ces appels sont serveur-à-serveur. Ils ne peuvent pas dépendre d'une session
navigateur super-admin.

## Décision

### 1. Clé de service

Les routes `/api/platform/*` acceptent :

```http
Authorization: Bearer <PLATFORM_API_KEY>
```

La clé est lue dans `PLATFORM_API_KEY` et n'est jamais exposée au navigateur.

L'acteur de service est identifié par `PLATFORM_API_USER_ID`, un utilisateur
réel super-admin. Son identifiant est utilisé pour les clés étrangères
`created_by` et pour l'audit.

### 2. Compatibilité session

Si aucun header `Authorization: Bearer` n'est présent, les routes conservent le
fallback session super-admin pour les écrans historiques.

Une clé Bearer invalide est refusée sans tenter le fallback session.

### 3. Endpoints

```text
GET    /api/platform/limit-profiles
POST   /api/platform/limit-profiles
PATCH  /api/platform/limit-profiles/:id
DELETE /api/platform/limit-profiles/:id

POST   /api/platform/organizations/provision
GET    /api/platform/organizations/:id
POST   /api/platform/organizations/:id/suspend
POST   /api/platform/organizations/:id/reactivate
```

### 4. Provisioning

`POST /api/platform/organizations/provision` :

- vérifie la clé plateforme ;
- crée l'organisation ;
- assigne le profil de limites ;
- crée une invitation administrateur ;
- retourne l'URL d'invitation ;
- enregistre la réponse par `externalRequestId` pour l'idempotence.

L'invitation reste à usage unique et expire selon ADR-0025.

### 5. Suspension / réactivation

Les endpoints appellent les cas d'usage existants et sont idempotents.

Le motif est transmis, mais la source et l'acteur restent tracés par la clé de
service.

### 6. Idempotence

La table `platform_provisioning_requests` conserve :

```text
external_request_id
organization_id
response
created_at
updated_at
```

Un même `externalRequestId` retourne la même réponse sans recréer d'organisation.

## Alternatives écartées

### Session super-admin uniquement

Rejetée : le backoffice n'a pas de session navigateur ONIR-CMS.

### Clé API stockée dans le navigateur

Rejetée : exposition de la clé.

### JWT signé

Rejeté pour le moment : la clé de service et l'acteur dédié suffisent.

## Conséquences

### Positives

- Appels serveur-à-serveur possibles.
- Aucun mot de passe super-admin stocké dans le backoffice.
- Fallback session conservé pour l'administration existante.
- Provisioning idempotent.

### Négatives

- La clé doit être protégée et tournée.
- Le compte `PLATFORM_API_USER_ID` doit rester actif et super-admin.
- Les échecs partiels entre création d'organisation et invitation doivent être
  surveillés.
