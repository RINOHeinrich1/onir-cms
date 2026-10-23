# Norme des Templates visuels — v1 (`onirtech.template-host.v1`)

> Référence développeur **officielle**. Gouvernée par l'ADR-0019.
> Inspiration : ONIRIA V3 (`oniria.package-host.v1`), **réduite au frontend**.
> Une version publiée est **immuable**.

Un **template visuel** personnalise l'interface **publique** du chat et du
formulaire de prospection (`/l/<token>`). C'est un **package UI-only** : il **décrit
et rend** l'interface ; il ne parle **jamais** à la base ni à l'API directement — il
**émet des actions** que l'hôte exécute.

---

## 1. Vocabulaire

- **Hôte** : la page `/l/<token>` du dashboard (possède la session, appelle l'API).
- **Template** : le code tiers (bundle) qui rend l'UI.
- **Contexte** : l'objet **gelé** injecté par l'hôte dans le template (état +
  ressources + actions).
- **Capacité** : une ressource de l'hôte que le template déclare vouloir utiliser.
- **Transport** : comment le contexte/les actions circulent (`web-component` ou
  `iframe`). Le **contrat logique est identique**.

---

## 2. Structure du bundle

```text
mon-template/
├── onirtech.template.json   # manifeste (obligatoire, racine)
├── index.js                 # entry (bundle ESM enregistrant le Custom Element)
├── preview.png              # aperçu 16:9 du catalogue (optionnel)
├── styles.css               # (optionnel)
└── assets/…                 # images, polices (optionnel)
```

L'archive distribuée est `release/<id>-<version>.onirtech-template` (ZIP),
accompagnée de `release/<id>-<version>.release.json` (SHA-256 du bundle, liste des
assets + hash, `hostProtocol`).

Si `preview.png` (ou `assets/preview.png`) est présent, il est utilisé comme
aperçu du template dans le catalogue et sur sa fiche.

---

## 3. Manifeste `onirtech.template.json`

```json
{
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
    "integrity": "sha256-AAAA…",
    "shadowDom": "open"
  },
  "capabilities": ["messages", "media", "modelForm", "theme"],
  "network": [],
  "params": [
    {
      "key": "titre_de_livre",
      "label": "Titre du livre",
      "description": "Titre affiché sur la couverture de l'album",
      "type": "string",
      "default": "album",
      "maxLength": 60
    }
  ]
}
```

### Règles
- `schemaVersion` = `1` ; `kind` = `"template"`.
- `id` : **kebab-case** `^[a-z][a-z0-9-]*$`, **unique**, sert de namespace. Le
  renommer = créer un autre template.
- `version` : **SemVer** ; une version publiée est **immuable** (toute modif incrémente).
- `publisher.trustLevel` : `official` | `verified` | `community` (détermine le
  **transport** autorisé, section 6).
- `compatibility.hostProtocol` : `"onirtech.template-host.v1"` (contrat supporté).
- `ui.mode` : `"web-component"` (confiance) ou `"iframe"` (community).
- `ui.entry` : chemin **relatif sûr** (pas d'absolu, pas de `..`).
- `ui.element` : kebab-case ; un Custom Element **doit** être enregistré par le bundle
  (vérifié au `validate`).
- `ui.integrity` : **SRI** `sha256-<base64>` du bundle final (calculé au build, **jamais**
  copié d'un exemple).
- `ui.shadowDom` : `open` | `closed` | `none` (mode WC).
- `capabilities` : sous-ensemble de `messages`, `media`, `modelForm`, `theme`,
  `userState`, `knowledge` (une capacité non déclarée n'est **pas** fournie).
  `userState` et `knowledge` sont des **extensions additives** (ADR-0020, §11).
- `network` : liste de domaines externes autorisés — **vide par défaut**.
- `params` : variables **paramétrables par lien** (ADR-0023, §12) — optionnel,
  `[]` par défaut.

> Champs **non repris** pour l'instant (présents dans ONIRIA V3 mais inutiles ici) :
> `views`, `navigation`, `intentions`, `resources`, `migrations`,
> `serviceDependencies`, `sdkVersion`, `basePath`.

---

## 4. Types du contrat

```ts
export type TemplateTrustLevel = "official" | "verified" | "community";
export type TemplateCapability =
  | "messages"
  | "media"
  | "modelForm"
  | "theme"
  | "userState"     // extension additive (ADR-0020)
  | "knowledge";    // extension additive (ADR-0020)

export type TemplateMessageMedia = {
  type: "photo" | "lien";
  libelle: string;
  url: string;          // photo : URL interne ; lien : URL externe
};

/** État du visiteur déduit (message **utilisateur**, capacité `userState`). */
export type TemplateMessageUserState = {
  label: "neutral" | "content" | "triste";
  confidence: number;   // 0..1
};

/** Référence de connaissance utilisée (message **assistant**, capacité `knowledge`). */
export type ConnaissanceRef = { ref: string; titre: string };

export type TemplateMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  medias: TemplateMessageMedia[];
  at: string;           // ISO 8601
  userState?: TemplateMessageUserState;   // optionnel (ADR-0020)
  knowledge?: ConnaissanceRef[];          // optionnel (ADR-0020)
};

export type TemplateMediaItem = { id: string; libelle: string; url: string };
export type TemplateFormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select" | "multi" | "url" | "email";
  required: boolean;
  options?: string[];
};

export type OnirtechTemplateContext = Readonly<{
  host: { protocol: "onirtech.template-host.v1"; version: 1 };
  link: {
    type: "standard" | "specifique";
    label: string;
    /** Flag lien : état du visiteur activé (double garde, ADR-0020). */
    userStateEnabled: boolean;
  };
  locale: string;                                   // ex. "fr"
  brand: { name: string; logoUrl: string | null };
  theme: Readonly<Record<string, string>>;          // tokens opérateur (couleurs…)
  /** Variables déclarées par le template, résolues (défauts ⊕ lien), GELÉES. */
  params: Readonly<Record<string, string | number | boolean>>;
  capabilities: readonly TemplateCapability[];
  /** Politique de confidentialité rattachée au lien (null si aucune). */
  consent: Readonly<{ texte: string; lien: string }> | null;
  state: Readonly<{
    phase: "identity" | "chat";          // formulaire d'identification ou discussion
    status: "en_cours" | "finalisee";
    messages: readonly TemplateMessage[];
    typing: boolean;
  }>;
  resources: Readonly<{
    media: Readonly<{ photos: readonly TemplateMediaItem[]; liens: readonly TemplateMediaItem[] }>;
    modelForm: readonly TemplateFormField[] | null;  // champs du modèle de raisonnement
  }>;
  actions: Readonly<{
    /** Formulaire d'identification (lien standard). */
    submitIdentity(data: {
      nom: string; email: string;
      contacts?: { type: string; valeur: string }[];
      consentement?: boolean;
    }): void;
    /** Message du visiteur. */
    sendMessage(content: string): void;
    /** Bouton « Terminer » : génère la fiche. */
    finish(): void;
    /** Rafraîchit une ressource (résout la promesse avec la donnée à jour). */
    request(capability: TemplateCapability): Promise<unknown>;
    /** Ouvre un lien média (validé/allowlisté par l'hôte). */
    openMedia(url: string): void;
    /** Ajuste la hauteur du template (iframe). */
    resize(height: number): void;
  }>;
  /** Abonnement aux mises à jour (retourne une fonction de désabonnement). */
  on(event: "state" | "resources" | "error", cb: (payload: unknown) => void): () => void;
}>;
```

**Gelé** : le template ne mute pas le contexte ; il réagit aux mises à jour `on(...)`
et **appelle des actions**. Aucun secret, aucune connexion base/API n'est exposé.

---

## 5. Transport A — Web Component (`official` / `verified`)

L'hôte :
1. **vérifie l'intégrité** du bundle (SRI), puis l'importe dynamiquement ;
2. crée l'élément `ui.element` ;
3. affecte `element.onirtechContext = ctx` (et à chaque mise à jour).

```ts
class OnirtechTemplateAurora extends HTMLElement {
  #ctx?: OnirtechTemplateContext;
  #root = this.attachShadow({ mode: "open" });

  set onirtechContext(ctx: OnirtechTemplateContext) {
    this.#ctx = ctx;
    this.render();
  }
  connectedCallback() { this.render(); }
  private render() { /* rendu libre (framework au choix) */ }
}
customElements.define("onirtech-template-aurora", OnirtechTemplateAurora);
```

Le template appelle `this.#ctx.actions.sendMessage(...)`, etc., et s'abonne via
`this.#ctx.on("state", …)`.

---

## 6. Transport B — iframe sandboxée (`community`)

L'hôte monte `<iframe sandbox="allow-scripts allow-forms">` (**sans**
`allow-same-origin` → **origine opaque**) pointant le bundle, et échange par
`postMessage` — **même contrat logique** :

- **hôte → iframe**
  - `{ __onirtech: 1, type: "init", context: OnirtechTemplateContext }`
  - `{ __onirtech: 1, type: "state", state }` (à chaque évolution)
  - `{ __onirtech: 1, type: "resources", resources }`
  - `{ __onirtech: 1, type: "error", code, message }`
- **iframe → hôte**
  - `{ __onirtech: 1, type: "ready" }`
  - `{ __onirtech: 1, type: "action", action: "sendMessage", payload: { content } }`
  - `{ __onirtech: 1, type: "action", action: "submitIdentity", payload }`
  - `{ __onirtech: 1, type: "action", action: "finish" }`
  - `{ __onirtech: 1, type: "action", action: "request", payload: { capability } }`
  - `{ __onirtech: 1, type: "action", action: "openMedia", payload: { url } }`
  - `{ __onirtech: 1, type: "resize", payload: { height } }`

L'hôte **valide l'origine, le schéma et la capacité** avant toute exécution.

Un adaptateur fourni par le starter-kit expose la **même** surface `ctx.actions` /
`ctx.on` en mode iframe, de sorte que le code du template est **identique** dans les
deux transports.

---

## 7. Sécurité (défense en profondeur)

- **Intégrité SRI** vérifiée avant exécution ; assets **immuables**, servis en
  **lecture seule**.
- **iframe** : origine **opaque** (pas de cookie, pas de DOM hôte), CSP dédiée.
- **Validation stricte** des messages entrants (origine, schéma, capacité déclarée).
- **Capabilities** en **allowlist** : une capacité non déclarée n'est pas fournie.
- **Réseau externe interdit** par défaut ; autorisé seulement si déclaré dans
  `network` (et accepté par l'admin).
- **Le template n'accède jamais** à la base, aux secrets, ni à l'API : uniquement des
  **actions** médiées par l'hôte.
- **Connaissances** : seules les **métadonnées** (référence + titre) des
  connaissances réellement utilisées sont exposées, et uniquement si le template
  déclare la capacité `knowledge` **et** que la source est active (ADR-0020).
  Jamais le contenu des connaissances ni le prompt serveur.
- Import : anti-**zip-bomb**, limites de taille, contrôle des types MIME, manifeste
  validé, **validation admin** avant activation.

---

## 8. Cycle de développement

```bash
# Scaffolder un template + harness de dev
npx create-onirtech-template mon-template

# Dev : harness local (émule le côté HÔTE du contrat, données mock, live-reload,
#       transport au choix web-component | iframe)
npm run dev

# Validation locale (manifeste, entry → Custom Element, intégrité, capacités, réseau)
npm run validate

# Empaquetage → release/<id>-<version>.onirtech-template + release.json (SHA-256)
npm run pack
```

Le **template `default`** (l'UI actuelle du dashboard) sert d'**exemple de référence**
open source.

---

## 9. Versionnement & compatibilité

- Le contrat est **versionné** : `onirtech.template-host.v1`. Le manifeste déclare
  `compatibility.hostProtocol`.
- Au chargement, l'hôte refuse (ou dégrade vers le template `default`) un template
  dont le `hostProtocol` n'est pas supporté.
- Les évolutions du contrat **ajoutent** des capacités/champs optionnels (jamais de
  rupture silencieuse) ; une rupture ⇒ `onirtech.template-host.v2`.
- **Un lien épingle une version** du template (snapshot) : les mises à jour ne
  changent pas rétroactivement les liens existants.

---

## 10. Développement local & isolation (aucune connexion à la prod)

- **Hôte simulé (harness)** : le starter-kit fournit un petit serveur **local et
  autonome** qui implémente le **côté hôte** du contrat avec des **données mock**
  (conversation, médias, champs de formulaire, thème). **Aucune** connexion à un
  dashboard, une base, une API ou un secret : le développement est **100 % hors-ligne**.
- Le harness affiche un bandeau **« MOCK »** et **refuse** tout jeton d'un
  environnement non local (garde-fou anti-confusion).
- **INTERDIT** de pointer un environnement de développement (dashboard, base, API,
  token) vers la **production**. La prod n'est accessible que via le **panneau
  admin** et les droits RBAC — jamais depuis un poste de développement de template.
- **Intégration réelle = décision admin** : le développeur **livre une archive**
  (`.onirtech-template`) ; l'admin l'**importe**, la **valide**, la **prévisualise**
  et l'**applique** à un lien dans le panneau. Le développeur n'a donc **pas besoin**
  d'un lien de chat ni d'un accès à la prod.
- Les **types du contrat** exposés par l'hôte sont publics et stables
  (`OnirtechTemplateContext`, actions) : le harness et l'hôte réel les implémentent
  à l'identique, de sorte que le template est **identique** en local et en prod.

---

## 11. Note d'extension additive — capacités cœur (ADR-0020)

Deux **capacités cœur** génériques sont exposées aux templates, de façon
**additive** (aucune rupture de `onirtech.template-host.v1`, aucun template
existant impacté) :

| Capacité | Donnée fournie | Portée | Activation |
| --- | --- | --- | --- |
| `userState` | `TemplateMessage.userState` = `{ label, confidence }` | message **utilisateur** | capacité déclarée **ET** flag lien `userStateEnabled` |
| `knowledge` | `TemplateMessage.knowledge` = `{ ref, titre }[]` | message **assistant** | capacité déclarée **ET** source `connaissances` du lien active |

### Double garde (invariant)
L'hôte ne fournit la donnée **que si** la capacité est déclarée au manifeste **ET**
que l'option du lien est active. Sinon les champs sont **absents** (dégradation
gracieuse : personnage neutre, tableau vide).

### Détection de l'état du visiteur
- L'état est produit par le **cœur** (route générique `POST /api/chat/state`,
  `{ conversationId?, content }` → `{ state, confidence }`).
- **L'hôte seul** appelle cette route : le template **n'appelle jamais l'API**
  (invariant §7). Le template lit simplement `message.userState`.
- États : `neutral` | `content` | `triste` ; **fail-open** → `neutral` (confiance 0)
  en cas d'échec IA ou de réponse non conforme. Jamais bloquant.

### Connaissances exposées
- Le cœur remonte **uniquement** la **référence** et le **titre** des connaissances
  réellement sélectionnées par le mini-RAG — **jamais** le contenu ni le prompt.
- Sans capacité ou sans source active, `message.knowledge` est absent.

### Compatibilité
- `link.userStateEnabled` (booléen, §4) reflète le flag du lien et reste `false`
  par défaut.
- Un template qui ne déclare pas ces capacités se comporte **exactement** comme
  avant (champs optionnels non fournis).

## 12. Variables paramétrables (ADR-0023)

Un template peut déclarer des **variables** que l'exploitant d'un lien renseigne
dans le paramétrage du lien. Elles arrivent **résolues** dans `ctx.params` :

```js
const titre = ctx.params.titre_de_livre; // string | number | boolean (gelé)
```

### Déclaration (`manifest.params`)
```json
{
  "key": "titre_de_livre",
  "label": "Titre du livre",
  "description": "Titre affiché sur la couverture de l'album",
  "type": "string",
  "default": "album",
  "maxLength": 60
}
```

| Champ | Règle |
| --- | --- |
| `key` | unique, `^[a-z][a-z0-9_]{1,40}$` |
| `label` | 1..80 caractères (libellé du champ opérateur) |
| `description` | 0..200 caractères (aide sous le champ) |
| `type` | `string` \| `text` \| `number` \| `boolean` \| `color` \| `url` \| `select` |
| `default` | **obligatoire** |
| `maxLength` | `string`/`text`, 1..2000 (défaut 200) |
| `min` / `max` | `number` |
| `options` | `select` : `{ value, label }[]`, `default` ∈ valeurs |

Limites : **40 paramètres**, bloc ≤ **16 Ko**.

### Invariants
- **Aucun secret** : les valeurs sont **publiques** (vues par le visiteur).
- Le template **lit** `ctx.params` (objet gelé) et **n'écrit jamais** dedans.
- Valeur absente ou invalide ⇒ le **défaut** est appliqué (le public ne casse jamais).
- Un paramètre retiré/renommé par une nouvelle version : la valeur est conservée
  côté plateforme, ignorée au runtime, et signalée « n'est plus utilisée par cette
  version » dans l'écran d'édition.
- Le cœur ne connaît **aucune clé métier** : n'ajoutez pas de logique spécifique
  au template dans le dashboard.

### Performance
La résolution est faite **une fois** côté serveur au chargement du lien ; il n'y a
**aucune** requête supplémentaire côté navigateur. Lisez `ctx.params` comme des
constantes (mise en cache dans votre instance à la réception du contexte).

## 13. Ressources de données (ADR-0026)

Un template peut déclarer des **ressources structurées** (bibliothèque, galerie,
plan…) au moyen de la capacité `data`. Le template expose des **contrats** ;
l'exploitant lie chaque contrat à une **source** (SQL sur les vues org-scopées en
v1) ; le cœur exécute la source, valide le résultat contre le contrat, le met en
cache et le sert au template. Le cœur ne connaît aucun nom métier.

Guide d'exploitation et de mise en place : [`donnees-v1.md`](./donnees-v1.md).

### Déclaration (`manifest.data.contracts`)

```json
{
  "capabilities": ["messages", "data"],
  "data": {
    "contracts": [
      {
        "key": "library",
        "label": "Bibliothèque",
        "description": "Livres et pages affichés",
        "version": 1,
        "loading": "lazy",
        "inputs": [{ "key": "book_id", "type": "string", "required": false }],
        "schema": {
          "type": "object",
          "required": ["books"],
          "properties": {
            "books": {
              "type": "array",
              "maxItems": 50,
              "items": {
                "type": "object",
                "required": ["id", "title", "pages"],
                "properties": {
                  "id": { "type": "string", "maxLength": 64 },
                  "title": { "type": "string", "maxLength": 120 },
                  "pages": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "required": ["index", "text"],
                      "properties": {
                        "index": { "type": "integer", "minimum": 0 },
                        "text": { "type": "string", "maxLength": 2000 },
                        "image": { "type": "string", "format": "uri" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]
  }
}
```

- La capacité `data` **exige** le bloc `data.contracts` (et réciproquement).
- Le schéma est un **sous-ensemble strict de JSON Schema 2020-12** : `type`
  (`object`/`array`/`string`/`number`/`integer`/`boolean`), `properties`,
  `required`, `items`, `enum`, `const`, `format` (`uri`, `date`, `date-time`,
  `email`), `minLength`/`maxLength`, `minimum`/`maximum`, `minItems`/`maxItems`,
  `additionalProperties`. **Tout autre mot-clé est refusé** (`$ref`, `pattern`,
  `oneOf`, `anyOf`, `not`, `if/then/else`, `patternProperties`…).
- Les objets sont **fermés** (`additionalProperties: false` par défaut).
- La capacité `data` exige le mode **web-component** (les templates `iframe`
  n'ont pas accès aux ressources de données).
- `loading` : `lazy` (défaut) ou `eager` (≤ 64 Ko, injecté dans
  `ctx.resources.data`).
- `inputs` : valeurs scalaires fournies par le template au chargement (≤ 10),
  jamais par le visiteur.
- Limites : **20 contrats**, bloc ≤ **64 Ko**, profondeur ≤ 12, ≤ 500 nœuds.

### Runtime (rappel)

```js
const res = await ctx.data.load("library", { inputs: { book_id: "b1" } });
if (res.status === "ok") render(res.data.books);
else fallback(res.code); // DATA_UNBOUND, DATA_TIMEOUT, DATA_CONTRACT_INVALID…
```

- `ctx.data` est injecté par l'hôte (pas dans le payload sérialisé).
- Une ressource non liée est une **erreur typée** (`DATA_UNBOUND`), jamais une
  requête implicite.
- Le template ne voit **jamais** SQL, base ou credentials, et ne peut pas écrire.
