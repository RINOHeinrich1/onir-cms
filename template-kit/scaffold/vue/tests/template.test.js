import { nextTick } from "vue";
import { expect, it } from "vitest";
import { createMockContext, mountTemplate } from "@onirtech/template-sdk/testing";
import "../src/index.js";

const ELEMENT = "__ELEMENT__";

it("affiche le titre du paramètre", async () => {
  const ctx = createMockContext({ params: { titre: "Album souvenirs" } });
  const { el } = mountTemplate(ELEMENT, ctx);
  await nextTick();

  expect(el.shadowRoot.textContent).toContain("Album souvenirs");
});

it("passe du formulaire au chat à la mise à jour du contexte", async () => {
  const { el, update } = mountTemplate(ELEMENT, createMockContext());
  await nextTick();

  expect(el.shadowRoot.textContent).toContain("Démarrer la discussion");

  update(
    createMockContext({
      state: { phase: "chat", messages: [{ role: "assistant", content: "Bonjour" }] },
    }),
  );
  await nextTick();

  expect(el.shadowRoot.textContent).toContain("Bonjour");
});
