// Configuration Vite d'un template Vue (ADR-0024 §9.1) : bundle ESM unique,
// CSS inliné, assets embarqués et émission de `onirtech.template.json`.
import vue from "@vitejs/plugin-vue";
import { defineTemplateConfig } from "@onirtech/template-sdk/vite";

export default defineTemplateConfig({
  entry: "src/index.js",
  element: "__ELEMENT__",
  manifest: "src/manifest.ts",
  plugins: [vue()],
});
