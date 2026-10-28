# 0044. Notifications du tableau de bord

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Décideurs** : équipe projet
- **Référence** : s'appuie sur ADR-0016 (suivi des conversations), ADR-0017
  (fiches multiples), ADR-0025 (multitenancy) et ADR-0043 (opérateur chat).

## Contexte

Le backoffice doit signaler deux activités :

- une **nouvelle conversation** ;
- un **nouveau lead** (fiche de prospection).

Le besoin est une cloche dédiée dans l'en-tête, avec un compteur de
notifications non lues, un menu limité par défaut et une action « Voir plus ».
Chaque notification doit rediriger vers l'élément concerné.

Le système doit rester simple à exploiter : plusieurs instances applicatives
peuvent tourner, et une notification ne doit pas être perdue parce qu'elle a été
émise par une autre instance.

## Décision

### 1. Read model, pas de table d'événements dupliquée

Les notifications sont **dérivées à la lecture** des tables source :

```text
conversations  -> notification « Nouvelle conversation »
fiches         -> notification « Nouveau lead »
```

Aucune table `notifications` ne duplique ces lignes. Les éléments supprimés ou
archivés disparaissent donc naturellement du flux, et aucun backfill n'est
nécessaire.

### 2. Filigrane de lecture par utilisateur et organisation

Une table unique porte l'état de lecture :

```text
notification_states (
  organization_id uuid not null,
  user_id         uuid not null,
  last_read_at    timestamptz not null,
  updated_at      timestamptz not null,
  primary key (organization_id, user_id)
)
```

- À la première consultation, `last_read_at = now()` : l'historique existant
  n'est pas compté comme nouveau.
- **Non lues** = activités accessibles avec `created_at > last_read_at`.
- L'ouverture du menu pose `last_read_at = now()` : le compteur retombe à zéro.
- L'état est partagé entre onglets et appareils pour un même utilisateur.
- Le choix est volontairement un **filigrane global**, pas un statut lu/ non lu
  par notification. C'est le comportement attendu d'une cloche de type réseau
  social et cela évite une table de lectures par élément.

### 3. Périmètre et RBAC

La cloche est affichée pour **tous les membres de l'organisation**. Le contenu
du flux applique exactement les droits existants :

- conversations : `conversations:list` ; un opérateur ne voit que les liens de
  son périmètre (`chat_operator_scopes` / `chat_link_operators`) ;
- leads : `project:read` ; un opérateur ne reçoit donc pas de notification lead,
  conformément à ADR-0043 ;
- une organisation suspendue ne produit aucune notification.

### 4. API

```text
GET /api/notifications?limit=6
  -> { items, unreadCount, hasMore, lastReadAt }

POST /api/notifications/read
  -> { lastReadAt }
```

- `limit` par défaut : 6, maximum : 50.
- Chaque item expose : `id`, `kind`, `title`, `detail`, `href`, `createdAt`,
  `read`.
- `hasMore` est calculé sans comptage total : chaque source est lue avec
  `limit + 1` lignes, puis le résultat fusionné est tronqué.
- `unreadCount` est un comptage exact des activités accessibles postérieures au
  filigrane.
- Les réponses sont `Cache-Control: no-store`.

### 5. Transport : polling léger

Le menu interroge `GET /api/notifications` toutes les 8 secondes lorsque
l'onglet est visible, et immédiatement au retour de focus.

Le SSE n'est pas retenu pour ce flux : le volume est faible, le polling est
naturellement multi-instance, et le compteur doit de toute façon être relu pour
rester exact. Le SSE reste réservé aux messages de conversation (ADR-0043).

### 6. Interface

- Cloche dédiée dans l'en-tête, badge numérique (`99+` au-delà).
- Panneau avec limite par défaut et bouton « Voir plus ».
- Chaque ligne est un lien vers `/conversations/{id}` ou `/leads/{id}`.
- Les nouveaux éléments détectés pendant la session déclenchent aussi un toast
  cliquable ; le menu reste la source d'historique.
- Les alertes opérationnelles d'ADR-0046 sont exposées dans une section
  « À traiter » séparée. Elles ne sont pas effacées par le filigrane de lecture :
  elles restent comptées jusqu'à résolution humaine.
- Les classes DOM sont préfixées `activity-` : les filtres cosmétiques de
  certains bloqueurs de publicité ciblent `.notification` et masquaient la
  cloche après hydratation.

## Conséquences

### Positives

- Aucune duplication d'événements ni de backfill.
- Compteur et historique cohérents entre instances et appareils.
- Aucun nouveau service temps réel à exploiter.
- Périmètre RBAC identique aux écrans existants.

### Négatives / limites

- Le menu marque tout comme lu à l'ouverture (pas de lecture élément par
  élément).
- Une activité supprimée disparaît de l'historique.
- Le délai de détection est borné par le polling (8 s).
- Le flux est limité aux 50 éléments les plus récents par source ; au-delà,
  l'historique complet reste accessible via les écrans Conversations et Leads.
