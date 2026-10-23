// Entrée du template (stack vanilla — aucun build).
//
// Le SDK enregistre le Custom Element, gère le Shadow DOM, la propriété
// `onirtechContext`, le rendu à chaque mise à jour, les styles et les erreurs.
// Aucun bundler n'est requis : les styles voyagent dans `styles.js` (chaîne
// ES module) car un navigateur ne peut pas importer un `.css` brut comme texte.
import { defineTemplate } from "@onirtech/template-sdk";
import { CSS } from "./styles.js";
import { chat, identity } from "./ui.js";

defineTemplate(
  "__ELEMENT__",
  (ctx) => (ctx.state.phase === "identity" ? identity(ctx) : chat(ctx)),
  { css: CSS },
);
