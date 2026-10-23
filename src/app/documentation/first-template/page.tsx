import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocCode } from "@/components/documentation/DocCode";

export const metadata: Metadata = {
  title: "Your first package — premier template",
};

const CREATE = `npx @onirtech/create-onirtech-template mon-premier-template --stack react
cd mon-premier-template
npm install`;

const TREE = `mon-premier-template/
├─ src/
│  ├─ index.js          enregistre le Custom Element (une ligne)
│  ├─ Aurora.jsx        votre interface (formulaire + chat)
│  ├─ styles.css        styles, inlinés dans le bundle
│  └─ manifest.ts       manifeste typé (id, version, params)
├─ tests/
│  └─ template.test.jsx tests unitaires (Vitest + happy-dom)
├─ harness/host.mjs     hôte simulé pour npm run dev
├─ tools/               validate, pack et orchestrateur dev
├─ vite.config.ts       build correct (SDK)
├─ package.json
└─ .gitignore`;

const ENTRY = `// src/index.js
import css from "./styles.css?inline";
import { defineReactTemplate } from "@onirtech/template-sdk/react";
import { Aurora } from "./Aurora";

defineReactTemplate("onirtech-template-mon-premier-template", Aurora, { css });`;

const MANIFEST = `// src/manifest.ts
import { defineManifest } from "@onirtech/template-sdk";

export default defineManifest({
  id: "mon-premier-template",
  name: "Mon Premier Template",
  description: "Mon premier template ONIR CMS.",
  version: "1.0.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: {
    mode: "web-component",
    entry: "./dist/index.js",
    element: "onirtech-template-mon-premier-template",
    shadowDom: "open",
  },
  capabilities: ["messages", "media", "theme"],
  params: [
    {
      key: "couleur",
      label: "Couleur d'accent",
      description: "Couleur des titres",
      type: "color",
      default: "#023777",
    },
    {
      key: "titre",
      label: "Titre",
      description: "Titre affiché en haut du formulaire et du chat",
      type: "string",
      default: "Discutons de votre projet",
      maxLength: 80,
    },
  ],
});`;

const AURORA = `// src/Aurora.jsx (extraits à modifier)
import { useState } from "react";
import { useTemplate } from "@onirtech/template-sdk/react";

export function Aurora() {
  const { phase, messages, params, actions } = useTemplate();
  const [draft, setDraft] = useState("");
  const accent = String(params.couleur ?? "#023777");

  // … formulaire d'identité …
  <h2 style={{ color: accent }}>
    {String(params.titre ?? "Discutons de votre projet")}
  </h2>

  // … dans la branche chat, même titre :
  <h2 style={{ color: accent }}>
    {String(params.titre ?? "Discutons de votre projet")}
  </h2>
}`;

const TEST = `// tests/template.test.jsx
import { expect, it } from "vitest";
import { createMockContext, mountTemplate } from "@onirtech/template-sdk/testing";
import "../src/index.js";

it("affiche le titre fourni par le lien", () => {
  const ctx = createMockContext({ params: { titre: "Album souvenirs" } });
  const { el } = mountTemplate("onirtech-template-mon-premier-template", ctx);

  expect(el.shadowRoot.textContent).toContain("Album souvenirs");
});`;

const VANILLA = `// src/index.js — stack vanilla (aucun build)
import { defineTemplate, h, param } from "@onirtech/template-sdk";

defineTemplate(
  "onirtech-template-mon-premier-template",
  (ctx) =>
    h("h2", {
      text: param(ctx, "titre", "Discutons de votre projet"),
    }),
  { css: ":host { display: block; font-family: system-ui, sans-serif; }" },
);`;

const VUE = `<!-- src/Aurora.vue (extrait) -->
<script setup>
import { useTemplate } from "@onirtech/template-sdk/vue";

const { phase, messages, params, actions } = useTemplate();
</script>

<template>
  <h2>{{ params.titre }}</h2>
  <!-- … -->
</template>`;

function Doc({ children }: { children: ReactNode }) {
  return <section className="doc">{children}</section>;
}

function Code({ children }: { children: string }) {
  return <DocCode>{children}</DocCode>;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <>
      <h2 id={`step-${n}`}>
        {n}. {title}
      </h2>
      {children}
    </>
  );
}

/** Guide pas à pas « Your first package » (parcours testé de bout en bout). */
export default function FirstTemplatePage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Guide</span>
          <h1 className="text-title">
            Your first package <span className="badge">vérifié avec le SDK 0.1.3</span>
          </h1>
          <p className="hint">
            De zéro à un template importable dans le panneau, en 12 étapes. Environ 15 minutes.
          </p>
        </div>
      </div>

      <p>
        Ce guide crée un template <strong>React</strong> complet. Les variantes <strong>Vue</strong>{" "}
        et <strong>HTML/CSS/JS</strong> sont détaillées à l&apos;étape 12. Chaque commande a été
        exécutée et vérifiée sur un projet neuf.
      </p>

      <h2 id="avant">Avant de commencer</h2>
      <ul>
        <li>
          <strong>Node.js 20.19+</strong> (recommandé : 22 ou 24) et npm.
        </li>
        <li>Un terminal dans VS Code (menu Terminal → New Terminal).</li>
        <li>
          Un accès au panneau pour importer le résultat (<code>Templates visuels</code>).
        </li>
      </ul>
      <p className="hint">
        Vérifiez votre version : <code>node -v</code> et <code>npm -v</code>.
      </p>

      <Step n={1} title="Créer le projet">
        <p>
          Le générateur crée le dossier, les fichiers et les scripts. Il n&apos;installe rien
          encore.
        </p>
        <Code>{CREATE}</Code>
        <p>
          Remplacez <code>react</code> par <code>vue</code> ou <code>vanilla</code> si besoin. Le
          nom doit être en minuscules, avec des tirets (<code>mon-premier-template</code>).
        </p>
        <p className="hint">
          Le générateur affiche le nom de l&apos;élément (
          <code>onirtech-template-mon-premier-template</code>) et les étapes suivantes.
        </p>
      </Step>

      <Step n={2} title="Installer les dépendances">
        <p>
          <code>npm install</code> installe React, Vite, Vitest et{" "}
          <code>@onirtech/template-sdk</code>.
        </p>
        <Code>{`npm install`}</Code>
        <p className="hint">
          Résultat attendu : <code>found 0 vulnerabilities</code> (ou des avertissements sans
          gravité).
        </p>
      </Step>

      <Step n={3} title="Comprendre les fichiers">
        <Code>{TREE}</Code>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Fichier</th>
                <th>Rôle</th>
                <th>Vous le modifiez ?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>src/manifest.ts</code>
                </td>
                <td>identité, version, capacités, paramètres</td>
                <td>souvent</td>
              </tr>
              <tr>
                <td>
                  <code>src/Aurora.jsx</code>
                </td>
                <td>l&apos;interface (formulaire + chat)</td>
                <td>souvent</td>
              </tr>
              <tr>
                <td>
                  <code>src/styles.css</code>
                </td>
                <td>styles injectés dans le Shadow DOM</td>
                <td>souvent</td>
              </tr>
              <tr>
                <td>
                  <code>src/index.js</code>
                </td>
                <td>enregistre l&apos;élément</td>
                <td>rarement</td>
              </tr>
              <tr>
                <td>
                  <code>vite.config.ts</code>
                </td>
                <td>build imposé par le SDK</td>
                <td>non</td>
              </tr>
              <tr>
                <td>
                  <code>package.json</code>
                </td>
                <td>scripts et dépendances</td>
                <td>rarement</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Step>

      <Step n={4} title="Lancer le projet en local">
        <Code>{`npm run dev`}</Code>
        <p>
          Ouvrez <strong>http://localhost:4500</strong>. Remplissez le formulaire (nom et email
          fictifs), puis discutez. Le harness simule l&apos;hôte : aucune base, aucun réseau.
        </p>
        <ul>
          <li>
            <code>?phase=chat</code> : démarre directement dans la discussion.
          </li>
          <li>
            <code>?consent=0</code> : lien sans consentement.
          </li>
          <li>
            <code>?titre=Mon%20titre</code> : surcharge un paramètre.
          </li>
        </ul>
        <p className="hint">
          Après une modification, le build se relance, mais la page ne se recharge pas toute seule :
          appuyez sur <strong>F5</strong>.
        </p>
      </Step>

      <Step n={5} title="Lire l'entrée (une ligne)">
        <p>
          Tout le squelette du Custom Element est géré par le SDK. Votre entrée ne fait
          qu&apos;enregistrer le composant :
        </p>
        <Code>{ENTRY}</Code>
        <ul>
          <li>
            <code>css</code> est une chaîne (import <code>?inline</code>) injectée dans le Shadow
            DOM.
          </li>
          <li>
            Le nom doit être identique à <code>ui.element</code> dans le manifeste.
          </li>
        </ul>
      </Step>

      <Step n={6} title="Déclarer un paramètre">
        <p>
          Un paramètre est une variable réglable <strong>par lien</strong>, sans nouvelle version.
          Ajoutez <code>couleur</code> dans <code>src/manifest.ts</code> :
        </p>
        <Code>{MANIFEST}</Code>
        <ul>
          <li>
            <code>default</code> est <strong>obligatoire</strong> : c&apos;est le repli.
          </li>
          <li>
            Types disponibles : <code>string</code>, <code>text</code>, <code>number</code>,{" "}
            <code>boolean</code>, <code>color</code>, <code>url</code>, <code>select</code>.
          </li>
          <li>Maximum 40 paramètres, 16 Ko de schéma.</li>
        </ul>
      </Step>

      <Step n={7} title="Utiliser le paramètre dans l'interface">
        <p>
          <code>useTemplate()</code> donne <code>params</code>, déjà résolu (valeurs du lien ou
          défauts). Modifiez <code>src/Aurora.jsx</code> :
        </p>
        <Code>{AURORA}</Code>
        <p>
          Enregistrez puis rechargez <strong>http://localhost:4500/?couleur=%23c0392b</strong> : les
          titres passent en rouge. Sans paramètre, le défaut s&apos;applique.
        </p>
      </Step>

      <Step n={8} title="Ajouter un test">
        <p>
          Ajoutez ce test dans <code>tests/template.test.jsx</code> (le fichier importe déjà
          l&apos;entrée) :
        </p>
        <Code>{TEST}</Code>
        <Code>{`npm test`}</Code>
        <p className="hint">
          Attendu : <code>Test Files 1 passed</code>. Les helpers montent le vrai élément et
          poussent un contexte complet.
        </p>
      </Step>

      <Step n={9} title="Construire le bundle">
        <Code>{`npm run build`}</Code>
        <p>Le build produit deux fichiers :</p>
        <ul>
          <li>
            <code>dist/index.js</code> — le template (React inclus) ;
          </li>
          <li>
            <code>onirtech.template.json</code> — le manifeste final, avec <code>ui.entry</code> et
            l&apos;intégrité SRI.
          </li>
        </ul>
        <p className="hint">
          Ne modifiez pas <code>onirtech.template.json</code> à la main : il est régénéré à chaque
          build.
        </p>
      </Step>

      <Step n={10} title="Valider et empaqueter">
        <Code>{`npm run validate
npm run pack`}</Code>
        <p>
          <code>validate</code> vérifie le manifeste, l&apos;entrée, l&apos;élément et
          l&apos;intégrité. <code>pack</code> crée l&apos;archive :
        </p>
        <Code>{`release/mon-premier-template-1.0.0.onirtech-template`}</Code>
        <p>
          L&apos;archive contient le bundle, le manifeste et le fichier de release (sha256).
          C&apos;est elle que vous importez.
        </p>
      </Step>

      <Step n={11} title="Importer et rattacher à un lien">
        <ol>
          <li>
            Panneau → <strong>Templates visuels</strong> → <strong>Importer</strong> → choisir
            l&apos;archive.
          </li>
          <li>Ouvrir le lien concerné → choisir le template et sa version.</li>
          <li>
            Renseigner les <strong>paramètres</strong> (titre, couleur), puis{" "}
            <strong>Aperçu avec ces valeurs</strong>.
          </li>
          <li>Enregistrer, puis ouvrir le lien public.</li>
        </ol>
        <p className="hint">
          Une version importée est immuable : pour corriger, publiez une nouvelle version (étape
          12).
        </p>
      </Step>

      <Step n={12} title="Publier une mise à jour (et variantes)">
        <p>
          Changez <code>version</code> dans <code>src/manifest.ts</code> (c&apos;est la source de
          vérité, pas <code>package.json</code>), puis :
        </p>
        <Code>{`npm run build
npm run validate
npm run pack`}</Code>
        <p>
          Réimportez l&apos;archive <code>1.1.0</code> et sélectionnez la nouvelle version sur le
          lien. L&apos;ancienne reste intacte.
        </p>
        <h3>Variante vanilla (HTML/CSS/JS, sans build)</h3>
        <p>
          <code>--stack vanilla</code> : les styles sont dans <code>src/styles.js</code> (constante{" "}
          <code>CSS</code>) et le manifeste est un JSON. L&apos;entrée utilise{" "}
          <code>defineTemplate</code> :
        </p>
        <Code>{VANILLA}</Code>
        <p>
          Scripts : <code>npm run dev</code>, <code>npm test</code>, <code>npm run validate</code>,{" "}
          <code>npm run pack</code> — <strong>pas de build</strong>.
        </p>
        <h3>Variante Vue</h3>
        <p>
          <code>--stack vue</code> : le composant est un SFC et le composable remplace le hook.
        </p>
        <Code>{VUE}</Code>
        <p>
          Build et scripts identiques à React. L&apos;entrée utilise <code>defineVueTemplate</code>{" "}
          (généré).
        </p>
      </Step>

      <h2 id="recap">Récapitulatif</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Étape</th>
              <th>Commande</th>
              <th>Résultat attendu</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Créer</td>
              <td>
                <code>npx @onirtech/create-onirtech-template …</code>
              </td>
              <td>dossier complet</td>
            </tr>
            <tr>
              <td>Installer</td>
              <td>
                <code>npm install</code>
              </td>
              <td>0 vulnérabilité</td>
            </tr>
            <tr>
              <td>Développer</td>
              <td>
                <code>npm run dev</code>
              </td>
              <td>http://localhost:4500</td>
            </tr>
            <tr>
              <td>Tester</td>
              <td>
                <code>npm test</code>
              </td>
              <td>tests verts</td>
            </tr>
            <tr>
              <td>Construire</td>
              <td>
                <code>npm run build</code>
              </td>
              <td>
                <code>dist/index.js</code> + manifeste
              </td>
            </tr>
            <tr>
              <td>Valider</td>
              <td>
                <code>npm run validate</code>
              </td>
              <td>
                <code>✓ … valide (web-component)</code>
              </td>
            </tr>
            <tr>
              <td>Empaqueter</td>
              <td>
                <code>npm run pack</code>
              </td>
              <td>
                archive dans <code>release/</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="depannage">Dépannage</h2>
      <dl className="doc-faq">
        <dt>
          <code>npm run build</code> échoue : « Cannot find module &apos;react&apos; ».
        </dt>
        <dd>
          Lancez <code>npm install</code> dans le projet (les dépendances ne sont pas installées).
        </dd>
        <dt>Erreur navigateur « process is not defined » (écran blanc).</dt>
        <dd>
          Ancien SDK : mettez à jour avec <code>npm install @onirtech/template-sdk@latest</code>{" "}
          (0.1.3+), puis <code>npm run build</code>. Le build définit désormais{" "}
          <code>process.env.NODE_ENV</code>.
        </dd>
        <dt>Erreur Vite « transformWithEsbuild » ou « esbuild ».</dt>
        <dd>
          Mettez à jour le SDK : <code>npm install @onirtech/template-sdk@latest</code> (0.1.2+
          utilise <code>transformWithOxc</code>).
        </dd>
        <dt>L&apos;élément ne s&apos;affiche pas dans le harness.</dt>
        <dd>
          Vérifiez que <code>ui.element</code> dans le manifeste est exactement le nom passé à{" "}
          <code>defineReactTemplate</code> / <code>defineTemplate</code>.
        </dd>
        <dt>Les styles ne s&apos;appliquent pas.</dt>
        <dd>
          Importez le CSS en <code>?inline</code> et passez-le à l&apos;option <code>css</code>.
        </dd>
        <dt>
          <code>params.couleur</code> est <code>undefined</code>.
        </dt>
        <dd>
          Le paramètre n&apos;est pas déclaré dans <code>params</code>, ou le harness n&apos;a pas
          de valeur : gardez un repli (<code>?? &quot;#023777&quot;</code>).
        </dd>
        <dt>« Invalid hook call ».</dt>
        <dd>
          Deux copies de React sont chargées : supprimez <code>node_modules</code> et relancez{" "}
          <code>npm install</code>.
        </dd>
      </dl>

      <p className="hint">
        Référence complète de l&apos;API : <a href="/documentation/sdk">documentation du SDK</a>.
        Contrat des templates : <a href="/documentation/templates-visuels">templates visuels</a>.
        Traitement des messages :{" "}
        <a href="/documentation/actions">les actions d&apos;un template</a>.
      </p>
    </Doc>
  );
}
