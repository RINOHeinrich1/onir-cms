---
name: onirtech-template-sdk
description: Use when creating, modifying, testing, building, validating, or packaging an Onirtech visual template (React, Vue, or vanilla HTML/CSS/JS) with @onirtech/template-sdk. Covers the host contract, capabilities, params, zones d’inspection (ADR-0105), actions, the mock harness, build, validation, packing, and known pitfalls.
---

# Onirtech template SDK

## Quand utiliser ce skill

- Créer un template visuel Onirtech (React, Vue ou HTML/CSS/JS).
- Modifier un template existant : UI, paramètres, capacités, actions.
- Tester en local (harness), construire (`vite`), valider et empaqueter.
- Diagnostiquer un template qui ne s'affiche pas ou dont les données sont vides.

Ne l'utilise **pas** pour modifier le cœur du dashboard, l'API ou le contrat hôte :
le template est une interface UI-only.

## Règles non négociables

1. Le template **ne fait jamais de requête réseau**. Il lit le contexte et appelle
   `actions`. Jamais `fetch`, jamais la base, jamais le LLM.
2. N'invente **aucune** API : seules les fonctions exportées par
   `@onirtech/template-sdk` existent (voir plus bas).
3. Le **nom de l'élément** passé à `defineTemplate` / `defineReactTemplate` /
   `defineVueTemplate` doit être **identique** à `ui.element` du manifeste.
4. Ne modifie **jamais** `onirtech.template.json` à la main : il est généré par le
   build (React/Vue) ou par le générateur (vanilla).
5. Déclare dans `capabilities` chaque donnée utilisée (`messages`, `media`,
   `modelForm`, `theme`, `userState`, `knowledge`).
6. Les `params` sont **publics** : jamais de secret, jamais de token.
7. Pour une mise à jour : incrémente `version` **dans le manifeste**, rebuild,
   revalide, repack, réimporte et sélectionne la nouvelle version sur le lien.
8. Vanilla reste **sans build**. React/Vue/TS passent par Vite.
9. Ne modifie pas `dist/` ni `release/` à la main.
10. Ne déclare pas un succès sans avoir exécuté les vérifications ci-dessous.
11. Chaque entrée de `params[]` doit avoir un `default`. Pour `type: "image"`,
    le défaut doit être `""` ou une URL `http(s)` : jamais `null`, jamais un
    chemin relatif, jamais un champ omis.
12. Une configuration structurée se déclare en `object` ou `array` : jamais dans
    un `string`/`text` contenant du JSON à parser.
13. Toute clé de schéma, à **toute profondeur** (`params[]`, `properties[]`,
    `items.properties[]`…), doit respecter `^[a-z][a-z0-9_]{1,40}$`.

## Modèle mental

```
Template (UI) ──actions──▶ Hôte (harness | dashboard) ──HTTP──▶ API / DB / LLM
      ▲                                                │
      └──────── contexte (state, resources, params) ◀──┘
```

- **Mock** : le harness fabrique un contexte et simule les actions (hors-ligne).
- **Production** : le dashboard construit le contexte réel et exécute les actions
  (session, chat, médias, fin). Le template est identique dans les deux cas.

## Démarrage

```bash
npx @onirtech/create-onirtech-template <id> --stack react   # ou vue | vanilla
cd <id>
npm install
npm run dev      # http://localhost:4500
npm test
npm run build    # React / Vue / TypeScript uniquement
npm run validate
npm run pack     # release/<id>-<version>.onirtech-template
```

Prérequis : Node.js 20.19+ (recommandé 22), npm.

## Structure d'un projet

```
<id>/
├─ src/
│  ├─ index.js          enregistre le Custom Element
│  ├─ Aurora.jsx        UI (React) / Aurora.vue (Vue) / ui.js (vanilla)
│  ├─ styles.css        styles (inlinés) — vanilla : styles.js (constante CSS)
│  └─ manifest.ts       manifeste typé (React/Vue) — vanilla : onirtech.template.json
├─ tests/               Vitest + happy-dom
├─ harness/host.mjs     hôte simulé (mock)
├─ tools/               validate, pack, dev (React/Vue)
├─ vite.config.ts       React/Vue/TS
├─ package.json
└─ onirtech.template.json   généré (React/Vue) / source (vanilla)
```

## Contrat (contexte reçu)

```ts
type TemplateContext = {
  host: { protocol: string; version: number };
  link: { type: "standard" | "specifique"; label: string; userStateEnabled: boolean };
  locale: string;
  brand: { name: string; logoUrl: string | null };
  theme: Record<string, string>;
  capabilities: TemplateCapability[];
  // Valeurs JSON complètes : scalaire, objet ou tableau
  params: Record<string, string | number | boolean | null |
    TemplateParamValue[] | { [key: string]: TemplateParamValue }>;
  consent: { texte: string; lien: string } | null;
  state: {
    phase: "identity" | "chat";
    status: "en_cours" | "finalisee";
    messages: TemplateMessage[];
    typing: boolean;
  };
  resources: {
    media: { photos: TemplateMediaItem[]; liens: TemplateMediaItem[] };
    modelForm: TemplateFormField[] | null;
  };
};
```

`TemplateMessage` : `{ id, role: "user" | "assistant", content, medias, at,
userState?, knowledge? }`.

Capacités et données :

| Capacité | Donnée | Si absente |
| --- | --- | --- |
| `messages` | `state.messages` | liste vide |
| `media` | `resources.media` | `{ photos: [], liens: [] }` |
| `modelForm` | `resources.modelForm` | `null` |
| `theme` | `theme` | objet vide |
| `userState` | `message.userState` | absent (double garde lien) |
| `knowledge` | `message.knowledge` | absent (double garde source) |
| `attachments` | `state.pendingAttachments`, `message.attachments` | absents |
| `fallback` | `state.fallback`, `actions.selectFallback()` | absent |
| `data` | `ctx.data.load(contract)` | contrats `data` indisponibles |

## Identification (`identificationModes`)

Le manifeste peut déclarer les interfaces d'identification que le template sait
rendre :

```json
"identificationModes": ["contact", "anonymous", "otp"]
```

- absent → défaut legacy `["contact", "anonymous"]` ;
- `otp` est optionnel pour un rendu personnalisé : sans déclaration, le host
  affiche `OtpGate` à la place ;
- le template ne fait jamais l'authentification OTP lui-même : il utilise les
  actions du host ;
- le fallback host ne change jamais le mode effectif du lien.

## Médias et photothèque

- `media` expose **uniquement les photos/liens actifs rattachés au chatbot** :
  `chat_link_ids` vide = média global ; sinon l'id du lien doit être présent.
- `resources.media.photos` sert la galerie/catalogue du template. Aucune galerie
  n'est créée automatiquement : le template doit rendre les photos et appeler
  `actions.openMedia(url)`.
- `message.medias` sert aux images jointes à une réponse. L'hôte peut les
  récupérer après coup quand `mediaPending === true` (`POST /api/chat/media`).
- Mode `illustration` : le runtime peut illustrer automatiquement les réponses
  (jusqu'à **5 photos**, plafond `maxResults` 1..5).
- Mode `on_demand` : pas d'attachement automatique ; les photos restent dans
  `resources.media` pour la galerie ou `actions.request("media")`.
- Les URL sont signées/proxifiées (`/api/medias/:id/file`) : ne jamais
  reconstruire un chemin ni coder une URL directe.
- Une photo seulement importée/labellisée dans la photothèque, sans
  rattachement au chatbot ou avec la source Médias désactivée, n'arrive jamais
  dans le contexte.

## API du SDK (0.1.3)

Racine :

```ts
defineTemplate(element, render, options?)
h(tag, props?, ...children)
param(ctx, key, fallback)
hasCapability(ctx, capability)
defineManifest(manifest)
TEMPLATE_HOST_PROTOCOL, CONTRACT_VERSION
```

React (`@onirtech/template-sdk/react`) :

```tsx
defineReactTemplate(element, Component, { css })
const { ctx, phase, messages, params, capabilities, actions } = useTemplate();
```

Vue (`@onirtech/template-sdk/vue`) :

```ts
defineVueTemplate(element, Component, { css })
const { ctx, phase, messages, params, capabilities, actions } = useTemplate();
```

Tests (`@onirtech/template-sdk/testing`) :

```ts
const ctx = createMockContext(overrides?);
const { el, update, unmount } = mountTemplate(element, ctx);
```

Build (`@onirtech/template-sdk/vite`) :

```ts
defineTemplateConfig({ entry, element, manifest?, plugins?, minify?, outDir? })
```

## Paramètres : `default` obligatoire

Chaque paramètre déclaré dans `manifest.params` doit fournir un `default`.
L'import échoue avec `params[N].default : ...` si ce n'est pas le cas.

| Type | `default` valide |
| --- | --- |
| `string`, `text` | chaîne (éventuellement `""`) |
| `number` | nombre fini, dans `min`..`max` si fournis |
| `boolean` | `true` ou `false` |
| `color` | couleur `#rrggbb` |
| `url` | URL `http(s)` absolue |
| `image` | **`""` ou URL `http(s)` absolue** ; jamais `null` ni chemin relatif |
| `select` | l'une des `options[].value` |
| `object`, `array` | valeur structurée complète (voir ci-dessous) |

Exemple correct pour une image optionnelle :

```json
{
  "key": "logo",
  "label": "Logo",
  "description": "Logo affiché dans l'en-tête",
  "type": "image",
  "default": ""
}
```

Erreur exacte si le champ `default` est omis ou vaut `null` :
`params[21].default : défaut attendu : vide ou URL http(s)`.

## Paramètres structurés (`object`, `array`)

Les paramètres ne sont pas limités aux scalaires. `object` et `array` reçoivent
de vraies valeurs JSON imbriquées dans `ctx.params` : ne faites pas
`JSON.parse`.

### Quand utiliser `object` ou `array`

- `object` : réglages à clés fixes et connues (thème, en-tête, coordonnées,
  contenu structuré d'une page). Chaque clé est déclarée dans `properties`.
- `array` : liste répétable d'éléments homogènes (cartes, étapes, liens sociaux),
  avec `items` obligatoire.
- `string` / `text` : texte atomique ou long. Ne jamais y sérialiser du JSON :
  un template ne doit pas faire `JSON.parse(ctx.params.x)`.
- `data.contracts` (ADR-0026) : données runtime ; `params` reste de la
  configuration/design statique.

Un paramètre structuré n'est pas un « JSON libre » : le schéma est fermé et les
valeurs sont validées, normalisées et gelées par l'hôte.

### Nommage récursif des clés

La regex `^[a-z][a-z0-9_]{1,40}$` s'applique à **chaque `key` du schéma**, pas
seulement aux paramètres de premier niveau : `properties[].key`,
`items.properties[].key`, etc. La clé doit commencer par une lettre minuscule,
faire 2 à 41 caractères et ne contenir que minuscules, chiffres et `_`.

Lors d'une conversion d'un ancien JSON vers `object`/`array`, ne recopiez pas
les clés du payload :

- `startPage` → `start_page`
- `pageId` → `page_id`
- `imagePosition` → `image_position`
- `nav-home` → `nav_home` **si c'est une clé de schéma**

Les identifiants et URLs restent des **valeurs** : `{ "id": "nav-home" }` est
valide. Le chemin d'erreur `params[29].properties[0].key` désigne un sous-schéma :
corriger la clé déclarée, pas la valeur par défaut.

```json
{
  "key": "apparence",
  "label": "Apparence",
  "description": "Couleurs et arrondis",
  "type": "object",
  "default": { "accent": "#023777", "rayon": 12 },
  "properties": [
    { "key": "accent", "label": "Accent", "description": "Couleur",
      "type": "color", "default": "#023777" },
    { "key": "rayon", "label": "Rayon", "description": "Arrondi",
      "type": "number", "default": 12, "min": 0, "max": 40 }
  ]
}
```

```json
{
  "key": "etapes",
  "label": "Étapes",
  "description": "Étapes du parcours",
  "type": "array",
  "default": ["Bienvenue"],
  "minItems": 1,
  "maxItems": 20,
  "items": { "type": "string", "default": "", "maxLength": 80 }
}
```

Règles : `default` obligatoire sur chaque nœud ; `properties` pour un objet
(clés non déclarées refusées) ; `items` obligatoire pour un tableau ; bornes
`minItems`/`maxItems` ; profondeur 8, 300 nœuds, 64 paramètres, 64 Kio au total.
Un champ absent prend le `default` du nœud ; un objet/tableau invalide retombe
sur le défaut complet.

## Manifeste

React/Vue — `src/manifest.ts` :

```ts
import { defineManifest } from "@onirtech/template-sdk";

export default defineManifest({
  id: "mon-template",
  name: "Mon Template",
  description: "…",
  version: "1.0.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: {
    mode: "web-component",
    entry: "./dist/index.js",
    element: "onirtech-template-mon-template",
    shadowDom: "open",
  },
  capabilities: ["messages", "media", "theme"],
  params: [
    { key: "titre", label: "Titre", type: "string", default: "Discutons…", maxLength: 80 },
    { key: "logo", label: "Logo", type: "image", default: "" },
  ],
});
```

Vanilla : même contenu en JSON dans `onirtech.template.json`, avec
`schemaVersion`, `kind`, `compatibility`, `network` explicites.

Règles des paramètres : `default` **obligatoire** sur chaque paramètre, types
`string | text | number | boolean | color | url | image | select`, ≤ 64
paramètres, ≤ 64 Ko. Pour `image`, le défaut est `""` ou une URL `http(s)` :
un `default` absent ou `null` est refusé à l'import.

## Patterns par stack

React :

```jsx
import { useTemplate } from "@onirtech/template-sdk/react";

export function Aurora() {
  const { phase, messages, params, actions, state } = useTemplate();
  if (phase === "identity") return <Identity onSubmit={actions.submitIdentity} />;
  return (
    <>
      <h2>{String(params.titre ?? "Discussion")}</h2>
      <ul>{messages.map((m) => <li key={m.id}>{m.content}</li>)}</ul>
      {state.typing ? <p>…</p> : null}
      <button onClick={() => actions.sendMessage("Bonjour")}>Envoyer</button>
    </>
  );
}
```

Vue :

```vue
<script setup>
import { useTemplate } from "@onirtech/template-sdk/vue";
const { phase, messages, params, actions } = useTemplate();
</script>
<template>
  <h2>{{ params.titre }}</h2>
  <button @click="actions.sendMessage('Bonjour')">Envoyer</button>
</template>
```

Vanilla :

```js
import { defineTemplate, h, param, hasCapability } from "@onirtech/template-sdk";

defineTemplate("onirtech-template-mon-template", (ctx) =>
  h("section", {},
    h("h2", { text: param(ctx, "titre", "Discussion") }),
    hasCapability(ctx, "media")
      ? h("p", { text: `${ctx.resources.media.photos.length} photos` })
      : null,
    ...ctx.state.messages.map((m) => h("p", { text: m.content })),
  ),
  { css: ":host { display: block; }" },
);
```

## Actions

| Action | Quand | Effet hôte |
| --- | --- | --- |
| `submitIdentity({ nom, email, contacts?, consentement? })` | phase identité | `POST /api/chat/session`, crée la conversation |
| `sendMessage(texte)` | phase chat | `POST /api/chat`, LLM + RAG, réponse |
| `finish()` | fin | `POST /api/chat/finish`, statut `finalisee` |
| `request(capability)` | à la demande | renvoie une ressource |
| `openMedia(url)` | clic média | nouvel onglet (http(s)) |
| `resize(height)` | iframe | hauteur du cadre |

Règles d'usage :

- `sendMessage` : trim, non vide, ≤ 4000 caractères ; bloquer si `typing`.
- `submitIdentity` : une seule soumission à la fois (pas de déduplication hôte).
- `finish` : une seule fois, masquer le bouton après succès.
- `request` : facultatif, les données sont déjà dans le contexte initial.

## Zones d’inspection (ADR-0105)

Le mode d’inspection V1 ne modifie **pas** le template. Il permet à l’opérateur
de cliquer une zone et de filtrer l’inspecteur du studio sur les paramètres
rattachés à cette zone.

### Déclaration dans le manifeste

Ajouter un bloc `editor` optionnel :

```json
{
  "editor": {
    "version": 1,
    "regions": [
      { "id": "header", "label": "En-tête" },
      { "id": "welcome", "label": "Bienvenue" }
    ],
    "bindings": [
      {
        "param": "chat_title",
        "regions": ["header"],
        "category": "content"
      },
      {
        "param": "primary_color",
        "regions": ["header", "welcome", "composer"],
        "category": "appearance"
      }
    ]
  }
}
```

- `category` : `content`, `appearance` ou `action`.
- Un paramètre présent dans **une** zone est local.
- Un paramètre présent dans **plusieurs** zones est **partagé**.
- Aucun champ `scope` : le statut partagé est déduit de `regions.length > 1`.
- `visibilityParam` peut désigner un booléen pour les zones masquables.

### Marqueurs DOM

Le template doit exposer des zones stables :

```html
<header data-onir-region="header">...</header>
<div data-onir-region="welcome">...</div>
```

Règles :

- `data-onir-region` doit correspondre à un `id` déclaré dans `editor.regions` ;
- placer le marqueur sur un conteneur stable, pas sur un élément recréé à chaque
  frappe ou à chaque message ;
- ne pas utiliser de sélecteur CSS arbitraire dans le manifeste ;
- ne pas mettre de marqueur sur les contenus dynamiques du chat ;
- `data-onir-param` est **réservé à la V2** (édition directe), pas nécessaire en V1.

### Transports

- **Web Component** : le host accède au `shadowRoot` **open**. Un shadow DOM
  `closed` désactive l’inspection.
- **iframe** : le pont d’inspection est fourni par la frame hôte ; les marqueurs
  doivent rester dans le DOM accessible de la frame.

### Versionnement

Toute ajout de zones ou de bindings impose une **nouvelle version** du template.
Ne jamais modifier une version déjà publiée.

## Vérifications obligatoires

```bash
npm install
npm test          # tests verts
npm run build     # React/Vue/TS : dist/index.js + onirtech.template.json
npm run validate  # ✓ <id>@<version> valide (web-component)
npm run pack      # release/<id>-<version>.onirtech-template
```

Contrôles navigateur (`npm run dev`, http://localhost:4500) :

- l'élément se monte, le Shadow DOM contient l'UI ;
- identité → chat ; envoi → `typing` → réponse ;
- `finish` → statut finalisée ;
- aucun `pageerror` (le 404 `favicon.ico` est sans impact).

Contrôles de cohérence :

- `ui.element` == nom du Custom Element ;
- pas de `process.env.NODE_ENV` dans `dist/index.js` (SDK ≥ 0.1.3) ;
- styles via `?inline` (React/Vue) ou `styles.js` (vanilla) ;
- aucune dépendance runtime ajoutée au cœur ;
- `version` du manifeste incrémentée pour toute mise à jour.

## Échecs fréquents et correctifs

| Symptôme | Cause | Correctif |
| --- | --- | --- |
| Écran blanc, `process is not defined` | SDK < 0.1.3 | `npm i @onirtech/template-sdk@latest`, rebuild |
| `transformWithEsbuild` / esbuild | SDK < 0.1.2 | mettre à jour le SDK |
| `Cannot find module 'react'` | dépendances absentes | `npm install` |
| Élément non affiché | `ui.element` ≠ nom enregistré | aligner les deux |
| Styles absents | CSS non inliné | `?inline` / `styles.js` |
| `params[N].default : défaut attendu : vide ou URL http(s)` | `type: "image"` sans `default`, avec `default: null` ou un chemin relatif | mettre `default: ""` ou une URL `http(s)` absolue |
| `params[N].default : défaut attendu : ...` | `default` absent ou du mauvais type | fournir un `default` valide pour le type déclaré |
| `params.x` undefined | paramètre non déclaré | déclarer + `default`, garder un repli |
| `resources.media` vide | capacité absente, média non rattaché au chatbot ou source Médias désactivée | déclarer `media`, rattacher les médias, activer la source |
| Photos visibles en photothèque mais pas dans le chat | mode `on_demand` ou `mediaPending` faux | passer en `illustration` pour illustrer les réponses, ou rendre `resources.media` pour la galerie |
| `ctx.params.x` est une chaîne JSON au lieu d'un objet | type `string`/`text` au lieu de `object`/`array` | déclarer le type structuré + `properties`/`items`, puis retirer `JSON.parse` |
| `params[N].properties[...].key : clé en minuscules...` | clé `camelCase`/`kebab-case` recopiée du JSON, à n'importe quelle profondeur | renommer en `snake_case` (`startPage` → `start_page`) ; garder les identifiants comme valeurs |
| `Invalid hook call` | deux copies de React | supprimer `node_modules`, réinstaller |
| `validate` échoue (SRI) | bundle modifié après build | rebuild puis validate/pack |
| `favicon.ico` 404 | harness sans favicon | ignorer |

## Sortie attendue de l'agent

À la fin d'une tâche, rapporter :

1. fichiers créés/modifiés ;
2. commandes exécutées et résultats exacts ;
3. taille du bundle si pertinent ;
4. écarts ou points restant à arbitrer ;
5. prochaine étape (import, version suivante).

## Références

- Documentation : `/documentation` (index), `/documentation/first-template`,
  `/documentation/sdk`, `/documentation/actions`, `/documentation/host`,
  `/documentation/templates-visuels`.
- ADR-0019 (packages UI-only), ADR-0020 (capacités), ADR-0023 (paramètres),
  ADR-0024 (SDK), ADR-0095 (paramètres structurés `object`/`array`),
  ADR-0105 (curseur d’inspection et zones).
