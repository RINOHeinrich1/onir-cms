# 0041. Canaux de diffusion multiples des liens de chat

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Décideurs** : équipe projet
- **Référence** : complète et remplace partiellement ADR-0040 (surface widget),
  en s'appuyant sur ADR-0007 (liens spécifique/standard), ADR-0018
  (confidentialité), ADR-0019 (templates visuels), ADR-0023 (paramètres de
  template) et ADR-0033 (modes d'identification).

## Contexte

ADR-0040 a introduit le widget comme une propriété unique du lien :

```text
chat_links.surface = 'page' | 'widget'
```

Ce modèle répond au besoin initial d'un lien servi soit comme page, soit comme
widget. Il crée cependant une confusion sur les liens qui doivent être diffusés
sur plusieurs canaux :

- un lien widget reste accessible sur `/l/<token>` et y affiche la surface page ;
- un lien passé en surface page garde son snippet actif, mais `/embed/<token>`
  renvoie une page d'erreur brute dans l'iframe du widget ;
- les configurations visuelles, la confidentialité, l'identification et les
  paramètres sont portés par le lien, donc un canal ne peut pas avoir son propre
  rendu sans impacter l'autre ;
- l'URL `/l/<token>` est présentée comme l'URL du lien même lorsqu'il s'agit d'un
  widget, alors que ce n'est pas son URL canonique.

Le produit ne veut pas choisir **quelle surface utiliser**. Il veut choisir
**quels canaux de diffusion activer**, chaque canal activé ayant sa propre
configuration.

## Décision

### 1. Le lien porte le métier, les canaux portent la diffusion

Le `chat_link` reste l'entité métier unique :

- type `specifique` / `standard` ;
- token ;
- expiration et activation ;
- IA, sources, connaissances, état du visiteur ;
- conversations, prospects et fiches.

La diffusion est portée par des **canaux** indépendants :

```text
page    -> /l/<token>
widget  -> /embed/<token> via /widget/v1.js
```

Un lien peut avoir zéro, un ou plusieurs canaux activés. Le même token est
partagé par tous les canaux du lien. Le mot « surface » reste utilisé dans le
contrat runtime du template (`ctx.surface`) pour indiquer le canal courant, mais
ce n'est plus une propriété unique du lien.

### 2. Modèle de données

Ajouter une table de canaux :

```text
chat_link_channels (
  link_id                 uuid        not null references chat_links(id) on delete cascade,
  channel                 text        not null check (channel in ('page', 'widget')),
  enabled                 boolean     not null default false,
  visual_template_id      uuid        null,
  visual_template_version text        null,
  visual_template_params  jsonb       not null default '{}',
  visual_template_config  jsonb       not null default '{}',
  identification_mode     text        not null default 'contact'
                                      check (identification_mode in ('contact', 'anonymous', 'otp', 'internal')),
  confidentialite_id      uuid        null,
  channel_config          jsonb       not null default '{}',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  primary key (link_id, channel)
)
```

- `channel_config` porte les choix propres au canal ; pour `widget`, il contient
  au minimum la position autorisée (`{ "position": "bottom-right" }`).
- La configuration visuelle, les paramètres et le thème sont **par canal**.
- `confidentialite_id` est autorisé pour `page` et interdit pour `widget`.
- `identification_mode` est effectif pour `page`. Pour `widget`, il est contraint
  par les invariants ci-dessous.
- Les colonnes de diffusion de `chat_links` (`surface`, `visual_template_*`,
  `widget_config`, `identification_mode`, `confidentialite_id`) sont remplacées
  par cette table après migration.

### 3. Token unique et routes canoniques

Le token reste unique au niveau du lien.

- `GET /l/<token>` sert le canal `page` uniquement s'il est activé.
- `GET /embed/<token>` sert le canal `widget` uniquement s'il est activé.
- Le snippet reste stable : il ne contient ni template ni version.
- L'URL canonique d'un canal est :
  - **page** : `/l/<token>` ;
  - **widget** : le snippet `/widget/v1.js` et sa cible `/embed/<token>`.
- Le panneau ne propose l'URL `/l/<token>` que si le canal `page` est activé.
- Le panneau ne propose le snippet que si le canal `widget` est activé.

Un canal désactivé ne rend jamais la page publique de l'autre canal. Il renvoie
un état dédié, sans exposer de page d'erreur applicative brute dans le widget.

### 4. Désactivation et snippet

- Désactiver `widget` rend le snippet inactif sans changer le token.
- Désactiver `page` rend `/l/<token>` indisponible sans impacter le widget.
- La configuration d'un canal désactivé est conservée pour une réactivation.
- L'interface avertit lorsqu'un canal actif est désactivé alors qu'un snippet ou
  une URL a déjà été diffusé.
- Le loader widget ne doit pas afficher une page 404 applicative dans l'iframe :
  il affiche un état neutre ou masque l'iframe, avec un message compréhensible
  pour le visiteur.
- Une rotation/révocation du token invalide simultanément tous les canaux.

### 5. Conversations, prospects et fiches

Les conversations, prospects et fiches restent des objets métier uniques.

- Une conversation est créée par un canal et porte son origine :
  `conversations.channel = 'page' | 'widget'`.
- Le prospect et la fiche sont créés selon les règles existantes du type de lien
  et du canal.
- Un prospect par conversation widget reste la règle (ADR-0040).
- La même personne qui utilise la page et le widget produit deux conversations
  distinctes : aucune déduplication implicite n'est ajoutée.
- Les visites sont comptabilisées par canal.

### 6. Invariants

Un canal `widget` ne peut être activé que si :

- le template sélectionné déclare `ui.widget` ;
- `confidentialite_id IS NULL` ;
- pour un lien `standard`, `identification_mode = 'anonymous'` ;
- pour un lien `specifique`, le prospect connu est réutilisé ;
- la position demandée est autorisée par le template.

Un canal `page` peut utiliser un template page, une politique de confidentialité
et le mode d'identification applicable au type de lien.

Un lien peut avoir zéro canal activé (préparation ou suspension de diffusion) :
aucune route publique ne le sert. Le token reste stable.

Le type de lien, l'IA, les sources, les connaissances et les règles de prospect
restent des décisions du lien, jamais du canal.

### 7. Interface

Le panneau remplace le choix unique « Diffusion » par deux blocs indépendants :

- **Page publique** : activée / désactivée, template, paramètres, confidentialité,
  identification, URL.
- **Widget intégrable** : activé / désactivé, template, paramètres, position,
  snippet.

Chaque bloc possède sa propre configuration et son propre état d'activation.
Changer la configuration d'un canal ne modifie jamais l'autre.

### 8. Migration

1. Créer `chat_link_channels`.
2. Pour chaque lien existant :
   - `surface = 'page'` : créer `page` activé avec la configuration actuelle ;
     `widget` désactivé sans configuration.
   - `surface = 'widget'` : créer `widget` activé avec la configuration actuelle ;
     `page` désactivé sans configuration.
3. Backfiller `conversations.channel` à partir de la surface historique.
4. Adapter les routes, l'API et l'UI pour lire la table des canaux.
5. Supprimer les colonnes de diffusion devenues obsolètes sur `chat_links`.

Le lien widget existant conserve son snippet. Son `/l` devient indisponible
puisque le canal page est désactivé ; c'est le comportement voulu.

### 9. Contrat template

Le contrat `onirtech.template-host.v1` ne change pas :

```ts
surface: "page" | "widget";
```

`surface` décrit le canal en cours d'exécution. Il ne doit pas être utilisé pour
déduire une configuration globale du lien. Les variables, le thème et les
textes sont résolus depuis le canal courant.

## Conséquences

- Les canaux page et widget deviennent réellement indépendants.
- Un widget peut avoir un thème sombre et une page un thème clair.
- Changer la diffusion ne casse plus l'autre canal.
- Le snippet et l'URL publique ont une sémantique claire.
- Le schéma et l'UI sont plus riches : deux configurations à gérer.
- La migration doit préserver les tokens et les configurations existantes.
- Les tests doivent couvrir : canal activé/désactivé, double activation,
  désactivation d'un snippet actif, routes canoniques et origine des
  conversations.

## Alternatives écartées

1. **Garder `chat_links.surface` avec un simple avertissement** : ne résout pas
   le couplage des configurations ni l'ambiguïté des URLs.
2. **Dupliquer le lien par canal** : sépare artificiellement prospects, tokens,
   conversations et fiches.
3. **Un token par canal** : complique la rotation, l'identité et le partage.
4. **Template unique avec surcharges de canal** : insuffisant pour des rendus
   réellement indépendants et pour des templates compatibles avec un seul canal.
5. **Supprimer `/l` pour tous les liens** : inutile pour les liens page et
   destructif pour l'usage public existant.

## Références

- ADR-0040 : surface widget, iframe, contrat et lead widget.
- ADR-0007 : liens spécifique/standard.
- ADR-0018 : confidentialité et consentement.
- ADR-0019 : templates visuels.
- ADR-0023 : paramètres de templates.
- ADR-0033 : modes d'identification.
