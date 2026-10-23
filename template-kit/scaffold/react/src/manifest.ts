// Manifeste typé — source de vérité des métadonnées (ADR-0024 §5.5, §11).
// Le build Vite émet `onirtech.template.json` à partir de ce fichier, avec
// `ui.entry` et `ui.integrity` calculés sur le bundle réellement produit.
import { defineManifest } from "@onirtech/template-sdk";

export default defineManifest({
  id: "__ID__",
  name: "__NAME__",
  description: "Template visuel Onirtech (stack React).",
  version: "1.0.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: {
    mode: "web-component",
    entry: "./dist/index.js",
    element: "__ELEMENT__",
    shadowDom: "open",
  },
  capabilities: ["messages", "media", "theme"],
  params: [
    {
      key: "titre",
      label: "Titre",
      description: "Titre affiché en haut du formulaire et du chat",
      type: "string",
      default: "Discutons de votre projet",
      maxLength: 80,
    },
  ],
});
