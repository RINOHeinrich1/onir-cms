# @onirtech/template-sdk

SDK TypeScript des **templates visuels ONIRTECH** (contrat `onirtech.template-host.v1`,
ADR-0024). Le SDK est **embarqué dans le bundle du template** : l'hôte ne sert aucun
runtime partagé (les templates sont isolés).

> **Statut — 0.1.0 implémenté, publication npm à venir.** Le paquet n'est pas encore
> publié sur npm : l'activation du scope `@onirtech` et le secret CI `NPM_TOKEN` sont
> des prérequis humains. En attendant, consommez le paquet depuis le dépôt
> (`packages/template-sdk`) et le générateur via
> `node template-kit/bin/create-onirtech-template.mjs`. Les commandes `npm install
> @onirtech/template-sdk` et `npx create-onirtech-template` ci-dessous sont la cible
> **après publication**.

## Installation

```bash
npm install @onirtech/template-sdk
```

`react`, `react-dom`, `vue` et `vite` sont des **peer dependencies optionnelles** :
installez uniquement celles de votre stack.

## Sous-chemins

| Sous-chemin | Exports | Stack |
| --- | --- | --- |
| `@onirtech/template-sdk` | `defineTemplate`, `h`, `param`, `hasCapability`, `defineManifest`, `TEMPLATE_HOST_PROTOCOL`, `CONTRACT_VERSION`, types | vanilla / TS |
| `@onirtech/template-sdk/react` | `defineReactTemplate`, `useTemplate`, types | React |
| `@onirtech/template-sdk/vue` | `defineVueTemplate`, `useTemplate`, types | Vue |
| `@onirtech/template-sdk/testing` | `createMockContext`, `mountTemplate` | tests |
| `@onirtech/template-sdk/vite` | `defineTemplateConfig` | React / Vue / TS |

## Démarrage rapide — vanilla (aucun build)

```js
// src/index.js
import { defineTemplate, h, param } from "@onirtech/template-sdk";
import { CSS } from "./styles.js"; // export const CSS = `...`

defineTemplate(
  "onirtech-template-aurora",
  (ctx) =>
    h(
      "section",
      {},
      h("h2", { text: param(ctx, "titre", "Discutons de votre projet") }),
      h("p", { text: "Bonjour " + ctx.brand.name }),
    ),
  { css: CSS },
);
```

`h(tag, props, ...children)` crée un nœud (`text` = texte, `onclick` = écouteur, le
reste = attributs) ; il n'injecte jamais de HTML depuis le contexte. En vanilla, les
styles sont une **chaîne** dans `src/styles.js` (constante `CSS`) : le stack n'a
aucun bundler pour importer un `.css` brut.

## Démarrage rapide — React

```jsx
// src/index.jsx
import css from "./styles.css?inline";
import { defineReactTemplate, useTemplate } from "@onirtech/template-sdk/react";
import { Aurora } from "./Aurora.jsx";

defineReactTemplate("onirtech-template-aurora", Aurora, { css });
```

```jsx
// src/Aurora.jsx
import { useTemplate } from "@onirtech/template-sdk/react";

export function Aurora() {
  const { phase, messages, params, actions } = useTemplate();
  // phase: "identity" | "chat" ; messages, params, capabilities, actions
}
```

`useTemplate()` renvoie `ctx`, `phase`, `messages`, `params`, `capabilities` et
`actions`, avec re-render à chaque nouvelle assignation de `onirtechContext`.

## Démarrage rapide — Vue

```js
// src/index.js
import css from "./styles.css?inline";
import { defineVueTemplate } from "@onirtech/template-sdk/vue";
import Aurora from "./Aurora.vue";

defineVueTemplate("onirtech-template-aurora", Aurora, { css });
```

```vue
<script setup>
import { useTemplate } from "@onirtech/template-sdk/vue";
const { phase, messages, params, actions } = useTemplate();
</script>
```

## Pièces jointes (ADR-0034)

Déclarez les capacités `attachments` et `modelForm`, puis rendez un champ fichier par
information à collecter :

```jsx
const fileFields = (ctx.resources.modelForm ?? []).filter((f) => f.type === "file");

<input
  type="file"
  accept={champ.accept?.join(",")}
  onChange={(event) => {
    const file = event.target.files?.[0];
    if (file) void actions.attachFile(champ.name, file);
  }}
/>;

// Les pièces en attente sont dans ctx.state.pendingAttachments.
// sendMessage("") accepte un envoi composé uniquement de fichiers.
```

L’hôte valide le format réel, la taille et le nombre, stocke le fichier et le
rattache au message. Aucun OCR ni aucune analyse IA n’est effectué en v1.

## Configuration Vite

```ts
// vite.config.ts
import react from "@vitejs/plugin-react";
import { defineTemplateConfig } from "@onirtech/template-sdk/vite";

export default defineTemplateConfig({
  entry: "src/index.ts",
  element: "onirtech-template-aurora",
  manifest: "src/manifest.ts",
  plugins: [react()], // option additive : @vitejs/plugin-react / @vitejs/plugin-vue
});
```

`defineTemplateConfig` impose un bundle ESM unique, `cssCodeSplit: false`, des assets
inlinés et `target: es2022`, et émet `onirtech.template.json` depuis `manifest.ts`.
React/Vue passent leurs plugins de compilation via l'option **additive** `plugins` ;
les plugins du SDK restent toujours appliqués.

## Manifeste et variables

`defineManifest` produit l'objet `onirtech.template.json` (défauts injectés,
objet **gelé**). Les variables scalaires (`params`, ADR-0023) arrivent résolues
dans `ctx.params` :

```ts
import { defineManifest } from "@onirtech/template-sdk";

export default defineManifest({
  id: "aurora",
  name: "Aurora",
  version: "1.2.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: { mode: "web-component", entry: "./index.js", element: "onirtech-template-aurora" },
  capabilities: ["messages", "theme"],
  params: [{ key: "titre", label: "Titre", type: "string", default: "Discutons" }],
});
```

## Ressources de données (ADR-0026)

Un template peut déclarer des **ressources structurées** (bibliothèque, galerie,
plan…) et les charger à l'exécution. Le cœur ne connaît aucun nom métier : il
valide les données contre le **contrat** déclaré et exécute la source liée par
l'exploitant (SQL en v1).

### Déclarer un contrat

```ts
export default defineManifest({
  // …
  capabilities: ["messages", "data"],
  data: {
    contracts: [
      {
        key: "library",
        label: "Bibliothèque",
        description: "Livres et pages",
        version: 1,
        loading: "lazy", // ou "eager" (≤ 64 Ko, injecté dans ctx.resources.data)
        inputs: [{ key: "book_id", type: "string", required: false }],
        schema: {
          type: "object",
          required: ["books"],
          properties: {
            books: {
              type: "array",
              maxItems: 50,
              items: {
                type: "object",
                required: ["id", "title", "pages"],
                properties: {
                  id: { type: "string", maxLength: 64 },
                  title: { type: "string", maxLength: 120 },
                  pages: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["index", "text"],
                      properties: {
                        index: { type: "integer", minimum: 0 },
                        text: { type: "string", maxLength: 2000 },
                        image: { type: "string", format: "uri" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    ],
  },
});
```

- Schéma = **sous-ensemble strict de JSON Schema 2020-12** : `type`, `properties`,
  `required`, `items`, `enum`, `const`, `format`, `minLength`/`maxLength`,
  `minimum`/`maximum`, `minItems`/`maxItems`, `additionalProperties`. Tout autre
  mot-clé est refusé à l'import (`$ref`, `pattern`, `oneOf`, `anyOf`, `not`…).
- Objets **fermés** (`additionalProperties: false` par défaut).
- La capacité `data` exige le mode **web-component** (pas d'iframe).
- Limites : 20 contrats, bloc ≤ 64 Ko, 10 entrées, profondeur 12.

### Charger une ressource

```ts
const result = await ctx.data.load<{ books: Book[] }>("library", {
  inputs: { book_id: selectedId },
});

if (result.status === "ok") {
  render(result.data.books);
  // result.meta = { cached, generatedAt, revision, truncated }
} else {
  // DATA_UNBOUND | DATA_DISABLED | DATA_INPUT_INVALID | DATA_TIMEOUT |
  // DATA_LIMIT | DATA_UNAUTHORIZED | DATA_CONTRACT_INVALID | DATA_PROVIDER_ERROR
  showFallback(result.code);
}
```

- `ctx.data` est **injecté par l'hôte** avec les actions ; le template ne voit
  jamais SQL, base ou credentials.
- `inputs` : uniquement les clés **déclarées** dans le contrat (≤ 10). Elles sont
  validées côté hôte et transmises en paramètres SQL par l'exploitant.
- **Eager** : `ctx.resources.data[key]` contient l'instantané au chargement
  (absent si le contrat n'est pas lié).
- Erreur typée : ne supposez jamais une ressource disponible, prévoyez un repli.
- Les ressources **non liées** renvoient `DATA_UNBOUND` — jamais de requête
  implicite.

### Tester

`createMockContext` fournit un `ctx.data` par défaut (`DATA_UNBOUND`) ; surchargez-le :

```ts
import { createMockContext } from "@onirtech/template-sdk/testing";

const ctx = createMockContext({
  data: {
    load: async (key) =>
      key === "library"
        ? { status: "ok", data: { books: [] }, meta: { cached: false, generatedAt: new Date().toISOString(), revision: 1, truncated: false } }
        : { status: "error", code: "DATA_UNBOUND", message: "inconnue" },
  },
});
```

En développement hors ligne, le **harness** injecte un `ctx.data` mocké depuis
`harness-data.json` (à la racine du template) :

```json
{
  "library": { "books": [{ "id": "b1", "title": "Exemple", "pages": [{ "index": 0, "text": "Bonjour" }] }] }
}
```

## Tester

```js
import { expect, it } from "vitest";
import { createMockContext, mountTemplate } from "@onirtech/template-sdk/testing";
import "../src/index.js";

it("affiche le titre du paramètre", () => {
  const ctx = createMockContext({ params: { titre: "Album souvenirs" } });
  const { el } = mountTemplate("onirtech-template-aurora", ctx);
  expect(el.shadowRoot.textContent).toContain("Album souvenirs");
});
```

`createMockContext(overrides?)` produit un contexte complet et conforme ;
`mountTemplate(element, ctx)` monte le **vrai** élément et expose `update(ctx)` /
`unmount()`.

## Peer dependencies

| Paquet | Version | Requis pour |
| --- | --- | --- |
| `react` / `react-dom` | `^18 \|\| ^19` | `./react` |
| `vue` | `^3.4` | `./vue` |
| `vite` | `>=6` | `./vite` |

Toutes sont **optionnelles** : le cœur vanilla n'a **zéro dépendance runtime**.

## Budget de taille

Le cœur (`.`, hors adaptateurs) est plafonné à **5 Ko gzip**, contrôlé en CI par
`npm run size`. React et Vue ajoutent leur propre poids dans le bundle du template.

## Références

- [ADR-0024 — SDK JavaScript des templates visuels](../../docs/adr/0024-sdk-javascript-templates.md)
- Page publique du workflow : `/documentation/sdk`
- Norme du contrat hôte : [`docs/templates-visuels/norme-v1.md`](../../docs/templates-visuels/norme-v1.md)

## Licence

MIT.

## Fallback heuristique (capacité `fallback`)

Déclarez `fallback` dans le manifeste pour rendre vous-même le menu de secours :

```ts
const { ctx, actions } = useTemplate();
const fallback = ctx.state.fallback;

if (fallback) {
  return h(
    "section",
    null,
    h("p", null, fallback.intro),
    ...fallback.questions.map((question) =>
      h("button", { onClick: () => actions.selectFallback(question.id) }, question.label),
    ),
    fallback.showCollectionForm
      ? h("button", { onClick: () => actions.openCollectionForm() }, "Remplir le formulaire")
      : null,
  );
}
```

- `ctx.state.fallback` est absent hors panne IA.
- `actions.selectFallback(id)` valide l’ID côté hôte, ajoute la question comme message utilisateur puis la réponse comme message assistant.
- `actions.openCollectionForm()` ferme le menu ; le template affiche ensuite son propre formulaire existant.
- `actions.submitCollection(values)` enregistre les champs du formulaire dans la fiche de collecte.
- Sans la capacité `fallback`, l’hôte conserve son menu générique.

