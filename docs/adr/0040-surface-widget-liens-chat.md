# 0040. Surface widget des liens de chat et intégration externe

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0007 (liens spécifique/standard), ADR-0018
  (confidentialité), ADR-0019 (templates visuels), ADR-0024 (SDK) et ADR-0033
  (modes d'identification). Modifie l'invariant « anonyme sans fiche » pour la
  seule surface widget.

## Contexte

Le chat public existe aujourd'hui sous la forme d'une page dédiée
`/l/<token>`. Le produit veut pouvoir l'intégrer dans un site ou une plateforme
existante par un **code copier/coller**, avec un chatbot flottant en bas à
droite ou à gauche.

Contraintes :

- le widget est **fourni par le template visuel** : le développeur garde la
  main sur l'icône, le launcher, le panneau, les animations et le style ;
- le code d'intégration copié doit rester **simple et stable** pour le client ;
- le widget ne doit **pas exécuter de code template dans la page hôte** ;
- le widget ne doit pas dépendre de CORS, de cookies tiers ni du DOM du site
  hôte ;
- le widget n'a **ni formulaire de contact ni politique de confidentialité** ;
- il doit néanmoins produire un **lead** (prospect + fiche) ;
- les conversations sont **persistées** comme pour les liens de chat normaux ;
- le cœur et les templates doivent rester **découplés**.

Le point 4 initialement proposé (« un widget standard ne produit pas de lead »)
est corrigé : le widget doit produire une fiche et un prospect, mais sans
formulaire et avec un contact optionnel.

## Décision

### 1. Widget = surface de diffusion, pas un nouveau type de lien

La surface est une propriété du lien, distincte du type de lien et du transport
du template :

```text
chat_links.surface = 'page' | 'widget'   -- défaut 'page'
```

- `type` (`specifique` / `standard`) reste la logique métier ;
- `identification_mode` reste la logique d'identification ;
- `ui.mode` (`web-component` / `iframe`) reste le transport du template ;
- `surface` décide seulement si le lien est servi comme page ou comme widget.

Un lien existant reste `page` par défaut. Aucun changement rétroactif.

### 2. Le snippet est généré par le cœur

Le client copie un snippet court et stable :

```html
<script
  async
  src="https://cms.example/widget/v1.js"
  data-onir-token="<jeton-du-lien>"
  data-onir-position="bottom-right"
></script>
```

- Le snippet ne contient **ni identifiant ni version de template** : le lien
  porte déjà le template figé.
- Le loader `widget/v1.js` est un composant du cœur, versionné et immuable.
- Le développeur du template reste responsable du **bundle widget** (entry,
  launcher, panneau, styles, comportement) ; il n'écrit pas le bootstrap
  d'intégration.
- Un snippet écrit par un template serait du code arbitraire exécuté chez le
  client, avec gestion du token, de la rotation et de la version par chaque
  template : cette option est écartée.

Le snippet peut être régénéré depuis le panneau. Une rotation ou révocation du
token invalide l'ancien snippet comme elle invalide l'ancienne URL.

### 3. Le widget est une iframe first-party du cœur

Le loader crée une iframe qui pointe vers une route du cœur :

```text
Site client
  └── iframe https://cms.example/embed/<token>
        └── WidgetHost (surface = widget)
              └── TemplateHost
                    └── ui.widget.entry du template
```

- L'iframe est servie par le CMS, pas par le site hôte.
- Le code du template ne s'exécute jamais directement dans la page hôte.
- Les appels API se font en **same-origin** dans l'iframe : aucun CORS à ouvrir.
- Aucun cookie tiers n'est nécessaire.
- Le site hôte ne peut pas lire le DOM, les messages ni les styles du chat.
- Le CSS du site hôte ne fuit pas dans le widget.

Le template community conserve son propre transport iframe à l'intérieur de
cette iframe cœur ; le contrat logique reste identique.

### 4. Le template garde la main sur le style et le launcher

Le template fournit le rendu complet du widget :

- icône et bouton flottant ;
- panneau ;
- couleurs, typographie, ombre, border-radius ;
- animations ;
- expérience mobile ;
- accessibilité.

Le cœur ne dessine pas le launcher et n'injecte aucun CSS dans l'iframe. Il
gère uniquement le conteneur :

- position ;
- dimensions ;
- `z-index` ;
- bordure nulle ;
- fond transparent ;
- transitions de taille.

Le template déclare dans son manifeste :

```json
{
  "ui": {
    "widget": {
      "entry": "./widget.js",
      "element": "onirtech-widget-acme",
      "integrity": "sha256-...",
      "display": {
        "defaultPosition": "bottom-right",
        "allowedPositions": ["bottom-right", "bottom-left"],
        "closedSize": { "width": 64, "height": 64 },
        "openSize": { "width": 420, "height": 680 },
        "maxSize": { "width": 520, "height": 760 }
      }
    }
  }
}
```

- `ui.widget` est optionnel ; son absence signifie que le template ne supporte
  pas le widget.
- Le template définit la position par défaut et les positions autorisées.
- L'exploitant peut choisir une position autorisée dans le panneau ; le cœur
  applique ce choix.
- Le template peut demander une taille d'ouverture ; le cœur la borne au
  viewport et aux limites déclarées.
- Le cœur ne choisit pas la position à la place du template.

### 5. Contrat template additif

Le contexte expose la surface :

```ts
surface: "page" | "widget";
```

Deux actions sont ajoutées :

```ts
| { action: "openWidget"; payload: { width?: number; height?: number } }
| { action: "closeWidget" }
```

Le SDK expose les helpers correspondants. Le contrat reste
`onirtech.template-host.v1` : les ajouts sont optionnels et les templates page
existants continuent de fonctionner.

En surface widget :

- le template démarre en phase `chat` ;
- `submitIdentity` est refusé par l'hôte ;
- la politique de confidentialité n'est pas fournie ;
- le template ne doit afficher ni formulaire d'identité ni consentement.

### 6. Invariants du lien widget

Un lien ne peut être `surface = 'widget'` que si :

- il possède un template visuel ;
- ce template déclare `ui.widget` ;
- `confidentialite_id IS NULL` ;
- `type = 'specifique'` **ou** `identification_mode = 'anonymous'`.

Conséquences :

- `standard + widget` est forcément anonyme et sans formulaire ;
- `standard + widget + contact` est refusé ;
- `specifique + widget` est autorisé : le prospect est déjà connu et aucun
  formulaire n'est affiché ;
- `widget + politique de confidentialité` est refusé.

Ces règles sont appliquées dans le domaine, l'application, l'API et la base
(`CHECK`), pas seulement dans l'interface.

### 7. Lead, prospect et fiche en widget

Contrairement à ADR-0033, une conversation widget standard anonyme **génère
une fiche et un prospect**.

- **Un prospect par conversation widget.**
- Le prospect est créé au moment de la génération de la fiche, pas à la simple
  ouverture du widget.
- Pour un lien `specifique`, on utilise le prospect déjà rattaché.
- Pour un lien `standard`, on crée un prospect dédié à la conversation avec le
  nom :

```text
Prospect issu du widget : {libellé du lien de chat}
```

- **L'email n'est pas obligatoire.**
- L'IA peut demander naturellement le contact dans la conversation ; ce n'est
  pas un formulaire.
- Si un email ou un téléphone est fourni, on enrichit le prospect et la fiche.
- Sinon, la fiche est quand même générée et le prospect est marqué
  **« contact non fourni »**.
- Aucune déduplication par email : un prospect par conversation, même si le
  même email revient.
- La fiche est générée même sans email ; elle reste un lead non contactable
  tant qu'aucun contact exploitable n'est fourni.

La table `prospects` conserve `email NOT NULL` : l'absence d'email est stockée
comme chaîne vide, sans fabriquer de fausse adresse. L'interface expose un
indicateur dérivé `contactMissing`.

### 8. Persistance et confidentialité

- Les conversations widget sont **persistées** comme les conversations de lien
  normales.
- Il n'y a pas de mode éphémère dans cette décision.
- Le widget n'affiche pas de politique de confidentialité ; le lien widget ne
  peut pas en porter.
- Le fait de ne pas afficher de politique ne supprime pas le traitement : les
  messages, l'email éventuel et les logs restent des données traitées.

La politique publique et les textes par défaut doivent indiquer que :

- ONIR CMS est un logiciel **open source MIT** ;
- chaque instance est installée et exploitée par son propriétaire ;
- le propriétaire/exploitant de l'instance est responsable des traitements,
  des finalités, des durées de conservation et de la conformité ;
- l'éditeur du logiciel ne collecte pas les données des instances ;
- l'intégrateur qui copie le widget sur un site tiers est responsable de cette
  intégration, notamment de l'information des visiteurs.

La modale « Code widget » affiche un avertissement explicite :

> En copiant ce code et en l'intégrant sur un site tiers, vous assumez
> l'entière responsabilité de cette intégration, notamment en matière de
> confidentialité et de protection des données. ONIR CMS est un logiciel open
> source MIT : chaque propriétaire d'instance est responsable de ses propres
> traitements.

Cette clause est informative ; elle ne remplace pas une validation juridique.

### 9. Sécurité et exploitation

- `/embed/<token>` : `frame-ancestors *` par défaut, `Referrer-Policy:
  no-referrer`, `Cache-Control: no-store`, pas de `X-Frame-Options`.
- `/widget/v1.js` : versionné, cache long et immuable.
- Aucun CORS global n'est ajouté.
- Les messages `openWidget` / `closeWidget` sont validés par source et bornés.
- Le token est public comme dans l'URL de chat ; sa rotation et sa révocation
  restent les mécanismes de contrôle.
- Les rate limits et protections anti-spam existants s'appliquent.
- Une allowlist d'origines pourra être ajoutée pour les liens spécifiques
  sensibles ; elle n'est pas nécessaire au MVP.
- Le site hôte doit autoriser le loader et l'iframe dans sa CSP
  (`script-src` et `frame-src` vers le domaine CMS).

### 10. Modèle de données et API

Migration :

```text
chat_links.surface text NOT NULL DEFAULT 'page'
  CHECK (surface IN ('page', 'widget'))

chat_links.widget_config jsonb NOT NULL DEFAULT '{}'
```

`widget_config` porte uniquement les choix génériques d'intégration, par
exemple `{ "position": "bottom-left" }`, validés contre les positions
autorisées du template. Aucune configuration spécifique à un template n'entre
dans le cœur.

Routes et cas d'usage :

- `GET /widget/v1.js` : loader du cœur.
- `GET /embed/<token>` : page widget, sans header dashboard.
- `GET /api/links/<id>/widget-code` : snippet copiable, protégé par les droits
  du lien.
- `createChatLink` / `updateChatLink` : validation des invariants widget.
- `loadWidgetTemplateSpec` : résolution de `ui.widget`.
- `buildWidgetSnippet` : snippet à partir du token et de la position.
- `finishConversation` : autorise et construit la fiche widget.

### 11. Interface

- Formulaire de création/édition : champ `Diffusion` (`Page` / `Widget`).
- En widget : identification anonyme forcée pour un lien standard,
  confidentialité forcée à `Aucune`, templates filtrés sur `ui.widget`.
- Après création : modale avec URL, snippet, avertissement de responsabilité,
  bouton de copie et aperçu.
- Table des liens : badge `Widget` et action « Code d'intégration ».
- Dashboard prospect : nom synthétique, lien d'origine et badge
  `contact non fourni` si nécessaire.

## Conséquences

### Positives

- Intégration copier/coller sans exposer le code du template au site hôte.
- Isolation forte : pas de CORS, pas de cookies tiers, pas de CSS partagé.
- Le développeur garde le contrôle du design, de l'icône et du launcher.
- Le cœur garde le contrôle du token, de la session, des données et de la
  sécurité.
- Le widget produit une fiche et un prospect par conversation.
- Les conversations restent exploitables dans le dashboard.
- Aucun changement pour les liens page existants.

### Négatives / risques

- Une iframe supplémentaire et un pont de redimensionnement.
- Le template doit fournir un bundle widget distinct et respecter une taille
  fermée.
- Un lead sans contact est peu exploitable ; l'IA doit demander le contact dans
  la conversation pour améliorer la qualité.
- Un prospect par conversation peut créer des doublons si le même visiteur
  revient ; c'est le comportement explicitement retenu.
- La persistance sans consentement dans le widget crée un risque juridique qui
  doit être porté par l'exploitant et documenté.
- La clause de responsabilité est informative et ne transfère pas
  automatiquement une responsabilité légale.
- Le token est public dans le snippet ; sa rotation invalide les intégrations.
- Les sites avec CSP stricte doivent autoriser le domaine CMS.

## Alternatives écartées

1. **Snippet fourni par le template** : code arbitraire dans la page hôte,
   couplage token/version/CSP, rotation impossible à centraliser.
2. **Web Component directement dans la page hôte** : CORS, cookies, fuite CSS,
   accès au DOM, surface d'attaque trop grande.
3. **Nouveau type de lien `widget`** : mélange métier et diffusion, explosion
   des combinaisons.
4. **Masquer le formulaire et le consentement en CSS** : contournable ; les
   invariants doivent être serveur.
5. **Widget sans fiche ni prospect** : ne répond pas au besoin de lead.
6. **Widget éphémère** : écarté pour cette décision, les conversations sont
   persistées.
7. **Launcher dessiné par le cœur** : moins personnalisable et moins cohérent
   avec le template.

## Plan de mise en œuvre

1. Domaine + migration : `surface`, `widget_config`, invariants.
2. Contrat template : `ui.widget`, `surface`, `openWidget` / `closeWidget`.
3. Loader `widget/v1.js` + route `/embed/<token>` + en-têtes.
4. Résolution du template widget et pont de taille.
5. Lead/prospect/fiche widget et contact optionnel.
6. Panneau : diffusion, snippet, avertissement, aperçu.
7. SDK, norme des templates et template de démonstration.
8. Politique de confidentialité et textes par défaut.
9. Tests unitaires, intégration et E2E sur une page hôte externe.

## Liens

- ADR-0007 (liens spécifique/standard)
- ADR-0018 (confidentialité et consentement)
- ADR-0019 (templates visuels)
- ADR-0024 (SDK JavaScript des templates)
- ADR-0033 (modes d'identification)
