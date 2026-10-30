# Starter-kit — Templates visuels Onirtech

Développez, testez et empaquetez un **template visuel** (interface publique du chat
et du formulaire de prospection) conforme à la norme **`onirtech.template-host.v1`**.

> Norme de référence : [`../docs/templates-visuels/norme-v1.md`](../docs/templates-visuels/norme-v1.md)
> Décision d'architecture : [ADR-0019](../docs/adr/0019-templates-visuels-package-ui.md)

## Garantie : aucune connexion à la prod

Le kit fournit un **hôte simulé** (harness) qui implémente le **côté hôte** du contrat
avec des **données MOCK**. Le développement est **100 % hors-ligne** : aucune base,
aucune API, aucun secret, aucun lien. **Ne pointez jamais** un environnement de dev
vers la prod ; l'intégration réelle passe par l'**admin** (panneau « Templates visuels »).

## Prérequis

- Node.js ≥ 20.

## Cycle de développement

```bash
# 0. dépendances du kit (fflate) — une fois
npm install

# 1. créer un template à partir de la référence (--stack vanilla|react|vue)
node bin/create-onirtech-template.mjs mon-template --stack vanilla
cd mon-template

# 2. développer en local (harness MOCK + live-reload)
node ../harness/host.mjs --dir .          # → http://localhost:4500

# 3. valider (manifeste + Custom Element + intégrité SRI)
node ../bin/onirtech-template.mjs validate .

# 4. empaqueter → release/<id>-<version>.onirtech-template (+ release.json)
node ../bin/onirtech-template.mjs pack .
```

Puis **importez** l'archive dans le panneau (onglet **Templates visuels**) et
**rattachez-la** à un lien de chat.

## SDK des templates (`@onirtech/template-sdk`)

Le kit embarque le générateur **multi-stack** `create-onirtech-template` : il produit
un projet complet et auto-suffisant, avec le nom d'élément cohérent entre le
manifeste, l'entrée et les tests.

```bash
# depuis le dépôt (le générateur n'est pas encore un paquet npm publié)
node bin/create-onirtech-template.mjs aurora --stack react    # ou vue | vanilla

cd aurora
npm install
npm run dev        # harness MOCK + build watch (React/Vue/TS)
npm test           # tests unitaires (createMockContext, mountTemplate)
npm run build      # React / Vue / TypeScript uniquement
npm run validate   # manifeste + entrée + intégrité (SRI)
npm run pack       # release/<id>-<version>.onirtech-template
```

| Stack | Build | Entrée du manifeste | Styles |
| --- | --- | --- | --- |
| `vanilla` | aucun | `src/index.js` | `src/styles.js` (constante `CSS`) |
| `react` | Vite | `dist/index.js` | `styles.css?inline` |
| `vue` | Vite | `dist/index.js` | `styles.css?inline` |

Le SDK 0.1.0 est **implémenté** ; sa publication npm attend l'activation du scope
`@onirtech` et du secret `NPM_TOKEN`. Après publication, le générateur s'exécutera via
`npx create-onirtech-template` et le paquet s'installera avec
`npm install @onirtech/template-sdk`. En attendant, les projets générés référencent
`@onirtech/template-sdk` en `^0.1.0` et se consomment depuis le dépôt.

- API et quick starts : [`../packages/template-sdk/README.md`](../packages/template-sdk/README.md)
- Décision : [ADR-0024](../docs/adr/0024-sdk-javascript-templates.md)
- Workflow public : `/documentation/sdk`

## Structure d'un template

```text
mon-template/
├── onirtech.template.json   # manifeste (norme v1)
├── src/index.js             # Web Component enregistrant l'élément déclaré
└── release/                 # produit par `pack` (archive + release.json)
```

## Contrat (résumé)

Le template reçoit un **contexte gelé** `OnirtechTemplateContext` (via
`element.onirtechContext`) et **appelle des actions** :

- **lit** : `link`, `brand`, `theme`, `state` (phase `identity`/`chat`, messages,
  statut, `fallback`), `resources` (`media`, `modelForm`) — filtrés par
  `capabilities`.
- **actions** : `submitIdentity`, `sendMessage`, `finish`, `selectFallback(id)`,
  `openCollectionForm`, `request(capability)`, `openMedia`, `resize`.

Le template **n'accède jamais** à la base ni à l'API : c'est l'hôte qui exécute.
Le transport change (Web Component pour `official`/`verified`, iframe sandboxée
pour `community`) mais **le contrat logique est identique**.

## Template de référence

`template/` est un template **complet et fonctionnel** (formulaire d'identification,
chat, affichage de médias) : servez-vous en comme point de départ.
