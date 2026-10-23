# Invitations par lien — guide d'exploitation

Fonctionnalité : un admin génère un **lien d'invitation à usage unique** ; l'invité
ouvre le lien, renseigne son identité et un mot de passe, puis rejoint
l'organisation cible avec le rôle prévu. Le lien expire après **7 jours** et peut
être **révoqué** à tout moment.

## Modèle

- Table `organization_invitations` (migration `0027_invitations.sql`) :
  - `organization_id` (`NULL` autorisé **uniquement** pour une invitation
    `admin` d'un super-admin — contrainte
    `organization_id IS NOT NULL OR role = 'admin'`) ;
  - `role`, `invited_by`, `expires_at`, `accepted_at`, `accepted_by`,
    `revoked_at`, `revoked_by` ;
  - `token_hash` (`sha256`, index unique — le token en clair n'est **jamais**
    stocké) et `token_enc` (chiffré AES-GCM via `LINK_TOKEN_KEY`, pour
    ré-afficher/copier le lien depuis la page Invitations).
- `users.name` (nullable) porte le nom saisi par l'invité.
- Statuts calculés : `pending` | `accepted` | `revoked` | `expired`.

## Qui peut inviter quoi

| Acteur | Organisations | Rôle « organisation vide » |
| --- | --- | --- |
| Super-admin | toutes, **ou** organisation vide | autorisé (`admin` uniquement) |
| Admin d'organisation | **sa seule** organisation | interdit |

- Le rôle est obligatoire ; si vide, il vaut `lecteur`.
- Un `lecteur` (ou tout rôle non `admin`) **doit** avoir une organisation :
  `isInvitationScopeValid` refuse `role != 'admin'` sans `organization_id`.
- Refus (409) si l'email est déjà membre de l'organisation cible : le lien ne
  sert **jamais** à changer un rôle existant.

## Organisation vide (Option A)

Une invitation sans organisation et avec le rôle `admin` crée, à l'acceptation,
une **organisation personnelle** au nom de l'invité (`organization_<local-part>`),
provisionnée avec les defaults système (modèles de raisonnement, politique de
confidentialité, templates visuels). Aucune donnée métier n'y est copiée.

## Accepter une invitation

- Route publique : `POST /api/invitations/accept` (lien `GET /invitation/<token>`).
- L'invité saisit : **nom complet**, **email**, **mot de passe** (min. 8),
  confirmation. L'email n'est **pas** pré-lié par le lien.
- Selon l'email saisi :
  - **compte inconnu** → création du compte (`must_change_password = false`) ;
  - **compte existant** → le mot de passe **existant** est exigé (aucun reset) ;
- Puis : membership `(organisation, rôle)` créée, invitation marquée `accepted`,
  session ouverte et redirection vers le dashboard.
- Anti-abus : honeypot `website` (réponse neutre `{ ok: true }`, rien n'est
  créé) + `invitationLimiter` (10 tentatives / 10 min / IP) → `429` +
  `Retry-After`.

### Erreurs d'acceptation

| Cause | HTTP | Message |
| --- | --- | --- |
| invalide / expirée / révoquée / déjà utilisée | 404 | « Invitation invalide ou expirée » |
| mot de passe existant incorrect | 401 | identifiants invalides |
| compte inactif / organisation suspendue | 403 | accès refusé |
| email déjà membre de l'organisation | 409 | déjà membre |

## API admin

- `GET /api/invitations` → invitations visibles par l'acteur (super-admin :
  toutes ; admin d'organisation : sa seule organisation).
- `POST /api/invitations` `{ organizationId?, role }` → `201` avec
  `invitation.url` (lien à copier).
- `DELETE /api/invitations/{id}` → révocation (`revoke`).

## Runbook

### Vérifier une invitation

```bash
# rôle, organisation, expiration, état (pending/accepted/revoked/expired)
psql "$DATABASE_URL" -c "select id, organization_id, role, expires_at, accepted_at, revoked_at from organization_invitations order by created_at desc limit 20;"
```

### Révoquer une invitation en attente

Depuis `/invitations` (« Révoquer ») ou :

```bash
psql "$DATABASE_URL" -c "update organization_invitations set revoked_at = now(), revoked_by = '<admin-user-id>' where id = '<invitation-id>' and accepted_at is null and revoked_at is null;"
```

### Reproduire le lien d'une invitation en attente

Le lien n'est jamais stocké en clair : il est **rechiffré** depuis
`token_enc` pour l'affichage. Si `LINK_TOKEN_KEY` a tourné et que le
déchiffrement échoue, l'URL n'est plus affichable → **révoquer et réinviter**.

### Forcer une expiration

```bash
psql "$DATABASE_URL" -c "update organization_invitations set expires_at = now() where id = '<invitation-id>';"
```

### Diagnostic « lien invalide »

1. `token_hash` introuvable → lien tronqué/altéré (`hashInvitationToken` sur le
   token reçu).
2. `expires_at < now()` → expiré (TTL 7 jours).
3. `revoked_at is not null` → révoqué.
4. `accepted_at is not null` → déjà utilisé (usage unique).

## Déploiement

1. CI : `validate` (lint, typecheck, unit, intégration, build) **puis** `e2e`
   (dont `tests/e2e/invitations.spec.ts`).
2. Merge `main` → `db:migrate` applique `0027_invitations.sql` (additif :
   `users.name` + nouvelle table) → `build` → `pm2 restart`.
3. La migration `0026_contract.sql` reste **différée** (voir
   `contract-0026.md`) : ne pas la fusionner avec `0027`.
