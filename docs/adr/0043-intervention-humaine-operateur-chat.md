# 0043. Intervention humaine dans les conversations et rôle « Opérateur chat »

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Décideurs** : équipe projet
- **Référence** : s'appuie sur ADR-0005 (RBAC), ADR-0016 (suivi des
  conversations), ADR-0017 (fiches multiples), ADR-0025 (multitenancy),
  ADR-0041 (canaux de diffusion) et ADR-0042 (API publique).

## Contexte

Le backoffice permet aujourd'hui de consulter une conversation et de générer
une fiche, mais un humain ne peut pas répondre au visiteur. Le modèle actuel est
strictement requête/réponse :

1. le visiteur envoie `POST /api/chat` ;
2. le serveur attend la réponse de l'IA ;
3. la réponse est renvoyée dans la même réponse HTTP et affichée par le
   navigateur.

Il n'existe donc aucun canal serveur → navigateur. Un message envoyé par un
opérateur ne peut pas apparaître chez le visiteur sans un mécanisme de poussée
ou de lecture périodique.

Le produit veut :

- permettre à un humain du backoffice d'intervenir dans une conversation ;
- disposer d'un rôle « Opérateur chat » limité aux conversations de son
  périmètre ;
- conserver les rôles existants : admin et marketeur accèdent automatiquement à
  l'intervention, lecteur reste en lecture seule ;
- marquer les conversations déjà prises en charge par un opérateur.

## Décision

### 1. Rôle `operateur`

Un nouveau rôle d'organisation est ajouté :

```text
operateur  -> « Opérateur chat »
```

Il ne dispose que des actions suivantes :

```text
conversations:list
conversations:read
conversations:intervene
conversations:generate_fiche
```

Il ne peut pas :

- lister, créer, modifier ou révoquer des liens de chat ;
- administrer les utilisateurs, organisations, invitations, clés API, webhooks
  ou fournisseurs IA ;
- modifier les fiches (`project:write`).

Admin et marketeur reçoivent `conversations:intervene` et
`conversations:generate_fiche`. Lecteur conserve exactement ses droits actuels
et ne peut pas intervenir.

L'opérateur est redirigé vers `/conversations` : la vue globale et les autres
modules ne font pas partie de son périmètre.

### 2. Portée par liens

Un opérateur voit les conversations des liens qui lui sont assignés. Par
défaut, il voit **tous les liens de son organisation**. L'administrateur peut
ensuite restreindre cette portée.

Le modèle de données distingue :

```text
chat_operator_scopes (
  organization_id uuid not null,
  user_id         uuid not null,
  all_links       boolean not null default true,
  primary key (organization_id, user_id)
)

chat_link_operators (
  organization_id uuid not null,
  link_id         uuid not null,
  user_id         uuid not null,
  primary key (link_id, user_id)
)
```

- Absence de ligne de portée = `all_links = true` (défaut).
- `all_links = true` : tous les liens présents et futurs de l'organisation.
- `all_links = false` : uniquement les liens de `chat_link_operators`.
- Le filtrage est appliqué **côté serveur** sur la liste, le détail et les
  opérations d'intervention. Un accès direct à une conversation hors périmètre
  renvoie `404`.

### 3. Mode de conversation `ai` / `human`

La conversation porte :

```text
intervention_mode   text not null default 'ai'  -- ai | human
assigned_user_id    uuid null references users(id)
last_operator_id    uuid null references users(id)
human_takeover_at   timestamptz null
```

Les messages portent :

```text
role            text not null  -- user | assistant | operator
author_user_id  uuid null references users(id)
```

Règles :

- le premier message d'un opérateur passe la conversation en `human`, l'assigne
  à cet opérateur et renseigne `human_takeover_at` ;
- en mode `human`, un message visiteur est enregistré mais **ne déclenche pas
  l'IA** ;
- si une réponse IA est déjà en cours lorsque l'opérateur prend la main, elle
  est jetée avant écriture ;
- le bouton « Rendre à l'IA » repasse en `ai` et libère l'assignation courante,
  sans effacer `last_operator_id` ni l'historique ;
- `last_operator_id` conserve le dernier intervenant pour le marquage
  `Opérateur : <nom>` même après un retour à l'IA ;
- les messages `operator` restent dans l'historique et sont présentés à l'IA
  comme des messages `assistant` lors d'une reprise.

### 4. Marquage des conversations

Toute conversation ayant déjà un intervenant affiche :

```text
Opérateur : <nom>
```

Le nom vient de `users.name`, avec repli sur l'email. Dans le transcript, chaque
message opérateur est signé par son auteur. Le détail affiche l'opérateur en
charge et l'historique des intervenants.

### 5. Temps réel : SSE avec repli polling

Le transport retenu est **SSE (Server-Sent Events)** :

- un flux pour le visiteur, un flux pour l'opérateur ;
- événements `message`, `mode`, `assigned`, `heartbeat` ;
- reprise via `Last-Event-ID` ou curseur `after` ;
- heartbeat toutes les 15 secondes ;
- Nginx est déjà configuré avec `proxy_buffering off`.

En cas d'échec du flux SSE, le client bascule automatiquement en **polling
toutes les 4 secondes**, avec le même curseur. Le polling reste le mécanisme de
secours, jamais le chemin nominal.

WebSocket n'est pas retenu : les Route Handlers Next.js avec `next start`
n'exposent pas l'événement `upgrade`. Un WebSocket exigerait un serveur custom
ou un service temps réel séparé, pour un besoin unidirectionnel que SSE couvre.

### 6. Génération de fiche

L'opérateur peut générer une fiche depuis une conversation autorisée via
`conversations:generate_fiche`. Il la télécharge depuis la conversation ; il
n'accède pas à la liste globale des leads. Admin et marketeur conservent leur
accès existant aux fiches.

## Conséquences

### Positives

- Intervention humaine possible sans refonte du chat.
- Périmètre opérateur explicite et vérifié côté serveur.
- Aucun nouveau service temps réel à exploiter.
- Repli polling garanti si SSE échoue.
- Traçabilité des messages et des intervenants.

### Négatives / limites

- Deux modes de transport à maintenir (SSE + polling).
- En mode `human`, l'IA ne répond plus tant que l'opérateur n'a pas rendu la
  main.
- Le SSE en mémoire ne diffuse pas entre plusieurs instances applicatives ; le
  polling de secours couvre les événements manqués. Une diffusion multi-instance
  passera ultérieurement par PostgreSQL `LISTEN/NOTIFY`.
- Les notifications push (email, navigateur) ne font pas partie de cette ADR.

## Mise en œuvre

1. Rôle, labels, RBAC, contraintes SQL et portée par liens.
2. Mode `ai` / `human`, messages `operator`, use cases d'intervention.
3. SSE + polling, composeur backoffice, affichage visiteur.
4. Marquage `Opérateur : <nom>`, génération de fiche scopée, tests et préprod.
