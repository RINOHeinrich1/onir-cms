# 0024. SDK JavaScript des templates visuels (`@onirtech/template-sdk`)

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Décideurs** : équipe projet
- **Référence** : complète ADR-0019 (contrat hôte `onirtech.template-host.v1`) et
  ADR-0023 (variables paramétrables). Porte sur l'**outillage de création**, pas
  sur le protocole : le contrat ne change pas.

## Contexte

Les templates actuels (starter, immersif) sont des **Custom Elements vanilla**.
Chaque développeur doit réécrire le même squelette :

- créer le Shadow DOM ;
- exposer la propriété `onirtechContext` (getter **et** setter) ;
- rendre au montage **et** à chaque réassignation du contexte ;
- injecter les styles dans le shadow root ;
- nettoyer à la destruction.

Ce squelette est répétitif et source de bugs silencieux (oublier le getter,
rendre avant l'arrivée du contexte, laisser des nœuds orphelins). Par ailleurs :

- **aucun support outillé** pour React ou Vue, alors que c'est la demande
  principale ;
- les **types du contrat** ne sont pas distribués : chacun les recopie ;
- le **stack débutant** (HTML/CSS/JS) doit rester sans build.

Objectif : qu'un développeur **React**, **Vue** ou **HTML/CSS/JS** produise un
template conforme **sans connaître les détails du Custom Element**.

## Décision

### 1. Un paquet npm unique

`@onirtech/template-sdk` :

- **TypeScript**, **ESM**, **zéro dépendance runtime** ;
- exports séparés pour le tree-shaking : `.`, `./react`, `./vue`, `./testing`,
  `./vite` ;
- cœur **< 5 Ko gzip** ; `react` / `react-dom` / `vue` restent des
  `peerDependencies` (jamais dans le cœur) ;
- publié sur **npm public** sous le scope `@onirtech` (repli GitHub Packages si
  le scope n'est pas disponible) ;
- **embarqué dans le bundle du template** : l'hôte ne sert pas de runtime
  partagé (les templates sont isolés).

### 2. Transport : Web Component uniquement en v1

Le transport iframe existe pour les templates `community` (code non interne).
Il est **hors périmètre** : inutile pour les templates first-party, et il
imposerait un second modèle de données (`postMessage`).

### 3. Parcours développeur cible

```bash
npx create-onirtech-template mon-template --stack react   # ou vue | vanilla
cd mon-template
npm install
npm run dev      # harness MOCK + build watch (React/Vue/TS)
npm run build    # (React/Vue/TS) → dist/index.js
npm run pack     # archive .onirtech-template
```

Puis import dans le panneau **Templates visuels** et rattachement à un lien.

### 4. Vue d'ensemble de l'API

| Export | Entrée | Rôle | Public |
| --- | --- | --- | --- |
| `defineTemplate` | `.` | squelette Custom Element (vanilla) | tous |
| `h` | `.` | création DOM sans framework | vanilla |
| `param` | `.` | lecture typée d'un paramètre avec repli | tous |
| `hasCapability` | `.` | garde de capacité | tous |
| `defineManifest` | `.` | manifeste typé + émission JSON | tous (TS) |
| `defineReactTemplate` | `./react` | monte un composant React dans l'élément | React |
| `useTemplate` | `./react` | contexte réactif dans le composant | React |
| `defineVueTemplate` | `./vue` | monte une app Vue dans l'élément | Vue |
| `useTemplate` | `./vue` | contexte réactif (composable) | Vue |
| `createMockContext` | `./testing` | contexte complet pour tests unitaires | tests |
| `mountTemplate` | `./testing` | montage + mises à jour en environnement DOM | tests |
| `defineTemplateConfig` | `./vite` | configuration Vite correcte pour un template | React/Vue/TS |
| `TEMPLATE_HOST_PROTOCOL` | `.` | constante du protocole | tous |
| `CONTRACT_VERSION` | `.` | version du contrat | tous |

---

## 5. API vanilla (`@onirtech/template-sdk`)

### 5.1 `defineTemplate(element, render, options?)`

```ts
defineTemplate(
  element: string,
  render: (ctx: OnirtechContext) => Node | Node[] | string,
  options?: {
    css?: string;
    shadowDom?: "open" | "closed" | "none";
    errorFallback?: (error: unknown) => Node | string;
    onError?: (error: unknown) => void;
    onUnmount?: () => void;
  },
): CustomElementConstructor;
```

**Ce que le développeur écrit aujourd'hui** (squelette obligatoire, ~25 lignes) :

```js
const ELEMENT = "onirtech-template-aurora";

class Aurora extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });
  #ctx = null;

  set onirtechContext(ctx) { this.#ctx = ctx; this.#render(); }
  get onirtechContext() { return this.#ctx; }

  connectedCallback() { this.#render(); }

  #render() {
    const ctx = this.#ctx;
    if (!ctx) return;
    const style = document.createElement("style");
    style.textContent = ":host { display:block }";
    const section = document.createElement("section");
    section.textContent = ctx.brand.name;
    this.#root.replaceChildren(style, section);
  }
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, Aurora);
```

**Ce qu'il écrit avec le SDK** :

```js
import { defineTemplate, h, param } from "@onirtech/template-sdk";

defineTemplate(
  "onirtech-template-aurora",
  (ctx) => h("section", {}, param(ctx, "titre", "Discutons de votre projet")),
  { css: ":host { display: block; font-family: system-ui, sans-serif; }" },
);
```

**Ce que le SDK fait à votre place**

| Le SDK gère | Sans le SDK |
| --- | --- |
| `customElements.define` **idempotent** | vérifier `customElements.get` |
| `attachShadow` selon `shadowDom` | créer le root, gérer le mode |
| getter **et** setter `onirtechContext` | les écrire, ne pas oublier le getter |
| rendu au montage **même si** le contexte arrive avant | gérer l'ordre montage/contexte |
| rendu à **chaque** réassignation | re-rendre sans perdre le contexte |
| remplacement propre du contenu (pas de fuite) | vider le root à chaque rendu |
| injection des styles **une seule fois** | recréer un `<style>` à chaque rendu |
| capture d'erreur + repli | écran blanc en cas d'exception |
| nettoyage (`onUnmount`, déconnexion) | libérer timers et écouteurs |

**Intérêt développeur** : le squelette disparaît, les erreurs classiques aussi
(getter oublié, rendu avant contexte, nœuds orphelins, styles recréés). Le code
métier reste 100 % du DOM natif.

**Options**

| Option | Défaut | Rôle | Intérêt |
| --- | --- | --- | --- |
| `css` | `undefined` | CSS injecté une fois dans le shadow root | styles encapsulés sans `<link>` externe |
| `shadowDom` | `"open"` | mode du Shadow DOM | `closed` pour verrouiller l'inspection |
| `errorFallback` | message minimal | rendu de secours si `render` lève | évite la page blanche chez le visiteur |
| `onError` | `console.error` | rapport d'erreur | brancher un outil de suivi |
| `onUnmount` | — | nettoyage | libérer timers, écouteurs, ressources |

---

### 5.2 `h(tag, props?, ...children)`

```ts
h(
  tag: string,
  props?: {
    class?: string;
    text?: string;
    [key: `on${string}`]: (event: Event) => void;
    [attribute: string]: string | number | boolean | null | undefined;
  },
  ...children: (Node | string | number | null | false | (Node | string)[])[]
): HTMLElement;
```

- `text` → `textContent` (jamais de HTML) ;
- `class` → `className` ;
- `on*` → `addEventListener` (ex. `onclick`, `onsubmit`) ;
- autres clés → `setAttribute` (les `null`/`undefined` sont ignorés) ;
- enfants : nœuds, textes, tableaux aplatis, `null`/`false` ignorés.

```js
h("ul", {}, ...ctx.state.messages.map((m) =>
  h("li", { class: m.role, text: m.content })));
```

**Intérêt développeur** : construire du DOM lisible **sans `innerHTML`** (donc
sans risque d'injection) et sans framework. Les valeurs du contexte restent
toujours des textes.

---

### 5.3 `param(ctx, key, fallback)`

```ts
param<T extends string | number | boolean>(
  ctx: OnirtechContext,
  key: string,
  fallback: T,
): T | string | number | boolean;
```

```js
const titre = param(ctx, "titre", "Discutons de votre projet");
const couleur = param(ctx, "couleur", "#023777");
```

**Intérêt développeur** : une ligne au lieu de
`ctx.params && ctx.params.titre !== undefined ? ...`. Fonctionne aussi quand le
contexte de dev (harness/tests) ne fournit pas de paramètres.

---

### 5.4 `hasCapability(ctx, capability)`

```ts
hasCapability(ctx: OnirtechContext, capability: TemplateCapability): boolean;
```

```js
if (hasCapability(ctx, "media")) {
  root.append(gallery(ctx.resources.media));
}
```

**Intérêt développeur** : évite de lire une ressource non fournie
(`ctx.resources.media` vide, `modelForm` à `null`) et documente l'intention.

---

### 5.5 `defineManifest(manifest)`

```ts
defineManifest(manifest: TemplateManifestInput): TemplateManifestInput;
```

```ts
// manifest.ts
import { defineManifest } from "@onirtech/template-sdk";

export default defineManifest({
  id: "aurora",
  name: "Aurora",
  version: "1.0.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: { mode: "web-component", entry: "./dist/index.js", element: "onirtech-template-aurora", shadowDom: "open" },
  capabilities: ["messages", "theme"],
  params: [
    { key: "titre", label: "Titre", type: "string", default: "Discutons de votre projet", maxLength: 80 },
  ],
});
```

**Intérêt développeur** : autocomplétion et **erreurs de frappe à la
compilation** (capacité inconnue, type de paramètre invalide, `default` manquant)
au lieu d'attendre l'import. Le build Vite émet `onirtech.template.json` à partir
de ce fichier : une seule source de vérité.

---

### 5.6 Types et constantes

```ts
import type {
  OnirtechContext,
  TemplateMessage,
  TemplateAction,
  TemplateCapability,
  TemplateParamValues,
  TemplateState,
} from "@onirtech/template-sdk";
import { TEMPLATE_HOST_PROTOCOL, CONTRACT_VERSION } from "@onirtech/template-sdk";
```

**Intérêt développeur** : plus de structures recopiées à la main ; les valeurs
du contrat sont vérifiées par TypeScript (et par JSDoc en JavaScript).

---

## 6. API React (`@onirtech/template-sdk/react`)

### 6.1 `defineReactTemplate(element, Component, options?)`

```ts
defineReactTemplate(
  element: string,
  Component: React.ComponentType,
  options?: { css?: string; shadowDom?: ShadowDomMode; errorFallback?: (e: unknown) => React.ReactNode },
): CustomElementConstructor;
```

```jsx
import css from "./styles.css?inline";
import { defineReactTemplate } from "@onirtech/template-sdk/react";
import { Aurora } from "./Aurora";

defineReactTemplate("onirtech-template-aurora", Aurora, { css });
```

**Intérêt développeur** : React fonctionne **tel quel** (hooks, contexte, état
local) sans écrire de Custom Element ni de pont manuel. Le SDK crée le shadow
root, monte React avec `createRoot`, pousse chaque nouveau contexte dans le
composant et démonte proprement à la déconnexion.

---

### 6.2 `useTemplate()`

```ts
function useTemplate(): {
  ctx: OnirtechContext;
  phase: "identity" | "chat";
  messages: TemplateMessage[];
  params: TemplateParamValues;
  capabilities: readonly TemplateCapability[];
  actions: OnirtechContext["actions"];
};
```

```jsx
function Aurora() {
  const { phase, messages, params, actions } = useTemplate();
  return phase === "identity"
    ? <IdentityForm onSubmit={actions.submitIdentity} />
    : <MessageList messages={messages} titre={params.titre} />;
}
```

**Intérêt développeur** : zéro prop drilling, composants réutilisables, et
**re-render automatique** à chaque mise à jour du contexte (nouveau message,
`typing`, changement de phase).

---

## 7. API Vue (`@onirtech/template-sdk/vue`)

### 7.1 `defineVueTemplate(element, Component, options?)`

```ts
defineVueTemplate(
  element: string,
  Component: Component,
  options?: { css?: string; shadowDom?: ShadowDomMode; errorFallback?: (e: unknown) => string },
): CustomElementConstructor;
```

```js
import css from "./styles.css?inline";
import { defineVueTemplate } from "@onirtech/template-sdk/vue";
import Aurora from "./Aurora.vue";

defineVueTemplate("onirtech-template-aurora", Aurora, { css });
```

**Intérêt développeur** : SFC, `<script setup>`, `computed`, composants — sans
`defineCustomElement` de Vue (qui impose un build spécifique et complique les
styles). Le SDK monte l'app dans le shadow root et expose le contexte.

---

### 7.2 `useTemplate()` (composable)

```ts
function useTemplate(): {
  ctx: Readonly<Ref<OnirtechContext>>;
  phase: ComputedRef<"identity" | "chat">;
  messages: ComputedRef<TemplateMessage[]>;
  params: ComputedRef<TemplateParamValues>;
  actions: OnirtechContext["actions"];
};
```

```vue
<script setup>
import { useTemplate } from "@onirtech/template-sdk/vue";
const { phase, messages, params, actions } = useTemplate();
</script>

<template>
  <MessageList v-if="phase === 'chat'" :messages="messages" :titre="params.titre" />
</template>
```

**Intérêt développeur** : réactivité Vue native (refs/computed), pas de
`watch` manuel sur le contexte.

---

## 8. API de test (`@onirtech/template-sdk/testing`)

### 8.1 `createMockContext(overrides?)`

```ts
createMockContext(overrides?: DeepPartial<OnirtechContext>): OnirtechContext;
```

```js
import { createMockContext } from "@onirtech/template-sdk/testing";

const ctx = createMockContext({
  state: { phase: "chat", messages: [/* … */] },
  params: { titre: "Album souvenirs" },
});
```

**Intérêt développeur** : tester un template sans harness, sans navigateur
complet, avec un contexte **complet et conforme** (messages, médias, capacités,
params, consentement).

---

### 8.2 `mountTemplate(element, ctx)`

```ts
mountTemplate(
  element: string,
  ctx: OnirtechContext,
): { el: HTMLElement; update(ctx: OnirtechContext): void; unmount(): void };
```

```js
const { el, update } = mountTemplate("onirtech-template-aurora", ctx);
expect(el.shadowRoot.textContent).toContain("Album souvenirs");

update(createMockContext({ state: { phase: "chat", messages: [] } }));
expect(el.shadowRoot.textContent).toContain("Bonjour");
```

**Intérêt développeur** : tester le **vrai comportement** (rendu initial, mise à
jour du contexte, nettoyage) dans Vitest/Jest avec `happy-dom` ou `jsdom`, sans
lancer l'hôte.

---

## 9. Outillage Vite (`@onirtech/template-sdk/vite`)

### 9.1 `defineTemplateConfig(options)`

```ts
defineTemplateConfig(options: {
  entry: string;            // ex. "src/index.ts"
  element: string;          // doit correspondre à ui.element du manifeste
  manifest?: string;        // chemin du manifest.ts (émet onirtech.template.json)
  minify?: boolean;         // défaut true en production
  plugins?: PluginOption[]; // additif : @vitejs/plugin-react / @vitejs/plugin-vue
  outDir?: string;          // défaut "dist"
}): UserConfig;
```

```ts
// vite.config.ts
import { defineTemplateConfig } from "@onirtech/template-sdk/vite";

export default defineTemplateConfig({ entry: "src/index.ts", element: "onirtech-template-aurora" });
```

Ce que la configuration applique :

| Réglage | Valeur | Pourquoi |
| --- | --- | --- |
| `build.lib` | entrée unique | un seul fichier, pas de chunks dispersés |
| `formats` | `["es"]` | le manifeste pointe une entrée ESM |
| `cssCodeSplit` | `false` | le CSS est inliné dans le JS (shadow root) |
| `assetsInlineLimit` | élevé | polices/images petites embarquées |
| `target` | `es2022` | Custom Elements et syntaxes modernes |
| `minify` | production | poids du bundle |
| `manifest` | émis si fourni | `onirtech.template.json` généré depuis `manifest.ts` |
| `plugins` | **additif** (option) | plugins du projet (`@vitejs/plugin-react`, `@vitejs/plugin-vue`) : les plugins du SDK restent toujours appliqués |

**Intérêt développeur** : une ligne de configuration au lieu d'un réglage
`build.lib` fragile ; le piège classique (CSS séparé, non chargé dans le shadow
root) est éliminé.

---

## 10. Garanties de comportement du SDK

1. **Ordre** : `render` est appelé dès que le contexte est disponible, que
   l'assignation ait lieu avant ou après le montage.
2. **Idempotence** : chaque assignation remplace le contenu du root ; `render`
   ne doit pas dépendre d'un rendu précédent.
3. **Lecture seule** : le SDK ne modifie jamais `ctx` (seul `params` est gelé).
4. **Pas de HTML injecté** : `h` et les adaptateurs n'utilisent jamais
   `innerHTML` avec des valeurs du contexte.
5. **Erreurs** : toute exception de `render` est capturée, journalisée et
   remplacée par `errorFallback`.
6. **Cycle de vie** : `onUnmount` est appelé à la déconnexion ; les adaptateurs
   démontent React/Vue.
7. **Enregistrement** : `defineTemplate` / `defineReactTemplate` /
   `defineVueTemplate` sont **idempotents** (rechargement à chaud, double import).

---

## 11. Build, scaffolding et publication

| Stack | Build | Entrée du manifeste |
| --- | --- | --- |
| HTML/CSS/JS (vanilla) | **aucun** | `src/index.js` |
| React | **Vite** | `dist/index.js` |
| Vue | **Vite** | `dist/index.js` |
| TypeScript (vanilla/React/Vue) | **Vite** | `dist/index.js` |

- `create-onirtech-template <id> --stack vanilla|react|vue` génère le projet
  complet (manifeste, entrée, styles, scripts npm, configuration Vite). Tant que
  le paquet n'est pas publié, il s'exécute **depuis le dépôt** :
  `node template-kit/bin/create-onirtech-template.mjs <id> --stack <nom>`
  (`npx create-onirtech-template` est la cible après publication npm).
- `npm run dev` lance le **harness** (contexte MOCK, hors-ligne) et, pour
  React/Vue/TS, le build en `--watch`.
- En vanilla, il n'y a **aucun build** : les styles sont dans `src/styles.js`
  (constante `CSS` exportée) et `pack` calcule l'intégrité SRI de l'entrée.
- Pour React/Vue/TS, l'ordre est `build` → `validate` → `pack` : l'intégrité est
  calculée au build par le plugin ; `npm run build` est requis avant `pack`.
- Le SDK lui-même : **esbuild** + `tsc` (déclarations). La version **0.1.0 est
  publiée sur npm** (2026-10-18, staging + approbation 2FA). La publication est
  déclenchée **uniquement par un tag** `template-sdk-v<version>`
  (`.github/workflows/publish-template-sdk.yml`) : contrôle tag ↔
  `packages/template-sdk/package.json`, build, tests, budget de taille puis
  `npm stage publish --access public` via **trusted publishing (OIDC)**
  (`id-token: write`, **sans** `NPM_TOKEN`). `workflow_dispatch` rejoue les
  contrôles **sans publier** ; aucune publication depuis une branche.
- **Trusted publishing** : configuré sur npmjs.com (GitHub Actions, owner
  `RINOHeinrich1`, repo `onir-cms`, workflow
  `publish-template-sdk.yml`). Les tokens à « bypass 2FA » sont **dépréciés** :
  la publication directe par ces tokens disparaît vers janvier 2027. La
  provenance est générée par le trusted publishing depuis le dépôt public.
- Le **générateur** n'est pas encore un paquet npm : il s'exécute depuis le
  dépôt (`node template-kit/bin/create-onirtech-template.mjs`). Sa publication
  (`npx create-onirtech-template`) reste à faire.

---

## 12. Anti-dérive du contrat

Le SDK duplique les types du contrat (il est publié indépendamment). Un **test
de compatibilité** dans la CI du dashboard vérifie l'**assignabilité mutuelle**
entre `TemplateContext` (payload du SDK) et `TemplateContextPayload` (cœur) —
`OnirtechContext` est ce payload augmenté de `actions` et `on`. Toute
divergence casse la CI.

---

## 13. Hors périmètre v1

- transport iframe (`community`) ;
- adaptateurs Svelte / Solid / Angular ;
- génération de types depuis `manifest.params` ;
- HMR du harness.

---

## Conséquences

### Positives

- Le workflow développeur est **documenté** sur `/documentation/sdk` : cette
  page décrit l'**API livrée** (SDK 0.1.0) et sert de contrat d'usage et de
  support pour les trois stacks.
- Un template React/Vue/vanilla **sans boilerplate** ni connaissance du Custom
  Element.
- Contrat **typé et distribué** : moins d'erreurs, meilleure autocomplétion.
- Une **API unique** pour les trois stacks, avec des hooks/composables natifs.
- Un seul endroit pour faire évoluer l'outillage, avec un garde-fou de
  compatibilité en CI.
- Le stack débutant reste **sans build**.

### Négatives / Risques

- Un paquet supplémentaire à versionner et à publier (scope npm, jeton CI).
- Le SDK est **embarqué** dans chaque template : budget de taille à tenir
  (cœur < 5 Ko gzip ; React/Vue ajoutent leur propre poids).
- React/Vue ajoutent une étape de build (Vite) et des peer dependencies.
- La duplication des types n'est contenue que par le test de compatibilité.

## Alternatives écartées

1. **Pas de SDK** : duplication du squelette, divergences, aucun support
   framework.
2. **SDK servi par l'hôte** (runtime partagé) : impossible, les templates sont
   isolés.
3. **Un SDK par framework** : multiplie la maintenance et les divergences.
4. **Tout en iframe** : hors besoin pour des templates first-party.
