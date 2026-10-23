// Entrée du template Vue : le CSS est importé comme chaîne (`?inline`) et
// injecté dans le Shadow DOM par le SDK. Le build Vite produit `dist/index.js`.
import css from "./styles.css?inline";
import { defineVueTemplate } from "@onirtech/template-sdk/vue";
import Aurora from "./Aurora.vue";

defineVueTemplate("__ELEMENT__", Aurora, { css });
