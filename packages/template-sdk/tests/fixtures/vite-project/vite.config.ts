import { defineTemplateConfig } from "../../../src/vite/index.js";

export default defineTemplateConfig({
  entry: "src/index.ts",
  element: "onirtech-template-fixture",
  manifest: "src/manifest.ts",
});
