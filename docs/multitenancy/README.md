# Multitenancy — guide d'exploitation (ADR-0025)

## Concepts

- **Organisation** : tenant. Toutes les données métier portent `organization_id`.
- **Membership** : `(organization_id, user_id, role)` — un utilisateur peut
  appartenir à plusieurs organisations avec un rôle différent par organisation.
- **Super-admin** : `users.is_super_admin = true`. Crée/suspend les organisations,
  voit toutes les organisations et bascule partout.
- **Admin d'organisation** : rôle `admin` dans `organization_members`. Gère les
  membres et les données de **sa seule** organisation.
- **Organisation active** : `sessions.active_organization_id`. Elle est choisie
  par le serveur (jamais par le client) et basculée via
  `POST /api/auth/switch-organization`.

## Règles d'isolation

1. Aucun `organizationId` n'est accepté du body, de la query ou d'un cookie.
2. Toute ressource d'une autre organisation est traitée comme **inexistante**
   (404), y compris par identifiant direct.
3. Les liens publics portent leur organisation (`token_hash` global) ; une
   organisation suspendue rend le lien 404.
4. Les médias publics utilisent une URL signée HMAC courte durée ; le stockage
   des nouvelles photos est préfixé `orgs/<organizationId>/`.
5. Les templates visuels sont un catalogue plateforme ; une organisation ne voit
   que ceux qui lui sont assignés. Un retrait ne casse pas les liens existants.

## Créer une organisation (super-admin)

1. `/organisations` → « Nouvelle organisation » (nom vide = partie locale de
   l'email du créateur).
2. Le système provisionne automatiquement : 3 modèles de raisonnement
   (`fiche-projet`, `investisseur`, `presentation`), la politique de
   confidentialité par défaut, et tous les templates visuels du catalogue.
3. L'organisation ne contient **aucune** donnée métier (prospect, lien,
   conversation, fiche, média).

## Rattacher un utilisateur

- **Super-admin** : peut rattacher n'importe quel compte existant à n'importe
  quelle organisation.
- **Admin d'organisation** : peut rattacher un compte qui n'appartient encore à
  aucune autre organisation, ou créer un compte dans son organisation.
- Le dernier admin d'une organisation ne peut être ni retiré ni rétrogradé (409).

## Basculer d'organisation

Le sélecteur de l'en-tête appelle `POST /api/auth/switch-organization`. Le
serveur vérifie la membership (ou le flag super-admin) et l'absence de
suspension, puis met à jour la session et `users.last_active_organization_id`.

## Inviter un utilisateur (lien)

Un admin génère un **lien d'invitation** à usage unique (`/invitations`, 7 jours,
révocable) que l'invité accepte en créant son compte ou en prouvant son mot de
passe existant. Détail du flux, rôles autorisés, cas « organisation vide » et
runbook : [`invitations.md`](./invitations.md).

## État « aucune organisation »

Un utilisateur authentifié sans membership (et non super-admin) est dirigé vers
`/no-organization` (`NO_ORGANIZATION_PATH`). La page tente d'abord de sélectionner
automatiquement la première organisation non suspendue ; à défaut, elle affiche
l'état sans organisation. Aucune donnée métier n'est accessible.

## RLS

L'isolation est **applicative** dans cette release (ADR-0025 §10). Le helper
`withTenantTransaction(pool, organizationId, fn)` positionne
`app.organization_id` pour préparer une future RLS PostgreSQL. Ne pas s'appuyer
sur RLS aujourd'hui.
