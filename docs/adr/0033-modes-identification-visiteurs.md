# 0033. Modes d'identification des visiteurs

- **Statut** : Proposé (à valider)
- **Date** : 2026-10-24
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0007 (liens spécifique/standard), ADR-0018
  (confidentialité), ADR-0019 (templates visuels) et ADR-0024 (SDK).

## Contexte

Aujourd'hui, le mode d'identification est implicitement lié au type de lien :

- un lien **standard** affiche obligatoirement `ContactGate` (nom + email) ;
- un lien **spécifique** est déjà rattaché à un prospect : il n'affiche aucun
  formulaire et réutilise les coordonnées du prospect.

Le produit veut pouvoir choisir explicitement le mode d'identification d'un lien
public, indépendamment de la politique de confidentialité et du mode de
conservation :

- **Nom et contact** : comportement actuel ;
- **Anonyme** : aucun formulaire, aucune identité demandée ;
- **OTP par email** : email vérifié par code, sans mot de passe (ultérieur) ;
- **Utilisateur interne** : authentification réelle email/mot de passe + rôle
  (ultérieur).

Les deux derniers modes ne sont pas implémentés dans cette décision. Ils sont
réservés dans le modèle pour éviter une migration de rupture ultérieure.

## Décision

### 1. Trois axes indépendants

L'identification, la conservation et le consentement sont trois préoccupations
distinctes :

| Axe | Champ | Rôle |
|---|---|---|
| Identification | `chat_links.identification_mode` | Qui est le visiteur |
| Conservation | `chat_links.storage_mode` (ADR à venir) | Conversation conservée ou éphémère |
| Confidentialité | `chat_links.confidentialite_id` | Politique/consentement |

Aucun mode d'identification ne doit être déduit de l'absence d'email, de
prospect ou de politique. Inversement, `anonymous` ne force pas le mode
éphémère : un lien anonyme peut être persisté ou éphémère.

### 2. Modèle de données

Ajouter sur `chat_links` :

```text
identification_mode text NOT NULL DEFAULT 'contact'
  CHECK (identification_mode IN ('contact', 'anonymous', 'otp', 'internal'))
```

- `contact` est la valeur par défaut : aucun changement pour les liens
  existants.
- `otp` et `internal` sont réservés ; ils ne sont ni proposés ni acceptés par
  l'API tant que leur implémentation n'est pas livrée.
- Le mode effectif est **toujours résolu depuis le lien** ; il n'est jamais
  fourni par le client dans le body ou la query.

Le mode n'est pas dupliqué sur `conversations` dans cette phase : il est déduit
des données de la conversation (`prospect_id`, `visitor_email`, puis
`visitor_user_id` pour les modes futurs).

### 3. Type de lien et mode d'identification

Le `type` reste distinct du mode d'identification :

- `type = 'standard'` : `identification_mode` s'applique ;
- `type = 'specifique'` : le prospect est connu par le lien. Aucun formulaire
  n'est affiché. Le mode d'identification est ignoré et les valeurs
  `anonymous`, `otp`, `internal` ne sont pas sélectionnables.

Un lien spécifique n'est donc jamais « anonyme » : il est identifié par
construction. Son comportement actuel est conservé.

### 4. Mode `contact`

C'est le comportement actuel :

- nom et email valides requis ;
- contacts complémentaires optionnels ;
- prospect créé ou retrouvé par email dans l'organisation ;
- reprise d'une conversation ouverte possible avec le même email ;
- fiche possible en fin de conversation.

Le libellé UI reste **« Nom et contact »**.

### 5. Mode `anonymous`

- Aucun formulaire d'identité.
- Aucun nom, email ou contact demandé.
- Aucun prospect créé ; `prospect_id = NULL`.
- `visitor_nom` et `visitor_email` restent vides en base.
- Aucune reprise par email ; un rafraîchissement ne retrouve pas la
  conversation.
- L'interface et le dashboard affichent **« Anonyme »** sans stocker cette
  valeur comme une fausse identité.
- En conservation persistée, la conversation est créée **au premier message**
  (pas au chargement) avec une identité vide.
- Aucune fiche nominative n'est générée. Une synthèse anonyme éventuelle fera
  l'objet d'une décision ultérieure.
- En mode éphémère, aucune conversation n'est créée en base (ADR dédiée).

Le libellé public recommandé est **« Sans identification »** ; `anonymous`
reste le nom technique. Ce mode ne constitue pas une anonymisation juridique :
les messages peuvent contenir des données personnelles, les logs peuvent
contenir l'IP et le fournisseur IA reçoit les messages.

### 6. Modes futurs

#### OTP par email

- L'identité est un email vérifié par un code à durée limitée.
- Aucun mot de passe.
- Le code est stocké temporairement (hash, expiration, tentatives limitées) ;
  la conversation n'est pas nécessairement persistée.
- L'email vérifié permet la reprise d'une conversation ouverte.
- Une ADR dédiée précisera le stockage des challenges, le rate limiting,
  l'anti-énumération et le fournisseur d'envoi.

#### Utilisateur interne

- Authentification réelle via le mécanisme email/mot de passe existant.
- Contrôle de l'organisation et du rôle avant l'accès au lien.
- La conversation peut être rattachée à l'utilisateur authentifié.
- Un lien interne n'est pas public et ne permet pas `anonymous`.
- Une ADR dédiée précisera les droits, le rattachement utilisateur et le
  parcours de connexion.

### 7. Templates visuels

L'identification est gérée par le **host**, pas réimplémentée dans chaque
template.

- Le template reçoit le mode effectif dans le contexte (`identificationMode`).
- Une capability/manifeste `identificationModes` permet de déclarer les modes
  supportés. Par défaut, un template sans déclaration reste compatible avec
  `contact` uniquement.
- En mode `anonymous`, le host démarre directement en phase `chat`, sans appeler
  `submitIdentity`.
- Le template `Immersive` officiel doit être adapté : sas d'identité sauté et
  aucune identité sauvegardée dans `localStorage` en anonyme.
- Un template qui ne déclare pas `anonymous` ne doit pas être sélectionnable
  pour ce mode (blocage ou avertissement explicite).
- Les templates tiers ne doivent jamais appeler l'API directement ; le host
  reste la seule frontière.

L'extension du contrat est **additive** : les templates existants continuent de
fonctionner en `contact`.

### 8. Interface et API

- Formulaire de lien standard :
  - **Identification** : `Nom et contact` (actif), `Anonyme` (actif),
    `OTP email` et `Utilisateur interne` (désactivés/« bientôt »).
- Formulaire de lien spécifique :
  - **Prospect lié** en lecture seule ; pas de choix anonyme.
- Le serveur résout le mode depuis le token ; aucun `identificationMode` client
  n'est accepté.
- Les rate limits des liens anonymes sont basés sur IP + lien, pas sur un email.
- Le honeypot et les protections anti-spam existantes restent actifs.

### 9. Confidentialité et conservation

- `identification_mode` ne décide pas de la conservation.
- `anonymous + persisted` reste soumis à la politique et au consentement prévus
  par ADR-0018 lorsque la conservation est active.
- `anonymous + ephemeral` ne stocke pas la conversation ; les messages restent
  toutefois traités par le fournisseur IA et peuvent apparaître dans les logs
  techniques.
- Un lien persisté sans politique de confidentialité doit être refusé.

## Conséquences

### Positives

- Un paramètre explicite et lisible, indépendant de la confidentialité.
- Les liens existants ne changent pas (`contact` par défaut).
- Le mode anonyme permet une démo ou un chat sans collecte d'identité.
- Les modes OTP et interne peuvent être ajoutés sans refonte du modèle.
- Le host centralise l'identification pour tous les templates.

### Négatives / risques

- En anonyme, aucune qualification nominative, aucune relance, aucune reprise.
- Les conversations anonymes persistées apparaissent dans le dashboard sans
  prospect ; il faut prévoir leur affichage et leur purge.
- Le mode anonyme peut augmenter le spam et l'usage abusif ; le rate limiting
  par IP devient essentiel.
- Les templates tiers doivent être mis à jour pour déclarer `anonymous`.
- « Anonyme » ne doit pas être présenté comme une garantie d'anonymat juridique.

## Alternatives écartées

- **Utiliser `type` comme mode d'identification** : écarté, car `type` porte
  déjà la présence ou l'absence de prospect et le contexte du prompt.
- **Déduire `anonymous` d'un email vide** : écarté, trop implicite et fragile.
- **Forcer `anonymous` à être éphémère** : écarté, les deux préoccupations sont
  indépendantes.
- **Laisser chaque template gérer l'identification** : écarté, duplication,
  incohérence et risque de contournement du host.

## Plan de mise en œuvre

1. Migration : `identification_mode` sur `chat_links`, défaut `contact`.
2. Domaine/API : résolution du mode depuis le lien ; validation des valeurs
   actives (`contact`, `anonymous`).
3. Parcours standard :
   - `contact` : `ContactGate` actuel ;
   - `anonymous` : démarrage direct, création au premier message si persisté.
4. Dashboard : libellé « Anonyme » et absence de prospect.
5. Templates : `identificationMode` dans le contexte, capability
   `identificationModes`, adaptation de l'Immersive.
6. Tests : contact inchangé, anonyme sans prospect, anonyme sans reprise,
   spécifique inchangé, absence de fiche nominative.
7. OTP et interne : ADR et implémentation ultérieures.

## Liens

- ADR-0007 (liens spécifique/standard)
- ADR-0018 (confidentialité et consentement)
- ADR-0019 (templates visuels)
- ADR-0024 (SDK JavaScript des templates)
- ADR à venir : mode de conservation `persisted` / `ephemeral`
