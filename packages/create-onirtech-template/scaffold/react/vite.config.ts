// Configuration Vite d'un template React (ADR-0024 §9.1) : bundle ESM unique,
// CSS inliné, assets embarqués et émission de `onirtech.template.json`.
import react from "@vitejs/plugin-react";
import { defineTemplateConfig } from "@onirtech/template-sdk/vite";

export default defineTemplateConfig({
  entry: "src/index.js",
  element: "__ELEMENT__",
  manifest: "src/manifest.ts",
  plugins: [react()],
});
