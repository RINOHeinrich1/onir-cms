# Invariants multitenancy (ADR-0025)

Source unique des règles d'isolation testées. Toute évolution du code doit préserver
ces invariants ; les tests d'isolation croisée (`tests/integration/tenant-isolation.test.ts`)
en sont la preuve exécutable.

## I1 — Aucun `organizationId` client

L'organisation active est **toujours** résolue depuis la session authentifiée (ou,
pour le parcours public, depuis le lien). Un `organizationId` fourni dans le body,
la query ou un cookie est ignoré.

**Tests** : `tenant-resolution.test.ts` (aucune organisation client acceptée),
`multitenancy.spec.ts` (E2E).

## I2 — Rôle effectif = membership active

L'autorisation utilise le rôle de `organization_members` pour l'organisation active.
`users.role` est legacy et ne doit jamais autoriser. Le super-admin dispose d'un
override explicite.

**Tests** : `rbac.test.ts`, `actor.test.ts`.

## I3 — Filtrage systématique par `organization_id`

Toute lecture de donnée métier (`prospects`, `chat_links`, `conversations`, `fiches`,
`chat_templates`, `base_connaissances`, `medias`, `confidentialites`) filtre par
`organization_id`. Les tables filles (`chat_messages`, versions d'assets) sont lues
via un parent scoped.

**Tests** : `tenant-isolation.test.ts` (T4 : `list` ne contient aucune ligne de l'autre org).

## I4 — Accès croisé = 404

Un identifiant appartenant à une autre organisation renvoie `null` côté dépôt, puis
`NotFoundError` (404) côté cas d'usage. Aucun 403 ne révèle l'existence d'une ressource
d'une autre organisation.

**Tests** : `tenant-isolation.test.ts` (T1–T3, T5–T7, T9, T13).

## I5 — Liens publics = capability portant son organisation

`token_hash` reste unique globalement. Le token résout le lien **et** son organisation ;
aucun paramètre client ne peut changer cette organisation. Une organisation suspendue
rend le lien public 404.

**Tests** : `tenant-isolation.test.ts` (T8, T15), scénarios E2E publics.

## I6 — Templates visuels : catalogue global + assignations

Le catalogue `visual_templates` est plateforme. Une organisation ne voit et ne
sélectionne que les templates présents dans `organization_visual_templates`. Le retrait
d'une assignation ne casse pas les liens existants (résolution par ID, sans contrôle
d'assignation au moment du rendu).

**Tests** : `tenant-isolation.test.ts` (templates), `organizations-provisioning.test.ts`,
scénario E2E de retrait.

## I7 — Contraintes physiques et unicités locales

Les unicités métier sont locales à l'organisation :
`base_connaissances(organization_id, lower(titre))`,
`medias(organization_id, type, lower(libelle))`,
`confidentialites(organization_id, lower(titre))`,
`chat_templates(organization_id, lower(key))`.
Les FK composites `(organization_id, id)` empêchent physiquement un croisement sur les
relations critiques.

**Tests** : `tenant-isolation.test.ts` (T11, T12).

---

## Rappel des hypothèses H1–H8

Les hypothèses du plan (`plans/Plan-multitenant-organisations-*.md` §3) sont documentées
et non bloquantes ; elles doivent être confirmées en revue humaine :

- H1 : super-admin = plus ancien `users.role='admin'`.
- H2 : membership `admin` du super-admin sur son organisation personnelle.
- H3 : import d'un template visuel réservé au super-admin.
- H4 : `users.actif` global, modifiable par le super-admin uniquement.
- H5 : suppression d'un utilisateur scoped = retrait de membership.
- H6 : défauts clonés depuis `Onirtech` (`fiche-projet`, `investisseur`, `presentation`).
- H7 : contrat (drop des `DEFAULT` legacy) différé à une release ultérieure.
- H8 : URLs médias publiques signées (HMAC courte durée).
