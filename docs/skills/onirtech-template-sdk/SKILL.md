---
name: onirtech-template-sdk
description: Use when creating, modifying, testing, building, validating, or packaging an Onirtech visual template (React, Vue, or vanilla HTML/CSS/JS) with @onirtech/template-sdk. Covers the host contract, capabilities, params, actions, the mock harness, build, validation, packing, and known pitfalls.
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
  params: Record<string, string | number | boolean>;
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
  ],
});
```

Vanilla : même contenu en JSON dans `onirtech.template.json`, avec
`schemaVersion`, `kind`, `compatibility`, `network` explicites.

Règles des paramètres : `default` **obligatoire**, types `string | text | number |
boolean | color | url | select`, ≤ 40 paramètres, ≤ 16 Ko.

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
| `params.x` undefined | paramètre non déclaré | déclarer + `default`, garder un repli |
| `resources.media` vide | capacité absente / aucun média actif | déclarer `media`, activer les médias |
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
  ADR-0024 (SDK).
