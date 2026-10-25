import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocCode } from "@/components/documentation/DocCode";
import { TEMPLATE_CAPABILITIES, type TemplateCapability } from "@/domain/entities/visual-template";
import { TEMPLATE_PARAM_TYPES, type TemplateParamType } from "@/domain/template-params";

export const metadata: Metadata = {
  title: "Documentation — Templates visuels",
};

/** Description de chaque capacité (le tableau est généré depuis le domaine). */
const CAPABILITY_DESCRIPTIONS: Record<TemplateCapability, { text: string; field: string }> = {
  messages: { text: "Historique de la conversation", field: "ctx.state.messages" },
  media: { text: "Photos et liens proposés", field: "ctx.resources.media" },
  modelForm: { text: "Champs du modèle de raisonnement", field: "ctx.resources.modelForm" },
  theme: { text: "Tokens de thème du lien", field: "ctx.theme" },
  userState: {
    text: "État du visiteur par message (capacité ET option du lien)",
    field: "message.userState",
  },
  knowledge: {
    text: "Connaissances utilisées par l'assistant (capacité ET source active)",
    field: "message.knowledge",
  },
  attachments: {
    text: "Pièces jointes des champs fichier (ADR-0034)",
    field: "ctx.state.pendingAttachments / message.attachments",
  },
  data: {
    text: "Ressources de données déclarées par contrat (ADR-0026)",
    field: "ctx.data.load(contract)",
  },
};

/** Description de chaque type de paramètre (généré depuis le domaine). */
const PARAM_TYPE_DESCRIPTIONS: Record<TemplateParamType, string> = {
  string: "Texte court (une ligne).",
  text: "Texte long (plusieurs lignes).",
  number: "Nombre, avec min / max optionnels.",
  boolean: "Vrai / faux (interrupteur).",
  color: "Couleur #rrggbb (sélecteur).",
  url: "URL http(s).",
  select: "Choix parmi les options déclarées.",
};

const MANIFEST_EXAMPLE = `{
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
    "integrity": "sha256-…",
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
    },
    {
      "key": "couleur",
      "label": "Couleur principale",
      "description": "Couleur des titres et des boutons",
      "type": "color",
      "default": "#023777"
    }
  ]
}`;

const CONTEXT_EXAMPLE = `type ContexteTemplate = {
  host: { protocol: "onirtech.template-host.v1"; version: 1 };
  link: { type: "standard" | "specifique"; label: string; userStateEnabled: boolean };
  locale: string;
  brand: { name: string; logoUrl: string | null };
  theme: Readonly<Record<string, string>>;
  params: Readonly<Record<string, string | number | boolean>>;
  capabilities: readonly string[];
  consent: { texte: string; lien: string } | null;
  state: {
    phase: "identity" | "chat";
    status: "en_cours" | "finalisee";
    messages: { id: string; role: "user" | "assistant"; content: string;
                medias: { type: "photo" | "lien"; libelle: string; url: string }[];
                at: string; userState?: { label: string; confidence: number };
                knowledge?: { ref: string; titre: string }[] }[];
    typing: boolean;
  };
  resources: {
    media: { photos: { id: string; libelle: string; url: string }[];
             liens: { id: string; libelle: string; url: string }[] };
    modelForm: { name: string; label: string; type: string; required: boolean;
                 options?: string[] }[] | null;
  };
};`;

const PARAMS_EXAMPLE = `// Déclaration (manifeste)
"params": [
  { "key": "titre_de_livre", "label": "Titre du livre",
    "description": "Titre affiché sur la couverture de l'album",
    "type": "string", "default": "album", "maxLength": 60 }
]

// Lecture (template) — le défaut du manifeste sert de repli
const titre = ctx.params?.titre_de_livre ?? "album";`;

const EXAMPLE_MANIFEST = `{
  "schemaVersion": 1,
  "kind": "template",
  "id": "aurora",
  "name": "Aurora",
  "description": "Exemple complet : formulaire puis chat, deux paramètres.",
  "version": "1.0.0",
  "publisher": { "id": "onirtech", "name": "ONIRTECH", "trustLevel": "official" },
  "compatibility": { "hostProtocol": "onirtech.template-host.v1" },
  "ui": {
    "mode": "web-component",
    "entry": "./index.js",
    "element": "onirtech-template-aurora",
    "integrity": "sha256-…",
    "shadowDom": "open"
  },
  "capabilities": ["messages", "theme"],
  "network": [],
  "params": [
    { "key": "titre", "label": "Titre", "description": "Titre du chat",
      "type": "string", "default": "Discutons de votre projet", "maxLength": 80 },
    { "key": "couleur", "label": "Couleur principale", "description": "Titres et boutons",
      "type": "color", "default": "#023777" }
  ]
}`;

const EXAMPLE_ENTRY = `const ELEMENT = "onirtech-template-aurora";

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

class Aurora extends HTMLElement {
  #root = this.attachShadow({ mode: "open" });
  #ctx = null;

  set onirtechContext(ctx) { this.#ctx = ctx; this.#render(); }
  get onirtechContext() { return this.#ctx; }
  connectedCallback() { this.#render(); }

  #render() {
    const ctx = this.#ctx;
    if (!ctx) return;
    const titre = ctx.params?.titre ?? "Discutons de votre projet";
    const couleur = ctx.params?.couleur ?? "#023777";
    this.#root.replaceChildren(
      this.#style(couleur),
      h("h2", { text: titre }),
      ctx.state.phase === "identity" ? this.#identite(ctx) : this.#chat(ctx),
    );
  }

  #style(couleur) {
    const style = document.createElement("style");
    style.textContent = \`
      :host { display:block; font-family:system-ui,sans-serif; color:#0b2247; }
      .wrap { max-width:32rem; margin:0 auto; padding:1.25rem; }
      form, .composer { display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.75rem; }
      input { flex:1 1 12rem; padding:.6rem .7rem; border:1px solid #cfd4de;
              border-radius:.5rem; font:inherit; }
      button { background:\${couleur}; color:#fff; border:0; border-radius:.5rem;
               padding:.6rem 1rem; font:inherit; cursor:pointer; }
      ul { list-style:none; padding:0; display:flex; flex-direction:column; gap:.5rem; }
      li { background:#f1f5f9; border-radius:.5rem; padding:.55rem .75rem; }
      li.user { background:#e2e8f0; }
    \`;
    return style;
  }

  #identite(ctx) {
    const nom = h("input", { type: "text", placeholder: "Votre nom", "aria-label": "Nom" });
    const email = h("input", { type: "email", placeholder: "vous@exemple.mg", "aria-label": "Email" });
    const consentement = h("input", { type: "checkbox" });
    const form = h("form", {
      onsubmit: (event) => {
        event.preventDefault();
        if (nom.value.trim() === "" || email.value.trim() === "") return;
        ctx.actions.submitIdentity({
          nom: nom.value.trim(),
          email: email.value.trim(),
          consentement: consentement.checked,
        });
      },
    },
      nom,
      email,
      ctx.consent
        ? h("label", { class: "consent" }, consentement, " ", ctx.consent.texte)
        : null,
      h("button", { type: "submit", text: "Démarrer la discussion" }),
    );
    return h("section", { class: "wrap" }, form);
  }

  #chat(ctx) {
    const liste = h("ul", {},
      ...ctx.state.messages.map((message) =>
        h("li", { class: message.role }, message.content)));
    const champ = h("input", { type: "text", placeholder: "Votre message…", "aria-label": "Message" });
    const envoyer = () => {
      if (champ.value.trim() === "") return;
      ctx.actions.sendMessage(champ.value.trim());
      champ.value = "";
    };
    return h("section", { class: "wrap" },
      liste,
      ctx.state.typing ? h("p", { text: "…" }) : null,
      h("div", { class: "composer" },
        champ,
        h("button", { type: "button", text: "Envoyer", onclick: envoyer })),
    );
  }
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, Aurora);`;

const START_COMMANDS = `# 1. créer un template à partir de la référence
node bin/create-onirtech-template.mjs mon-template
cd mon-template

# 2. développer en local (hôte simulé, données MOCK, hors-ligne)
node ../harness/host.mjs --dir .        # → http://localhost:4500

# 3. valider le manifeste, l'entrée et l'intégrité SRI
node ../bin/onirtech-template.mjs validate .

# 4. empaqueter
node ../bin/onirtech-template.mjs pack .
# → release/mon-template-1.0.0.onirtech-template`;

function Doc({ children }: { children: ReactNode }) {
  return <section className="doc">{children}</section>;
}

function Code({ children }: { children: string }) {
  return <DocCode>{children}</DocCode>;
}

/** Documentation développeur des templates visuels (page cœur). */
export default function TemplateDocsPage() {
  return (
    <Doc>
      <div className="page-head">
        <div>
          <span className="eyebrow">Documentation</span>
          <h1 className="text-title">Créer un template visuel</h1>
          <p className="hint">
            Interface publique du chat et du formulaire de prospection — contrat{" "}
            <code>onirtech.template-host.v1</code>.
          </p>
        </div>
      </div>

      <div className="doc-callout">
        <strong>SDK JavaScript des templates — v0.1.3 publié sur npm.</strong>
        <p>
          Le SDK <code>@onirtech/template-sdk</code> 0.1.3 permet de créer un template en React, Vue
          ou HTML/CSS/JS sans écrire le squelette du Custom Element :{" "}
          <code>npm install @onirtech/template-sdk</code>. Créez un projet avec{" "}
          <code>npx @onirtech/create-onirtech-template aurora --stack react</code>.{" "}
          <a href="/documentation/sdk">Voir le workflow développeur complet</a>.
        </p>
      </div>

      <h2>1. Ce qu&apos;est un template visuel</h2>
      <p>
        Un template visuel est un <strong>package UI-only</strong> : un manifeste (
        <code>onirtech.template.json</code>) et des assets, rendus chez le visiteur sur la page
        publique <code>/l/&lt;jeton&gt;</code>. Le dashboard l&apos;installe, le rattache à un lien
        de chat et le sert avec une version figée.
      </p>
      <ul>
        <li>
          Un lien de chat utilise <strong>un</strong> template et <strong>une</strong> version.
        </li>
        <li>
          Une version publiée est <strong>immuable</strong> : toute modification produit une
          nouvelle version.
        </li>
        <li>
          Deux transports : <strong>Web Component</strong> (publisher <code>official</code> ou{" "}
          <code>verified</code>) et <strong>iframe sandboxée</strong> (<code>community</code>).
        </li>
        <li>
          Le template lit un contexte fourni par l&apos;hôte et déclenche des actions ; il ne
          contient aucun secret.
        </li>
      </ul>

      <h2>2. Ce qui est faisable aujourd&apos;hui</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Fonctionnalité</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Formulaire d&apos;identification (lien standard)</td>
              <td>
                <code>ctx.state.phase === &quot;identity&quot;</code> +{" "}
                <code>ctx.actions.submitIdentity()</code>
              </td>
            </tr>
            <tr>
              <td>Discussion</td>
              <td>
                <code>ctx.state.messages</code> + <code>ctx.actions.sendMessage()</code>
              </td>
            </tr>
            <tr>
              <td>Consentement</td>
              <td>
                <code>ctx.consent</code> (texte + lien de la politique du lien)
              </td>
            </tr>
            <tr>
              <td>Photos et liens proposés</td>
              <td>
                <code>ctx.resources.media</code> (capacité <code>media</code>), ouverture via{" "}
                <code>ctx.actions.openMedia(url)</code>
              </td>
            </tr>
            <tr>
              <td>Champs du modèle de raisonnement</td>
              <td>
                <code>ctx.resources.modelForm</code> (capacité <code>modelForm</code>)
              </td>
            </tr>
            <tr>
              <td>Thème du lien</td>
              <td>
                <code>ctx.theme</code> (capacité <code>theme</code>)
              </td>
            </tr>
            <tr>
              <td>Paramètres du template</td>
              <td>
                <code>ctx.params</code> — voir §8
              </td>
            </tr>
            <tr>
              <td>État du visiteur / connaissances</td>
              <td>
                <code>message.userState</code> (capacité <code>userState</code>),{" "}
                <code>message.knowledge</code> (capacité <code>knowledge</code>)
              </td>
            </tr>
            <tr>
              <td>Terminer la discussion</td>
              <td>
                <code>ctx.actions.finish()</code>
              </td>
            </tr>
            <tr>
              <td>Redimensionner l&apos;iframe</td>
              <td>
                <code>ctx.actions.resize(height)</code> (transport iframe)
              </td>
            </tr>
            <tr>
              <td>Technologie front libre</td>
              <td>
                Vanilla, framework embarqué… dès lors que le bundle enregistre le Custom Element
                déclaré.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="hint">
        Les appels réseau et les écritures passent par les <strong>actions</strong> du contrat : le
        template ne dialogue pas directement avec l&apos;API du dashboard.
      </p>

      <h2>3. Démarrage en 5 minutes</h2>
      <p>
        Le kit fournit un <strong>hôte simulé</strong> (harness) qui implémente le côté hôte avec
        des données MOCK : le développement est hors-ligne, sans base ni lien.
      </p>
      <Code>{START_COMMANDS}</Code>
      <p className="hint">
        Après une modification, rechargez la page du harness. URLs utiles : <code>?phase=chat</code>{" "}
        (saute le formulaire) et <code>?consent=0</code> (sans consentement).
      </p>

      <h2>4. Le manifeste</h2>
      <Code>{MANIFEST_EXAMPLE}</Code>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Règle</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>schemaVersion</code> / <code>kind</code>
              </td>
              <td>
                <code>1</code> / <code>&quot;template&quot;</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>id</code>
              </td>
              <td>
                kebab-case <code>^[a-z][a-z0-9-]*$</code>, unique (namespace du template)
              </td>
            </tr>
            <tr>
              <td>
                <code>version</code>
              </td>
              <td>SemVer ; une version publiée ne change plus</td>
            </tr>
            <tr>
              <td>
                <code>publisher.trustLevel</code>
              </td>
              <td>
                <code>official</code> | <code>verified</code> | <code>community</code> ;{" "}
                <code>community</code> impose le mode iframe
              </td>
            </tr>
            <tr>
              <td>
                <code>compatibility.hostProtocol</code>
              </td>
              <td>
                <code>onirtech.template-host.v1</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>ui.mode</code>
              </td>
              <td>
                <code>web-component</code> | <code>iframe</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>ui.entry</code> / <code>ui.element</code>
              </td>
              <td>
                chemin relatif sûr / nom du Custom Element (kebab-case), effectivement enregistré
                par l&apos;entrée
              </td>
            </tr>
            <tr>
              <td>
                <code>ui.integrity</code>
              </td>
              <td>
                SRI <code>sha256-…</code> de l&apos;entrée, calculé par <code>pack</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>ui.shadowDom</code>
              </td>
              <td>
                <code>open</code> | <code>closed</code> | <code>none</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>capabilities</code>
              </td>
              <td>sous-ensemble du vocabulaire du §6</td>
            </tr>
            <tr>
              <td>
                <code>network</code>
              </td>
              <td>domaines externes utilisés par le template (déclaration)</td>
            </tr>
            <tr>
              <td>
                <code>params</code>
              </td>
              <td>variables paramétrables (§8), optionnel</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>5. Le contrat runtime</h2>
      <p>
        Le template reçoit un objet <strong>contexte</strong> en lecture. Il est réassigné à chaque
        évolution (message, saisie, état) : rendez toujours l&apos;interface à partir du contexte
        courant.
      </p>
      <Code>{CONTEXT_EXAMPLE}</Code>

      <h3>Transport Web Component</h3>
      <p>
        L&apos;hôte crée l&apos;élément puis affecte la propriété <code>onirtechContext</code> (et
        la réaffecte à chaque mise à jour) :
      </p>
      <Code>{`set onirtechContext(ctx) { this.#ctx = ctx; this.#render(); }`}</Code>

      <h3>Transport iframe</h3>
      <p>
        L&apos;hôte poste <code>{`{ __onirtech: 1, type: "init", context }`}</code> dans
        l&apos;iframe et le template répond par <code>{`{ __onirtech: 1, action, payload }`}</code>.
      </p>

      <h3>Cycle de vie</h3>
      <ul>
        <li>
          <code>identity</code> : formulaire (nom, email, consentement) →{" "}
          <code>ctx.actions.submitIdentity()</code>.
        </li>
        <li>
          <code>chat</code> : historique et saisie → <code>ctx.actions.sendMessage()</code>.
        </li>
        <li>
          <code>ctx.actions.finish()</code> clôt la discussion.
        </li>
        <li>
          <code>ctx.state.typing</code> indique qu&apos;une réponse est en cours.
        </li>
      </ul>

      <h2>6. Capacités</h2>
      <p>
        Une donnée n&apos;est fournie que si la capacité est <strong>déclarée</strong> dans le
        manifeste.
      </p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Capacité</th>
              <th>Donnée fournie</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_CAPABILITIES.map((capability) => (
              <tr key={capability}>
                <td>
                  <code>{capability}</code>
                </td>
                <td>
                  {CAPABILITY_DESCRIPTIONS[capability].text} —{" "}
                  <code>{CAPABILITY_DESCRIPTIONS[capability].field}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        <code>userState</code> et <code>knowledge</code> exigent en plus l&apos;option
        correspondante sur le lien (état du visiteur activé / source connaissances cochée).
      </p>

      <h2>7. Actions</h2>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Payload</th>
              <th>Contrôles</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>submitIdentity</code>
              </td>
              <td>
                <code>{`{ nom, email, contacts?, consentement? }`}</code>
              </td>
              <td>nom requis, email valide</td>
            </tr>
            <tr>
              <td>
                <code>sendMessage</code>
              </td>
              <td>
                <code>{`{ content }`}</code>
              </td>
              <td>non vide, 4 000 caractères maximum</td>
            </tr>
            <tr>
              <td>
                <code>finish</code>
              </td>
              <td>—</td>
              <td>—</td>
            </tr>
            <tr>
              <td>
                <code>request</code>
              </td>
              <td>
                <code>{`{ capability }`}</code>
              </td>
              <td>
                renvoie <code>media</code>, <code>modelForm</code> ou <code>theme</code>
              </td>
            </tr>
            <tr>
              <td>
                <code>openMedia</code>
              </td>
              <td>
                <code>{`{ url }`}</code>
              </td>
              <td>
                <code>http(s)</code> uniquement
              </td>
            </tr>
            <tr>
              <td>
                <code>resize</code>
              </td>
              <td>
                <code>{`{ height }`}</code>
              </td>
              <td>transport iframe</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>8. Variables paramétrables</h2>
      <p>
        Le template déclare des variables dans son manifeste ; l&apos;exploitant du lien les
        renseigne dans <strong>Liens → Modifier → Paramètres du template</strong>. Elles arrivent
        résolues dans <code>ctx.params</code> (objet gelé).
      </p>
      <Code>{PARAMS_EXAMPLE}</Code>
      <p>Chaque paramètre déclare :</p>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Champ</th>
              <th>Règle</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>key</code> / <code>label</code>
              </td>
              <td>clé unique (kebab/snake), libellé 1..80</td>
            </tr>
            <tr>
              <td>
                <code>description</code>
              </td>
              <td>aide affichée sous le champ (0..200)</td>
            </tr>
            <tr>
              <td>
                <code>default</code>
              </td>
              <td>
                <strong>obligatoire</strong> (aucun paramètre sans défaut)
              </td>
            </tr>
            <tr>
              <td>
                <code>maxLength</code> / <code>min</code> / <code>max</code>
              </td>
              <td>bornes selon le type</td>
            </tr>
            <tr>
              <td>
                <code>options</code>
              </td>
              <td>
                pour <code>select</code> : le défaut doit être l&apos;une des valeurs
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Contrôle côté lien</th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATE_PARAM_TYPES.map((type) => (
              <tr key={type}>
                <td>
                  <code>{type}</code>
                </td>
                <td>{PARAM_TYPE_DESCRIPTIONS[type]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul>
        <li>
          Valeur absente ou invalide ⇒ le <strong>défaut</strong> est appliqué.
        </li>
        <li>
          Les valeurs sont <strong>publiques</strong> (visibles par le visiteur) : jamais de secret.
        </li>
        <li>
          Le bouton <strong>« Aperçu avec ces valeurs »</strong> teste une valeur sans
          l&apos;enregistrer.
        </li>
      </ul>

      <h2>9. Exemple de template complet</h2>
      <p>
        Un template minimal mais complet : formulaire, consentement, chat, et deux paramètres
        (titre, couleur). Fichiers : <code>onirtech.template.json</code> + <code>index.js</code>.
      </p>
      <h3>onirtech.template.json</h3>
      <Code>{EXAMPLE_MANIFEST}</Code>
      <h3>index.js</h3>
      <Code>{EXAMPLE_ENTRY}</Code>
      <p className="hint">
        Le kit fournit aussi un template de référence minimal (<code>template/</code>) et un exemple
        avancé 3D (<code>template-immersive/</code>), utile pour les assets lourds, la 3D et les
        paramètres.
      </p>

      <h2>10. Bonnes pratiques</h2>
      <ol>
        <li>
          <strong>Rendez depuis le contexte</strong> à chaque assignation ; ne conservez pas un état
          local qui ferait autorité sur les messages ou la phase.
        </li>
        <li>
          <strong>Passez par les actions</strong> (<code>ctx.actions.*</code>) : pas d&apos;appel
          direct à l&apos;API du dashboard.
        </li>
        <li>
          <strong>Shadow DOM et CSS scopé</strong> : ne stylez pas la page hôte.
        </li>
        <li>
          <strong>Accessibilité</strong> : labels explicites, navigation clavier, focus visible,
          contrastes suffisants.
        </li>
        <li>
          <strong>Mobile</strong> : zones tactiles confortables, textes lisibles, mise en page
          fluide.
        </li>
        <li>
          <strong>Assets dans le bundle</strong> : ils sont servis avec la version, en cache
          immuable.
        </li>
        <li>
          <strong>Premier rendu rapide</strong> : différez les chargements lourds ; pour la 3D,
          respectez les budgets de l&apos;ADR-0021.
        </li>
        <li>
          <strong>Valeurs affichées en texte</strong> : n&apos;injectez jamais un contenu du
          contexte via <code>innerHTML</code>.
        </li>
        <li>
          <strong>Aucun secret</strong> dans le bundle : tout est public.
        </li>
        <li>
          <strong>Vérifiez les deux phases</strong> (identité et chat), le consentement, les
          messages vides et les textes longs avant de packager.
        </li>
      </ol>

      <h2>11. Tester et déboguer</h2>
      <ul>
        <li>
          Le harness simule les actions : <code>submitIdentity</code> passe en phase chat, une
          réponse mock arrive après ~600 ms, <code>finish</code> clôt la discussion.
        </li>
        <li>
          Ouvrez les DevTools et inspectez le shadow root de votre élément pour vérifier le rendu.
        </li>
        <li>
          Si l&apos;élément ne monte pas : vérifiez le nom d&apos;élément, le chemin d&apos;entrée
          et relancez <code>pack</code> (l&apos;intégrité SRI doit être à jour).
        </li>
        <li>
          Si une donnée manque : vérifiez qu&apos;elle est bien déclarée dans{" "}
          <code>capabilities</code>.
        </li>
      </ul>

      <h2>12. Publier et rattacher</h2>
      <ol>
        <li>
          Importez l&apos;archive <code>.onirtech-template</code> dans{" "}
          <strong>Templates visuels</strong>.
        </li>
        <li>Créez ou modifiez un lien de chat, choisissez le template et sa version.</li>
        <li>
          Renseignez les <strong>paramètres</strong>, puis utilisez{" "}
          <strong>Aperçu avec ces valeurs</strong>.
        </li>
        <li>
          Pour une nouvelle version, incrémentez <code>version</code>, repackagez, importez et
          sélectionnez la nouvelle version sur le lien.
        </li>
      </ol>

      <h2>13. Références</h2>
      <ul>
        <li>
          Norme <code>docs/templates-visuels/norme-v1.md</code> (contrat complet).
        </li>
        <li>
          ADR-0019 (packages UI-only), ADR-0020 (capacités cœur), ADR-0023 (variables
          paramétrables).
        </li>
        <li>
          <a href="/documentation/sdk">SDK des templates</a> (ADR-0024) — workflow React, Vue et
          HTML/CSS/JS.
        </li>
        <li>
          <a href="/documentation/actions">Actions d&apos;un template</a> — identité, envoi, fin et
          traitement côté hôte.
        </li>
        <li>
          Kit : <code>template-kit/</code> (scaffolder, harness, starter, exemple immersif).
        </li>
      </ul>

      <h2>14. Questions fréquentes</h2>
      <dl className="doc-faq">
        <dt>Mon Custom Element ne s&apos;affiche pas.</dt>
        <dd>
          Vérifiez <code>ui.element</code>, le chemin <code>ui.entry</code> et relancez{" "}
          <code>pack</code> pour recalculer l&apos;intégrité.
        </dd>
        <dt>Le contexte est vide.</dt>
        <dd>La donnée n&apos;est fournie que si la capacité est déclarée dans le manifeste.</dd>
        <dt>Mes modifications n&apos;apparaissent pas.</dt>
        <dd>
          Une version est immuable : incrémentez <code>version</code>, repackagez et importez.
        </dd>
        <dt>
          <code>ctx.params</code> est absent dans le harness.
        </dt>
        <dd>
          Le mock ne fournit pas de paramètres : lisez{" "}
          <code>ctx.params?.clé ?? &quot;défaut&quot;</code>.
        </dd>
      </dl>
    </Doc>
  );
}
