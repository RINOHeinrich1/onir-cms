/**
 * Manifeste typé de la fixture : importe `defineManifest` depuis le **bundle**
 * du SDK (`dist/index.js`), comme le fera un vrai projet template.
 */
import { defineManifest } from "../../../../dist/index.js";

export default defineManifest({
  id: "onirtech-template-fixture",
  name: "Fixture Vite",
  description: "Fixture d'intégration du plugin Vite du SDK.",
  version: "1.0.0",
  publisher: { id: "onirtech", name: "ONIRTECH", trustLevel: "official" },
  ui: {
    mode: "web-component",
    entry: "./dist/index.js",
    element: "onirtech-template-fixture",
  },
  capabilities: ["messages"],
});
