import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "Documentation — SDK des templates",
};

const OVERVIEW = `# SDK 0.1.2 — générateur inclus :
npx @onirtech/create-onirtech-template aurora --stack react   # ou vue | vanilla

cd aurora
npm install
npm run dev      # développement local (hôte simulé)
npm test         # tests unitaires du template
npm run build    # React / Vue / TypeScript uniquement
npm run validate # manifeste + entrée + intégrité
npm run pack     # archive .onirtech-template`;

const MANIFEST_REACT = `// src/manifest.ts
import { defineManifest } from "@onirtech/template-sdk";

export default defineManifest({
  id: "aurora",
  name: "Aurora",
  description: "Chat et formulaire clairs, orientés conversion.",
  version: "1.0.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: {
    mode: "web-component",
    entry: "./dist/index.js",
    element: "onirtech-template-aurora",
    shadowDom: "open",
  },
  capabilities: ["messages", "theme"],
  params: [
    {
      key: "titre",
      label: "Titre",
      description: "Titre affiché en haut du chat",
      type: "string",
      default: "Discutons de votre projet",
      maxLength: 80,
    },
  ],
});`;

const MANIFEST_VANILLA = `{
  "schemaVersion": 1,
  "kind": "template",
  "id": "aurora",
  "name": "Aurora",
  "description": "Chat et formulaire clairs, orientés conversion.",
  "version": "1.0.0",
  "publisher": { "id": "onirtech", "name": "ONIRTECH", "trustLevel": "official" },
  "compatibility": { "hostProtocol": "onirtech.template-host.v1" },
  "ui": {
    "mode": "web-component",
    "entry": "./index.js",
    "element": "onirtech-template-aurora",
    "shadowDom": "open"
  },
  "capabilities": ["messages", "theme"],
  "network": [],
  "params": [
    {
      "key": "titre",
      "label": "Titre",
      "description": "Titre affiché en haut du chat",
      "type": "string",
      "default": "Discutons de votre projet",
      "maxLength": 80
    }
  ]
}`;

const REACT_COMPONENT = `// src/Aurora.jsx
import { useState } from "react";
import { useTemplate } from "@onirtech/template-sdk/react";

export function Aurora() {
  const { phase, messages, params, actions } = useTemplate();
  const [draft, setDraft] = useState("");

  if (phase === "identity") {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          actions.submitIdentity({
            nom: String(data.get("nom") ?? ""),
            email: String(data.get("email") ?? ""),
            consentement: data.get("consentement") === "on",
          });
        }}
      >
        <h2>{params.titre}</h2>
        <input name="nom" placeholder="Votre nom" aria-label="Nom" required />
        <input name="email" type="email" placeholder="vous@exemple.mg" aria-label="Email" required />
        <label>
          <input name="consentement" type="checkbox" /> J'accepte le traitement de mes données
        </label>
        <button type="submit">Démarrer la discussion</button>
      </form>
    );
  }

  return (
    <section>
      <h2>{params.titre}</h2>
      <ul>
        {messages.map((message) => (
          <li key={message.id} className={message.role}>{message.content}</li>
        ))}
      </ul>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() === "") return;
          actions.sendMessage(draft.trim());
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Votre message…"
          aria-label="Message"
        />
        <button type="submit">Envoyer</button>
      </form>
    </section>
  );
}`;

const REACT_ENTRY = `// src/index.js
import css from "./styles.css?inline";
import { defineReactTemplate } from "@onirtech/template-sdk/react";
import { Aurora } from "./Aurora";

defineReactTemplate("onirtech-template-aurora", Aurora, { css });`;

const VUE_COMPONENT = `<!-- src/Aurora.vue -->
<script setup>
import { ref } from "vue";
import { useTemplate } from "@onirtech/template-sdk/vue";

const { phase, messages, params, actions } = useTemplate();
const draft = ref("");

function submitIdentity(event) {
  const data = new FormData(event.currentTarget);
  actions.submitIdentity({
    nom: String(data.get("nom") ?? ""),
    email: String(data.get("email") ?? ""),
    consentement: data.get("consentement") === "on",
  });
}

function sendMessage() {
  if (draft.value.trim() === "") return;
  actions.sendMessage(draft.value.trim());
  draft.value = "";
}
</script>

<template>
  <h2>{{ params.titre }}</h2>

  <form v-if="phase === 'identity'" @submit.prevent="submitIdentity">
    <input name="nom" placeholder="Votre nom" aria-label="Nom" required />
    <input name="email" type="email" placeholder="vous@exemple.mg" aria-label="Email" required />
    <label>
      <input name="consentement" type="checkbox" /> J'accepte le traitement de mes données
    </label>
    <button type="submit">Démarrer la discussion</button>
  </form>

  <section v-else>
    <ul>
      <li v-for="message in messages" :key="message.id" :class="message.role">
        {{ message.content }}
      </li>
    </ul>
    <form @submit.prevent="sendMessage">
      <input v-model="draft" placeholder="Votre message…" aria-label="Message" />
      <button type="submit">Envoyer</button>
    </form>
  </section>
</template>`;

const VUE_ENTRY = `// src/index.js
import css from "./styles.css?inline";
import { defineVueTemplate } from "@onirtech/template-sdk/vue";
import Aurora from "./Aurora.vue";

defineVueTemplate("onirtech-template-aurora", Aurora, { css });`;

const VANILLA_ENTRY = `// src/index.js — aucun build
import { defineTemplate, h, param, hasCapability } from "@onirtech/template-sdk";

function identity(ctx) {
  const nom = h("input", { name: "nom", placeholder: "Votre nom", "aria-label": "Nom" });
  const email = h("input", { name: "email", type: "email", placeholder: "vous@exemple.mg", "aria-label": "Email" });
  const consentement = h("input", { name: "consentement", type: "checkbox" });

  return h("form", {
    onsubmit: (event) => {
      event.preventDefault();
      ctx.actions.submitIdentity({
        nom: nom.value.trim(),
        email: email.value.trim(),
        consentement: consentement.checked,
      });
    },
  },
    h("h2", { text: param(ctx, "titre", "Discutons de votre projet") }),
    nom,
    email,
    h("label", {}, consentement, " J'accepte le traitement de mes données"),
    h("button", { type: "submit", text: "Démarrer la discussion" }),
  );
}

function chat(ctx) {
  const champ = h("input", { placeholder: "Votre message…", "aria-label": "Message" });
  const envoyer = () => {
    if (champ.value.trim() === "") return;
    ctx.actions.sendMessage(champ.value.trim());
    champ.value = "";
  };

  return h("section", {},
    h("h2", { text: param(ctx, "titre", "Discutons de votre projet") }),
    hasCapability(ctx, "media")
      ? h("p", { text: "Photos et liens disponibles" })
      : null,
    h("ul", {}, ...ctx.state.messages.map((message) =>
      h("li", { class: message.role, text: message.content }))),
    ctx.state.typing ? h("p", { text: "…" }) : null,
    h("div", {}, champ, h("button", { type: "button", text: "Envoyer", onclick: envoyer })),
  );
}

defineTemplate(
  "onirtech-template-aurora",
  (ctx) => (ctx.state.phase === "identity" ? identity(ctx) : chat(ctx)),
  { css: \`
      :host { display: block; font-family: system-ui, sans-serif; }
      ul { list-style: none; padding: 0; }
      li.user { background: #e2e8f0; }
    \` },
);`;

const TEST_EXAMPLE = `// tests/aurora.test.js
import { expect, it } from "vitest";
import { createMockContext, mountTemplate } from "@onirtech/template-sdk/testing";
import "../src/index.js";

it("affiche le titre du paramètre", () => {
  const ctx = createMockContext({ params: { titre: "Album souvenirs" } });
  const { el } = mountTemplate("onirtech-template-aurora", ctx);

  expect(el.shadowRoot.textContent).toContain("Album souvenirs");
});

it("passe du formulaire au chat", () => {
  const ctx = createMockContext();
  const { el, update } = mountTemplate("onirtech-template-aurora", ctx);

  update(createMockContext({
    state: { phase: "chat", messages: [{ role: "assistant", content: "Bonjour" }] },
  }));

  expect(el.shadowRoot.textContent).toContain("Bonjour");
});`;

const VITE_CONFIG = `// vite.config.ts
import { defineTemplateConfig } from "@onirtech/template-sdk/vite";

export default defineTemplateConfig({
  entry: "src/index.ts",
  element: "onirtech-template-aurora",
  manifest: "src/manifest.ts",
});`;

const SCAFFOLD_TREE = `aurora/
├─ src/
│  ├─ index.js          entrée : enregistre le Custom Element
│  ├─ Aurora.jsx        votre interface (React)
│  ├─ styles.css        styles (inlinés dans le bundle)
│  └─ manifest.ts       manifeste typé (defineManifest)
├─ tests/
│  └─ aurora.test.js    tests unitaires du template
├─ vite.config.ts       build correct pour un template
├─ package.json
└─ onirtech.template.json   généré au build (React / Vue / TypeScript)`;

const SCAFFOLD_TREE_VANILLA = `aurora/
├─ src/
│  ├─ index.js          entrée : defineTemplate(...)
│  ├─ ui.js             fonctions de rendu (h, param)
│  └─ styles.js         styles : export const CSS (chaîne, aucun build)
├─ tests/
│  └─ aurora.test.js
├─ onirtech.template.json   manifeste (JSON, pas de build)
└─ package.json`;

function Doc({ children }: { children: ReactNode }) {
  return <section className="doc">{children}</section>;
}

function Code({ children }: { children: string }) {
  return <DocCode>{children}</DocCode>;
}

/** Étape du workflow : commande exécutée + fonctions du SDK mobilisées. */
function StepIO({ command, functions }: { command: ReactNode; functions: ReactNode }) {
  return (
    <p className="doc-stepio">
      <strong>Commande :</strong> {command}
      <span aria-hidden> · </span>
      <strong>Fonctions :</strong> {functions}
    </p>
  );
}

/** Documentation du SDK livré et publié sur npm (v0.1.3). */
export default function SdkDocsPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Documentation</span>
          <h1 className="text-title">
            Créer un template avec le SDK <span className="badge">v0.1.3</span>
          </h1>
          <p className="hint">
            Workflow du développeur — de l&apos;initialisation au bundle importable, avec React, Vue
            ou HTML/CSS/JS. L&apos;API décrite est celle du SDK 0.1.0 livré.
          </p>
        </div>
      </div>

      <div className="doc-callout">
        <strong>SDK 0.1.3 et générateur publiés sur npm.</strong>
        <p>
          Installez le SDK avec <code>npm install @onirtech/template-sdk</code> (ou{" "}
          <code>npm install -D @onirtech/template-sdk</code> pour le build), puis créez un projet
          avec <code>npx @onirtech/create-onirtech-template aurora --stack react</code>. ADR-0024
          est <strong>Accepté</strong>.
        </p>
      </div>

      <p>
        Le SDK supprime le squelette de Custom Element : vous écrivez{" "}
        <strong>l&apos;interface</strong> (React, Vue ou DOM natif) et le SDK gère le Shadow DOM, la
        propriété <code>onirtechContext</code>, le rendu à chaque mise à jour, les styles, les
        erreurs et le nettoyage.
      </p>

      <h2 id="profils">1. À qui s&apos;adresse cette page</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Profil</th>
              <th>Ce que vous écrivez</th>
              <th>Build</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>React</strong>
              </td>
              <td>
                Composants <code>.jsx</code> + <code>useTemplate()</code>
              </td>
              <td>Vite requis</td>
            </tr>
            <tr>
              <td>
                <strong>Vue</strong>
              </td>
              <td>
                SFC <code>.vue</code> + <code>useTemplate()</code>
              </td>
              <td>Vite requis</td>
            </tr>
            <tr>
              <td>
                <strong>Débutant</strong>
              </td>
              <td>
                HTML / CSS / JavaScript avec <code>h()</code>
              </td>
              <td>
                <strong>Aucun</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        Il faut Node.js 18 ou plus et npm. Aucune connaissance des Custom Elements, du Shadow DOM ou
        du protocole hôte n&apos;est nécessaire.
      </p>

      <h2 id="workflow">2. Le workflow en un coup d&apos;œil</h2>
      <Code>{OVERVIEW}</Code>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Étape</th>
              <th>Commande</th>
              <th>Fonctions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Initialiser</td>
              <td>
                <code>npx @onirtech/create-onirtech-template …</code>
              </td>
              <td>échafaudage (manifeste, entrée, styles, tests)</td>
            </tr>
            <tr>
              <td>Déclarer</td>
              <td>—</td>
              <td>
                <code>defineManifest</code>
              </td>
            </tr>
            <tr>
              <td>Coder</td>
              <td>—</td>
              <td>
                <code>defineReactTemplate</code> + <code>useTemplate</code> /{" "}
                <code>defineVueTemplate</code> + <code>useTemplate</code> /{" "}
                <code>defineTemplate</code> + <code>h</code> + <code>param</code> +{" "}
                <code>hasCapability</code>
              </td>
            </tr>
            <tr>
              <td>Développer</td>
              <td>
                <code>npm run dev</code>
              </td>
              <td>hôte simulé (harness)</td>
            </tr>
            <tr>
              <td>Tester</td>
              <td>
                <code>npm test</code>
              </td>
              <td>
                <code>createMockContext</code> + <code>mountTemplate</code>
              </td>
            </tr>
            <tr>
              <td>Construire</td>
              <td>
                <code>npm run build</code>
              </td>
              <td>
                <code>defineTemplateConfig</code>
              </td>
            </tr>
            <tr>
              <td>Valider / empaqueter</td>
              <td>
                <code>npm run validate</code> puis <code>npm run pack</code>
              </td>
              <td>kit (manifeste, entrée, SRI)</td>
            </tr>
            <tr>
              <td>Importer / rattacher</td>
              <td>—</td>
              <td>panneau Templates visuels + liens</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="init">3. Initialiser le projet</h2>
      <StepIO
        command={<code>npx @onirtech/create-onirtech-template aurora --stack react</code>}
        functions="—"
      />
      <p>
        Remplacez <code>react</code> par <code>vue</code> ou <code>vanilla</code>. Le générateur
        crée un projet complet, avec le nom d&apos;élément déjà cohérent entre le manifeste,
        l&apos;entrée et les tests.
      </p>
      <Code>{SCAFFOLD_TREE}</Code>
      <p className="hint">
        Version débutant (<code>--stack vanilla</code>) : pas de <code>vite.config.ts</code>, aucun
        build, des styles en <code>src/styles.js</code> (constante <code>CSS</code>) et un{" "}
        <code>onirtech.template.json</code> à la place de <code>manifest.ts</code>.
      </p>
      <Code>{SCAFFOLD_TREE_VANILLA}</Code>

      <h2 id="manifeste">4. Déclarer le manifeste</h2>
      <StepIO command="—" functions={<code>defineManifest</code>} />
      <p>
        Le manifeste décrit le template : identité, version, nom du Custom Element,{" "}
        <strong>capacités</strong> (données reçues) et <strong>paramètres</strong> (variables
        réglables par lien). <code>defineManifest</code> remplit les valeurs fixes (
        <code>schemaVersion</code>, <code>kind</code>, <code>network</code>) et vérifie le reste{" "}
        <strong>à la compilation</strong>.
      </p>
      <Code>{MANIFEST_REACT}</Code>
      <p className="hint">
        Version débutant : le même contenu, en JSON, dans <code>onirtech.template.json</code> (avec{" "}
        <code>schemaVersion</code>, <code>kind</code>, <code>compatibility</code> et{" "}
        <code>network</code> explicites).
      </p>
      <Code>{MANIFEST_VANILLA}</Code>
      <ul>
        <li>
          <code>ui.element</code> doit être identique au nom passé à <code>defineTemplate</code> /{" "}
          <code>defineReactTemplate</code> / <code>defineVueTemplate</code>.
        </li>
        <li>
          <code>params[].default</code> est <strong>obligatoire</strong> : c&apos;est le repli quand
          l&apos;exploitant ne renseigne rien.
        </li>
        <li>Une capacité non déclarée ⇒ la donnée correspondante est absente/ vide.</li>
      </ul>

      <h2 id="interface">5. Construire l&apos;interface</h2>
      <StepIO
        command="—"
        functions={
          <>
            <code>defineTemplate</code> / <code>useTemplate</code>
          </>
        }
      />
      <p>
        Les trois stacks lisent le même contexte. En React et Vue, <code>useTemplate()</code>{" "}
        renvoie <code>phase</code>, <code>messages</code>, <code>params</code>,{" "}
        <code>capabilities</code> et <code>actions</code> ; en vanilla, le contexte complet arrive
        dans la fonction de rendu.
      </p>

      <h3>React</h3>
      <p>
        <strong>Commande :</strong> aucune (édition) · <strong>Fonctions :</strong>{" "}
        <code>defineReactTemplate</code>, <code>useTemplate</code>
      </p>
      <Code>{REACT_COMPONENT}</Code>
      <Code>{REACT_ENTRY}</Code>
      <p className="hint">
        <code>import css from &quot;./styles.css?inline&quot;</code> est indispensable : le CSS doit
        être une chaîne injectée dans le Shadow DOM (le build Vite l&apos;inlinera).
      </p>

      <h3>Vue</h3>
      <p>
        <strong>Commande :</strong> aucune (édition) · <strong>Fonctions :</strong>{" "}
        <code>defineVueTemplate</code>, <code>useTemplate</code>
      </p>
      <Code>{VUE_COMPONENT}</Code>
      <Code>{VUE_ENTRY}</Code>

      <h3>Débutant — HTML / CSS / JavaScript</h3>
      <p>
        <strong>Commande :</strong> aucune (édition) · <strong>Fonctions :</strong>{" "}
        <code>defineTemplate</code>, <code>h</code>, <code>param</code>, <code>hasCapability</code>
      </p>
      <Code>{VANILLA_ENTRY}</Code>
      <p className="hint">
        En vanilla, les styles vivent dans <code>src/styles.js</code> : le module exporte une
        constante <code>CSS</code> passée à l&apos;option <code>css</code>. Aucun build
        n&apos;intervient pour transformer un fichier <code>.css</code>.
      </p>
      <ul>
        <li>
          <code>h(tag, props, ...children)</code> : crée un nœud. <code>text</code> = texte (jamais
          de HTML), <code>onclick</code> = écouteur, le reste = attributs.
        </li>
        <li>
          <code>param(ctx, &quot;titre&quot;, défaut)</code> : lit une variable avec repli.
        </li>
        <li>
          <code>hasCapability(ctx, &quot;media&quot;)</code> : teste une capacité avant de lire la
          donnée.
        </li>
      </ul>

      <h2 id="dev">6. Développer en local</h2>
      <StepIO command={<code>npm run dev</code>} functions="hôte simulé (harness)" />
      <p>
        Le harness implémente le côté hôte avec des données MOCK : aucune base, aucun lien, tout est
        hors-ligne. Pour React/Vue/TypeScript, il lance aussi le build en <code>--watch</code>.
      </p>
      <ul>
        <li>
          <code>http://localhost:4500</code> — le template dans un faux lien.
        </li>
        <li>
          <code>?phase=chat</code> — saute le formulaire, va directement à la discussion.
        </li>
        <li>
          <code>?consent=0</code> — lien sans consentement.
        </li>
        <li>
          Après un rebuild, <strong>rechargez la page</strong> (pas de live-reload).
        </li>
      </ul>
      <p className="hint">
        Ouvrez les DevTools et inspectez le Shadow DOM pour vérifier le rendu. Les actions sont
        simulées : <code>submitIdentity</code> passe en phase chat, une réponse mock arrive,
        <code>finish</code> clôt la discussion.
      </p>

      <h2 id="tests">7. Tester</h2>
      <StepIO
        command={<code>npm test</code>}
        functions={
          <>
            <code>createMockContext</code>, <code>mountTemplate</code>
          </>
        }
      />
      <p>
        Le scaffolder génère Vitest + <code>happy-dom</code>. Les deux helpers évitent de lancer le
        harness dans les tests.
      </p>
      <Code>{TEST_EXAMPLE}</Code>
      <ul>
        <li>
          <code>createMockContext(overrides)</code> produit un contexte complet et conforme
          (identité ou chat, messages, médias, params).
        </li>
        <li>
          <code>mountTemplate(element, ctx)</code> monte le vrai élément et expose{" "}
          <code>update(ctx)</code> pour simuler une nouvelle assignation du contexte.
        </li>
      </ul>
      <p className="hint">
        Vérifiez au minimum : les deux phases, le consentement, les messages vides, un texte long et
        chaque paramètre.
      </p>

      <h2 id="build">8. Construire le bundle</h2>
      <StepIO command={<code>npm run build</code>} functions={<code>defineTemplateConfig</code>} />
      <p>
        Étape nécessaire pour <strong>React, Vue et TypeScript</strong> ; inutile en vanilla. La
        configuration est générée par le scaffolder :
      </p>
      <Code>{VITE_CONFIG}</Code>
      <p className="hint">
        React et Vue passent leurs plugins de compilation via l&apos;option additive{" "}
        <code>plugins</code> (<code>@vitejs/plugin-react</code>, <code>@vitejs/plugin-vue</code>) :{" "}
        <code>defineTemplateConfig({`{ entry, element, manifest, plugins: [react()] }`})</code>.{" "}
        <code>vite</code> reste une peer dependency optionnelle.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Ce que la configuration impose</th>
              <th>Pourquoi</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>un seul fichier ESM</td>
              <td>le manifeste pointe une entrée unique</td>
            </tr>
            <tr>
              <td>
                CSS non séparé (<code>cssCodeSplit: false</code>)
              </td>
              <td>les styles voyagent dans le JS du Shadow DOM</td>
            </tr>
            <tr>
              <td>assets inlinés</td>
              <td>aucune requête externe non déclarée</td>
            </tr>
            <tr>
              <td>
                <code>target: es2022</code>
              </td>
              <td>Custom Elements et syntaxes modernes</td>
            </tr>
            <tr>
              <td>React/Vue embarqués une seule fois</td>
              <td>pas de dépendance fournie par l&apos;hôte</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Résultat : <code>dist/index.js</code> (+ <code>onirtech.template.json</code> émis depuis
        <code>manifest.ts</code>). Vérifiez le poids : <code>gzip -c dist/index.js | wc -c</code>.
      </p>

      <h2 id="livraison">9. Valider, empaqueter, importer</h2>
      <StepIO
        command={
          <>
            <code>npm run validate</code> puis <code>npm run pack</code>
          </>
        }
        functions="kit (manifeste, entrée, intégrité SRI)"
      />
      <ol>
        <li>
          <code>npm run validate</code> vérifie le manifeste, l&apos;entrée, le nom d&apos;élément
          et les paramètres.
        </li>
        <li>
          <code>npm run pack</code> produit <code>release/aurora-1.0.0.onirtech-template</code>{" "}
          (intégrité incluse).
        </li>
        <li>
          Dans le dashboard : <strong>Templates visuels</strong> → importer l&apos;archive.
        </li>
        <li>
          Sur le lien : choisir le template et la version, renseigner les{" "}
          <strong>paramètres</strong>, puis <strong>Aperçu avec ces valeurs</strong>.
        </li>
        <li>
          Pour une mise à jour : incrémenter <code>version</code>, revalider, repackager, réimporter
          et sélectionner la nouvelle version sur le lien.
        </li>
      </ol>

      <h2 id="recap">10. Récapitulatif</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Processus</th>
              <th>Commande</th>
              <th>Fonctions</th>
              <th>Résultat</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>Initialiser</td>
              <td>
                <code>create-onirtech-template</code>
                <br />
                <span className="hint">local ; npx après publication npm</span>
              </td>
              <td>—</td>
              <td>projet complet</td>
            </tr>
            <tr>
              <td>2</td>
              <td>Déclarer</td>
              <td>—</td>
              <td>
                <code>defineManifest</code>
              </td>
              <td>manifeste typé</td>
            </tr>
            <tr>
              <td>3</td>
              <td>Coder</td>
              <td>—</td>
              <td>
                <code>defineReactTemplate</code> + <code>useTemplate</code>
                <br />
                <code>defineVueTemplate</code> + <code>useTemplate</code>
                <br />
                <code>defineTemplate</code> + <code>h</code> + <code>param</code> +{" "}
                <code>hasCapability</code>
              </td>
              <td>interface</td>
            </tr>
            <tr>
              <td>4</td>
              <td>Développer</td>
              <td>
                <code>npm run dev</code>
              </td>
              <td>harness</td>
              <td>aperçu local</td>
            </tr>
            <tr>
              <td>5</td>
              <td>Tester</td>
              <td>
                <code>npm test</code>
              </td>
              <td>
                <code>createMockContext</code> + <code>mountTemplate</code>
              </td>
              <td>tests verts</td>
            </tr>
            <tr>
              <td>6</td>
              <td>Construire</td>
              <td>
                <code>npm run build</code>
              </td>
              <td>
                <code>defineTemplateConfig</code>
              </td>
              <td>
                <code>dist/index.js</code>
              </td>
            </tr>
            <tr>
              <td>7</td>
              <td>Valider</td>
              <td>
                <code>npm run validate</code>
              </td>
              <td>kit</td>
              <td>conformité</td>
            </tr>
            <tr>
              <td>8</td>
              <td>Empaqueter</td>
              <td>
                <code>npm run pack</code>
              </td>
              <td>kit</td>
              <td>archive</td>
            </tr>
            <tr>
              <td>9</td>
              <td>Importer</td>
              <td>dashboard</td>
              <td>—</td>
              <td>version installée</td>
            </tr>
            <tr>
              <td>10</td>
              <td>Rattacher</td>
              <td>dashboard</td>
              <td>—</td>
              <td>template publié</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="depannage">11. Dépannage</h2>
      <dl className="doc-faq">
        <dt>L&apos;élément ne s&apos;affiche pas.</dt>
        <dd>
          Vérifiez que <code>ui.element</code> est exactement le nom passé à{" "}
          <code>defineTemplate</code> (même kebab-case), et que l&apos;entrée est bien{" "}
          <code>dist/index.js</code> après un build.
        </dd>
        <dt>Mes styles ne s&apos;appliquent pas.</dt>
        <dd>
          Le CSS doit être importé en <code>?inline</code> puis passé à l&apos;option{" "}
          <code>css</code> ; un fichier CSS séparé n&apos;est pas chargé dans le Shadow DOM.
        </dd>
        <dt>
          <code>params.titre</code> est <code>undefined</code>.
        </dt>
        <dd>
          Le paramètre n&apos;est pas déclaré dans le manifeste, ou le harness ne fournit pas de
          valeurs : utilisez <code>param(ctx, &quot;titre&quot;, défaut)</code>.
        </dd>
        <dt>React lève « Invalid hook call ».</dt>
        <dd>
          Deux copies de React sont chargées : vérifiez que React n&apos;est pas externalisé et
          qu&apos;une seule version est installée.
        </dd>
        <dt>Le template change mais le lien ne change pas.</dt>
        <dd>
          Une version publiée est immuable : incrémentez <code>version</code>, repackagez,
          réimportez et sélectionnez la nouvelle version sur le lien.
        </dd>
        <dt>Une donnée du contexte est vide.</dt>
        <dd>
          Déclarez la capacité correspondante (<code>messages</code>, <code>media</code>,{" "}
          <code>modelForm</code>, <code>theme</code>, <code>userState</code>, <code>knowledge</code>
          ).
        </dd>
      </dl>

      <h2 id="references">12. Références</h2>
      <ul>
        <li>ADR-0024 — SDK JavaScript des templates visuels (API complète).</li>
        <li>
          <a href="/documentation/templates-visuels">Contrat des templates visuels</a> — manifeste,
          contexte, actions, paramètres.
        </li>
        <li>ADR-0019 (packages UI-only), ADR-0023 (variables paramétrables).</li>
        <li>
          Norme <code>docs/templates-visuels/norme-v1.md</code>.
        </li>
      </ul>

      <div className="doc-callout">
        <strong>Passer à la pratique : créez votre premier template.</strong>
        <p>
          Le guide <a href="/documentation/first-template">Your first package</a> vous accompagne de
          la création du projet à l&apos;import dans le panneau, avec du code vérifié à chaque
          étape.
        </p>
      </div>

      <div className="doc-callout">
        <strong>Comprendre le traitement des messages.</strong>
        <p>
          <a href="/documentation/actions">Les actions d&apos;un template</a> détaillent
          l&apos;identité, l&apos;envoi, la fin et les ressources : ce que l&apos;hôte exécute à
          chaque appel, en mock et en production.
        </p>
      </div>

      <div className="doc-callout">
        <strong>Vous utilisez un agent IA ?</strong>
        <p>
          Le <a href="/documentation/skill">skill onirtech-template-sdk</a> fournit à l&apos;agent
          les règles, l&apos;API réelle, les vérifications et les pièges connus pour créer un
          template de bout en bout.
        </p>
      </div>
    </Doc>
  );
}
