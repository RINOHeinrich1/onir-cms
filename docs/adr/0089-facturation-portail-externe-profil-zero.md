# 0089. Facturation externalisée — portail client commercial et profil de limites zéro

- **Statut** : Accepté
- **Date** : 2026-11-13
- **Décideurs** : équipe projet
- **Référence** : ADR-0065, ADR-0066, ADR-0087.
- **Complète** : ADR-0087.
- **Remplace** : aucune.

## Contexte

ADR-0087 définit le modèle commercial : abonnements avec tokens inclus,
paiements et factures portés par le service de facturation, quotas appliqués par
ONIR CMS.

Le besoin actuel est d'exposer au client :

- son abonnement ;
- le renouvellement ;
- la suspension ;
- l'historique des factures.

Deux contraintes structurent la solution :

1. ne pas transformer ONIR CMS en backoffice de facturation ;
2. ne pas suspendre le compte ONIR, ses données ou l'accès aux factures quand
   l'abonnement commercial est suspendu.

L'interface peut être externalisée, mais ONIR CMS doit continuer à appliquer
les limites de consommation.

## Décision

### 1. Le portail client est hébergé dans le backoffice commercial

Aucune nouvelle application n'est créée.

Le backoffice commercial expose un espace client protégé, recommandé sur un
sous-domaine dédié :

```text
billing.onir-cms.tech/espace-client
```

Il réutilise le design de la landing. La page publique `/tarifs/` reste une
page marketing et ne contient aucune donnée privée.

Le portail porte :

- la lecture de l'abonnement ;
- la souscription / le renouvellement ;
- la suspension ;
- l'historique des factures ;
- le téléchargement PDF.

Le backoffice commercial reste la source de vérité.

### 2. Handoff sécurisé ONIR → portail

ONIR CMS ne transmet jamais directement l'organisation, l'email, l'offre ou le
statut dans une URL non signée.

Le flux retenu est un **code à usage unique** :

```text
ONIR /facturation
  → POST /api/platform/billing/handoff (clé serveur)
  ← { code, expiresAt }
  → redirection billing.onir-cms.tech/espace-client?code=...
  → échange du code côté serveur
  → session client HttpOnly
```

Le code est :

- à durée courte ;
- à usage unique ;
- stocké côté commercial ;
- échangé uniquement serveur-à-serveur.

Le portail recharge ensuite les données depuis le backoffice commercial. Il ne
fait jamais confiance à l'offre ou au statut fournis par ONIR.

### 3. Authentification et isolation

Le portail client utilise une session et un cookie distincts de
l'administration commerciale.

- aucune permission admin ;
- accès limité à l'organisation de l'utilisateur ;
- vérification finale du propriétaire via `ownerEmail` de l'abonnement ;
- cookie `Secure`, `HttpOnly`, `SameSite` adapté ;
- protection CSRF sur les actions.

### 4. Accès sans abonnement commercial

Le menu `Facturation` est visible pour le propriétaire de l'organisation dès
que la fonctionnalité est activée au build, même sans abonnement commercial.

Si l'organisation n'a pas d'abonnement commercial, le portail affiche
uniquement :

- un message d'accès ;
- les coordonnées du support ONIR CMS :
  - `contact@onir-cms.tech`
  - WhatsApp `+261 34 93 682 33`.

Aucun autre contenu billing n'est affiché.

### 5. Suspension par profil de limites zéro

La suspension commerciale **ne suspend pas l'organisation ONIR**.

Le backoffice commercial :

1. crée un profil de limites normal via l'API plateforme ONIR ;
2. à la suspension, assigne ce profil à l'organisation ;
3. au renouvellement validé, réassigne le profil d'origine.

Le profil zéro est géré par le backoffice commercial. Il n'est ni global, ni
codé en dur dans ONIR CMS.

Exemple de profil :

```text
maxChatbots = 0
maxTokens = 0
maxMessages = 0
maxStorageMb = 0
```

Effets :

- compte accessible ;
- données existantes accessibles ;
- factures accessibles ;
- nouveaux chatbots bloqués ;
- nouveaux messages bloqués ;
- nouveaux tokens IA bloqués ;
- nouveaux stockages bloqués.

La route plateforme à ajouter côté ONIR :

```http
PATCH /api/platform/organizations/:id/limit-profile
```

Le use case `assignLimitProfile` existe déjà ; il faut exposer la route et
tracer l'action.

`POST /api/platform/organizations/:id/suspend` n'est pas utilisé pour la
facturation.

### 6. Factures

Les factures restent dans le backoffice commercial.

Depuis ONIR, le menu redirige vers le portail ; ONIR ne stocke ni facture ni PDF.
Le portail affiche l'historique et permet le téléchargement, y compris lorsque
l'abonnement est suspendu.

### 7. Feature flag build-time

```text
BILLING_ENABLED=false
BILLING_PORTAL_URL=https://billing.onir-cms.tech/espace-client
```

- figés au build ;
- si `BILLING_ENABLED=false` : aucun menu, aucune route utile, aucun appel ;
- activer la fonctionnalité exige un nouveau build de l'image.

Le secret serveur reste en runtime :

```text
COMMERCIAL_BILLING_API_KEY=...
```

Il n'est jamais exposé au navigateur ni gravé dans l'image.

### 8. Indisponibilité

Si le backoffice commercial ou le portail est indisponible, ONIR affiche une
page `Facturation indisponible`. L'accès au compte et aux données reste
possible. La landing publique n'est pas impactée.

## Alternatives écartées

### Intégrer le billing dans ONIR CMS

Rejeté : duplication du domaine commercial, couplage fort, maintenance de
paiements et factures dans l'application.

### Mettre le portail privé sur `/tarifs/`

Rejeté : page publique statique, risque de fuite de données et de sessions.

### Utiliser `organizations.suspended_at`

Rejeté : coupe le login, les données et les clés API, alors que seule la
consommation de nouvelles ressources doit être bloquée.

### Créer un profil zéro global dans ONIR

Rejeté : ONIR ne doit pas porter de sémantique commerciale. Le profil est créé
et géré par le backoffice commercial.

## Conséquences

### Positives

- Très peu de logique billing dans ONIR CMS.
- Aucun couplage à la base commerciale.
- Factures et paiements restent dans le backoffice commercial.
- Suspension sans perte d'accès au compte ni aux données.
- Profil zéro réutilisable et auditable.
- Aucune nouvelle application à déployer.

### Négatives / limites

- Le backoffice commercial doit exposer un espace client authentifié.
- Le handoff doit être maintenu et sécurisé.
- Une panne du backoffice commercial rend la facturation indisponible.
- L'assignation du profil zéro doit être retentée en cas d'échec.
- Le propriétaire doit être vérifié à chaque session portail.

## Tests attendus

- flag désactivé : menu absent, route inaccessible ;
- flag activé : menu visible pour le propriétaire ;
- organisation sans abonnement : message support uniquement ;
- abonnement actif : factures et renouvellement accessibles ;
- suspension : profil zéro assigné, compte et données toujours accessibles ;
- nouveaux messages/tokens/stockage/chatbots bloqués ;
- renouvellement validé : profil d'origine restauré ;
- handoff falsifié, expiré ou rejoué : refusé ;
- backoffice indisponible : page d'erreur, pas de fuite de données ;
- super-admin : aucun accès Facturation.
