// Entrée du template React : le CSS est importé comme chaîne (`?inline`) et
// injecté dans le Shadow DOM par le SDK. Le build Vite produit `dist/index.js`.
import css from "./styles.css?inline";
import { defineReactTemplate } from "@onirtech/template-sdk/react";
import { Aurora } from "./Aurora.jsx";

defineReactTemplate("__ELEMENT__", Aurora, { css });
