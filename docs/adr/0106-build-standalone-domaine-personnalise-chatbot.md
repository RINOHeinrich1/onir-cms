# 0106. Build standalone et domaine personnalisé par chatbot

- **Statut** : Proposé
- **Date** : 2026-11-23
- **Décideurs** : équipe projet
- **Référence** : ADR-0019, ADR-0023, ADR-0024, ADR-0040, ADR-0077,
  ADR-0095, ADR-0104, ADR-0105.
- **Complète** : ADR-0023 (paramètres), ADR-0105 (zones d’inspection).
- **Remplace** : aucune.

## Contexte

Un utilisateur souhaite attribuer un nom de domaine personnalisé à un chatbot
donné. Le besoin inclut :

- une URL publique propre au chatbot ;
- un certificat SSL automatisé ;
- un front public plus rapide et indépendant du rendu Next.js ;
- la possibilité de servir le chatbot sans que ONIR-CMS ne rende la page à
  chaque requête.

Aujourd’hui, la page publique est rendue par l’application Next.js sur
`/l/<token>`. Chaque visite passe par l’application, puis le template est monté
côté client et appelle l’API de conversation.

Le backend de conversation reste indispensable :

- création de session ;
- messages ;
- LLM / RAG ;
- SSE ou polling ;
- pièces jointes ;
- persistance.

Le build standalone ne remplace donc **pas** le backend. Il remplace uniquement
le **shell public statique** rendu par ONIR-CMS.

## Décision

### 1. Le build standalone est un snapshot de diffusion du chatbot

Le build est un artefact **immuable** produit à partir :

- d’un chatbot (`chat_link_id`) ;
- de son organisation ;
- de la configuration du canal **page publique** ;
- d’une version immuable de template visuel ;
- des paramètres statiques du template ;
- des textes, images, couleurs et sections prérendus ;
- de la configuration d’identification et de confidentialité utile au shell.

Il ne contient :

- ni secret ;
- ni donnée personnelle ;
- ni message de conversation ;
- ni contenu dynamique runtime.

Le build n’est pas un nouveau template et ne modifie pas la version du template.
Il référence une version existante.

### 2. Le standalone est une cible du canal Page publique

Le standalone n’est pas un troisième canal de conversation.

```text
Canal Page publique
├── URL ONIR : /l/<token>
└── Site autonome : build statique + domaine
```

Le canal Widget reste indépendant.

Cette décision évite de dupliquer :

- le template ;
- les paramètres ;
- l’identification ;
- la confidentialité ;
- les bindings de données.

Le standalone réutilise la configuration de la page publique.

### 3. Le backend de chat reste ONIR-CMS

Le build statique sert :

- le HTML prérendu ;
- les assets du template ;
- le runtime client ;
- la configuration publique du chatbot.

Le runtime client appelle ensuite les API ONIR-CMS pour :

- la session ;
- les messages ;
- le streaming ;
- les pièces jointes ;
- la collecte ;
- les actions.

Le build ne contient aucun accès direct à la base, au LLM ou au stockage interne.

### 4. Architecture cible

```text
ONIR-CMS — control plane
  ├── configuration chatbot
  ├── version de template
  ├── build standalone
  ├── domaines
  ├── activation / rollback
  └── audit

        │
        ▼

Build worker
  ├── snapshot de configuration
  ├── rendu statique
  ├── manifeste de build
  └── stockage objet immuable

        │
        ▼

Edge public
  ├── Host → build actif
  ├── assets statiques + cache
  ├── TLS / renouvellement
  ├── headers de sécurité
  └── fallback API

        │
        ▼

API ONIR-CMS
  ├── session
  ├── messages
  ├── LLM / RAG
  ├── SSE / polling
  └── pièces jointes
```

### 5. Aucun chemin filesystem exposé

Le domaine ne pointe pas directement vers un répertoire applicatif.

L’edge résout :

```text
Host HTTP → chatbot_domain → build actif → artefacts
```

Le chemin de stockage est un détail interne. Il ne doit jamais être exposé à
l’utilisateur ni utilisable comme entrée non validée.

### 6. Modèle de données proposé

#### Builds

```text
chatbot_standalone_builds
├── id
├── chat_link_id
├── organization_id
├── build_number
├── template_id
├── template_version
├── config_hash
├── artifact_key
├── artifact_sha256
├── status
├── created_by
├── created_at
├── activated_at
└── superseded_at
```

Statuts :

```text
queued
building
ready
failed
active
superseded
```

Un build est immuable après passage en `ready`.

#### Domaines

```text
chatbot_domains
├── id
├── chat_link_id
├── organization_id
├── hostname
├── kind
├── is_primary
├── verification_token
├── verification_status
├── ssl_status
├── active_build_id
├── last_checked_at
├── activated_at
├── last_error
└── created_at
```

Contraintes :

- `hostname` unique globalement, insensible à la casse ;
- un seul domaine principal par chatbot en V1 ;
- un build actif doit appartenir au même chatbot ;
- `kind` : `platform_subdomain` ou `custom_domain`.

#### Configuration standalone

Le canal page porte l’état d’activation :

```text
standalone_enabled
standalone_primary_hostname
active_build_id
```

Aucune table de configuration séparée n’est nécessaire en V1.

### 7. Artefact de build

Structure logique :

```text
builds/<chat_link_id>/<build_id>/
├── index.html
├── build.json
├── assets/
├── template/
└── runtime/
```

`build.json` contient :

- `build_id` ;
- `chat_link_id` ;
- `template_id` et `template_version` ;
- `config_hash` ;
- `api_base_url` ;
- `public_chat_id` ;
- `created_at` ;
- `sha256`.

Règles :

- URLs d’assets relatives ou contrôlées ;
- assets hashés ;
- pas de clé privée ;
- pas de token backoffice ;
- pas de source map en production ;
- SRI pour les bundles de template ;
- build reproductible ;
- build immuable.

### 8. Cycle de vie

```text
Configuration modifiée
        ↓
Build à reconstruire
        ↓
Construction
        ↓
Prêt à publier
        ↓
Activation atomique
        ↓
Build actif
```

Règles :

- un build ne devient actif que sur action explicite ;
- l’activation est atomique ;
- l’ancien build reste disponible pour rollback ;
- un changement de configuration rend le build actif **obsolète** ;
- l’UI affiche clairement « modifications non publiées » ;
- aucune reconstruction automatique à chaque frappe.

### 9. Domaines et SSL

#### Domaine ONIR par défaut

```text
<slug>.standalone.onir-cms.tech
```

Un certificat wildcard peut couvrir ces sous-domaines.

#### Domaine personnalisé

Le client ajoute un CNAME vers la cible standalone ONIR :

```text
CNAME  www.client.com  standalone.onir-cms.tech
```

Pour un domaine apex, l’UI indique la solution supportée par le DNS du client :
ALIAS, A record contrôlé ou redirection `www`.

#### Vérification de propriété

Avant activation :

1. l’utilisateur déclare le domaine ;
2. ONIR fournit un jeton de vérification ;
3. le domaine est vérifié par DNS ;
4. le certificat est demandé ;
5. le domaine passe en `active`.

Un domaine déjà utilisé par un autre chatbot est refusé.

#### Certificats

- ACME HTTP-01 par défaut lorsque le domaine pointe déjà vers l’edge ;
- DNS-01 si nécessaire pour les apex, wildcard ou contraintes DNS ;
- renouvellement automatique ;
- surveillance de l’expiration ;
- erreur visible et actionnable dans l’UI.

### 10. Edge et routage

L’edge :

- résout le `Host` vers le chatbot et le build actif ;
- sert les fichiers statiques ;
- applique les headers de sécurité ;
- applique le cache ;
- redirige éventuellement l’URL ONIR vers le domaine principal ;
- laisse passer les appels API vers ONIR-CMS ;
- journalise par domaine et par build.

Aucune écriture de configuration Nginx par domaine n’est faite manuellement.
La table `chatbot_domains` est la source de vérité.

### 11. API et CORS

Le build statique appelle ONIR-CMS avec :

- `public_chat_id` ;
- origine du domaine autorisé ;
- session/runtime selon le mode d’identification.

Règles :

- CORS par liste d’origines autorisées, jamais `*` pour les endpoints sensibles ;
- validation de l’origine côté API ;
- rate limiting par chatbot et par domaine ;
- cookies `Secure` et politique `SameSite` adaptée au cross-site ;
- protection CSRF selon les endpoints ;
- aucune donnée secrète dans le build.

### 12. UI/UX — rattachement au chatbot

Le déploiement et le domaine sont configurés **au niveau du chatbot**.

Emplacement :

```text
Chatbot
└── Modifier
    └── Publication
        ├── Page publique
        │   ├── URL ONIR
        │   └── Site autonome
        │       ├── Build actif
        │       ├── Historique / rollback
        │       ├── Domaine ONIR
        │       └── Domaine personnalisé
        └── Widget
```

Le standalone réutilise l’apparence et les paramètres de la page publique.

#### Carte « Site autonome »

Afficher :

- état d’activation ;
- URL ONIR ;
- build actif : version, date, statut ;
- indicateur « build à jour / à reconstruire » ;
- bouton **Construire** ;
- bouton **Publier ce build** ;
- bouton **Voir l’aperçu** ;
- historique et rollback ;
- domaine principal ;
- état DNS et SSL.

#### Ajout de domaine

Modale en 3 étapes :

1. saisie du domaine ;
2. affichage des enregistrements DNS à copier ;
3. vérification et émission du certificat.

États visibles :

```text
En attente DNS
Vérification
Certificat en cours
Actif
Erreur
Expiré
```

#### Liste des chatbots

Afficher un résumé :

```text
Site autonome · mada-conservation.org · Actif
Build à jour · SSL OK
```

Badges :

- `Build à jour` ;
- `Build à reconstruire` ;
- `DNS en attente` ;
- `SSL en erreur` ;
- `Actif`.

### 13. Permissions et audit

- `links:update` : construire, publier, configurer le domaine du chatbot ;
- `links:list` : voir l’état ;
- super-admin : vue transverse et support ;
- audit : création de build, activation, rollback, ajout/suppression de domaine,
  changement de domaine principal, échec SSL.

### 14. Périmètre V1

Inclus :

- build statique du shell public ;
- API de chat ONIR-CMS ;
- sous-domaine plateforme ;
- **un** domaine personnalisé principal par chatbot ;
- SSL automatisé ;
- activation / rollback ;
- UI dans Publication ;
- audit et statuts.

Hors périmètre V1 :

- plusieurs domaines ou alias par chatbot ;
- backend de chat séparé ;
- CDN multi-région avancé ;
- édition du build sur l’edge ;
- domaines pour le widget ;
- build temps réel à chaque sauvegarde ;
- gestion DNS chez le registrar du client.

### 15. Service standalone dédié et scalabilité

#### Séparation en quatre plans

Le serving des sites standalone ne doit pas être ajouté au serveur Next.js.

```text
Control plane  : ONIR-CMS (configuration, builds, domaines, activation)
Build plane    : workers de construction (file d’attente, concurrence bornée)
Storage plane  : object storage privé des artefacts immuables
Data plane     : service edge dédié au serving public
```

Cette séparation évite qu’un pic de trafic public, un déploiement applicatif ou
une reconstruction de site impacte le backoffice.

#### Service dédié, pas un serveur par site

Le service standalone est un **service unique multi-tenant** qui sert tous les
sites. Il ne faut pas créer un serveur ou un processus par chatbot.

Le service edge est responsable de :

- résoudre `Host → chatbot → build actif` ;
- servir les fichiers statiques ;
- gérer le cache local ;
- gérer TLS et SNI ;
- appliquer les headers de sécurité ;
- journaliser et limiter le débit ;
- exposer des métriques par domaine et par build.

Il ne fait pas :

- de construction de site ;
- de lookup base de données à chaque requête ;
- de stockage définitif des artefacts ;
- d’appel LLM ou de gestion de conversation.

#### Object storage actuel

L’object storage retenu peut être utilisé comme **origine privée** des builds,
dans un préfixe dédié :

```text
standalone-builds/<chat_link_id>/<build_id>/
```

Règles :

- ne pas mélanger avec les médias utilisateurs ;
- artefacts immuables ;
- pas d’accès public direct ;
- pas d’indexation du bucket ;
- accès interne par l’edge uniquement ;
- sauvegarde et politique de rétention ;
- purge des builds expirés ou remplacés.

L’object storage doit être traité comme une dépendance critique du data plane.
Il n’est jamais exposé directement à Internet : seul l’edge y accède.

Le niveau de service attendu doit être choisi selon la criticité du déploiement :

- V1 : sauvegardes, cache edge et procédure de restauration ;
- disponibilité renforcée : stockage répliqué ou S3-compatible dédié ;
- multi-région : réplication et stratégie de reprise adaptées.

#### Cache edge

Le modèle recommandé est :

```text
Build activé
  → l’edge télécharge l’artefact
  → l’edge le sert depuis son cache local
  → l’object storage reste la source durable
```

Le cache local doit être :

- adressé par `build_id` ;
- invalidable par build ;
- protégé contre les collisions de hostname ;
- limité par des quotas ;
- reconstructible automatiquement.

Le proxy direct vers l’object storage à chaque requête est un repli, pas le
mode nominal.

#### Résolution Host → build

L’edge doit maintenir un cache de routage :

```text
hostname → chat_link_id → active_build_id
```

Ce cache est alimenté par le control plane à l’activation d’un build ou d’un
domaine. Il peut utiliser Redis/Valkey ou un cache mémoire avec invalidation
par événement.

La base de données ne doit pas être interrogée à chaque requête HTTP.

#### Paliers de scalabilité

| Palier | Architecture | Limite principale |
|---|---|---|
| V1 | 1 edge dédié + worker + object storage + cache local | redondance à prévoir |
| V2 | 2+ edges stateless derrière load balancer + cache partagé | cohérence du cache et TLS |
| V3 | CDN multi-région + edges régionaux + stockage répliqué | purge, coûts, observabilité |

V1 est acceptable pour un pilote, à condition d’avoir :

- sauvegarde des artefacts ;
- procédure de reconstruction ;
- health checks ;
- supervision ;
- possibilité de relancer l’edge sur un autre serveur.

Le passage à V2 ne doit pas nécessiter de changer le format des builds ni les
URLs publiques.

#### Workers de build

Les workers sont séparés du data plane :

- file d’attente ;
- concurrence bornée ;
- isolation par conteneur ;
- secrets absents du build ;
- validation des assets ;
- limite de taille ;
- timeouts ;
- reprise sur erreur ;
- déduplication par `config_hash` quand le build est identique.

Un build ne doit jamais bloquer une requête publique.

#### TLS et ACME

Deux familles de certificats :

- wildcard plateforme pour `*.standalone.onir-cms.tech` ;
- certificat dédié par domaine personnalisé.

Recommandation :

- wildcard plateforme via DNS-01 ;
- domaine personnalisé via HTTP-01 après CNAME, ou DNS-01 si nécessaire ;
- certificats et clés privées stockés de façon centralisée et chiffrée ;
- renouvellement planifié avec jitter ;
- file d’attente et verrou par domaine ;
- backoff sur erreurs ACME ;
- ACME staging pour les tests ;
- alerte avant expiration.

**Certbot** peut servir de bootstrap, mais pas de socle multi-tenant :

- pas de file distribuée ;
- pas de verrou par domaine ;
- `certbot --nginx` modifie la configuration et recharge Nginx ;
- risque de doubles demandes avec plusieurs nœuds.

La cible est un gestionnaire ACME dédié (lego, Caddy/certmagic ou worker
équivalent) qui publie les certificats vers un stockage partagé, puis l’edge
charge les certificats via son mécanisme de mise à jour dynamique.

Les quotas ACME (certificats par domaine, doublons, commandes, validations en
attente) imposent une file d’attente et une politique de retry.

#### Disponibilité et reprise

- edge sans état applicatif, remplaçable ;
- artefacts reconstructibles depuis le control plane ;
- sauvegarde de l’object storage ;
- cache local non source de vérité ;
- bascule atomique du build actif ;
- conservation du build précédent ;
- purge des certificats et artefacts à la suppression du chatbot.

#### Observabilité et quotas

À prévoir par domaine et par build :

- requêtes, cache hit/miss, bande passante ;
- erreurs 4xx/5xx ;
- latence TLS et TTFB ;
- état du certificat ;
- taille et date du build actif ;
- erreurs de construction ;
- quotas stockage/bande passante par organisation.

#### Hors périmètre V1

- serveur par chatbot ;
- multi-région ;
- CDN complet ;
- réplication multi-site de l’object storage ;
- certificats payants ou multi-CA ;
- bascule automatique multi-fournisseurs.

## Alternatives écartées

### Laisser Next.js rendre la page derrière le domaine client

Un reverse proxy par domaine vers `/l/<token>` aurait été plus simple, mais ne
répond pas au besoin de build statique et garde la page dépendante du rendu
applicatif. Refusée comme cible.

### Exposer un répertoire par domaine

Fragile, non atomique, risque de traversée de chemins et de mauvaise isolation.
Refusée.

### Faire pointer le domaine directement vers le serveur applicatif

Ne résout ni le cache, ni le routage multi-tenant, ni l’automatisation SSL.
Refusée.

### Sortir aussi le backend de conversation

Coût et complexité importants, sans bénéfice immédiat pour le besoin exprimé.
Refusée en V1.

### Rebuild automatique à chaque modification

Trop coûteux et source de builds incohérents. Refusée : publication explicite.

### Un troisième canal « standalone »

Dupliquerait la configuration de la page publique. Refusée.

## Conséquences

### Positives

- front public plus rapide et cacheable ;
- indépendance du rendu Next.js pour la page ;
- domaine et SSL rattachés au bon objet métier ;
- rollback par build ;
- meilleure isolation du front public ;
- base saine pour un CDN.

### Négatives

- nouveau cycle de vie build / activation ;
- stockage d’artefacts et purge à prévoir ;
- gestion DNS et SSL asynchrone ;
- CORS et cookies cross-site à traiter ;
- builds obsolètes à signaler ;
- support de configurations DNS variées ;
- observabilité par domaine nécessaire.

## Migration et mise en œuvre

### Phase 1 — Build sur sous-domaine ONIR

1. modèle builds + domaines ;
2. worker de build ;
3. stockage d’artefacts ;
4. edge de résolution `Host → build` ;
5. UI Publication > Site autonome ;
6. API CORS ;
7. tests de charge et rollback.

### Phase 2 — Domaine personnalisé

8. vérification DNS ;
9. ACME / SSL ;
10. statuts et erreurs UI ;
11. redirection URL ONIR ;
12. audit et supervision.

### Phase 3 — Industrialisation

13. CDN ;
14. quotas stockage/bande passante ;
15. rebuild planifié ;
16. multi-domaine/alias si besoin.

## Vérifications attendues

- un build est immuable et reproductible ;
- aucun secret dans l’artefact ;
- activation atomique et rollback ;
- un domaine ne peut cibler qu’un chatbot ;
- le domaine par défaut fonctionne avec TLS ;
- un domaine personnalisé vérifié reçoit son certificat ;
- le renouvellement SSL est supervisé ;
- le build statique charge et utilise l’API de chat ;
- CORS refuse les origines non autorisées ;
- les cookies fonctionnent selon le mode d’identification ;
- l’URL ONIR et le domaine canonique ne créent pas de duplicate SEO ;
- un build obsolète est signalé ;
- la suppression du chatbot ou du domaine nettoie les artefacts et certificats ;
- les logs permettent de retrouver `chatbot_id`, `build_id` et `hostname`.

## Recommandation

Livrer d’abord le build statique sur sous-domaine ONIR, sans domaine client.
Cela valide le modèle de build, l’edge, le cache et l’API CORS avec un risque
limité.

Ajouter ensuite le domaine personnalisé et l’automatisation SSL.

Le point non négociable : le backend de chat reste ONIR-CMS en V1.
