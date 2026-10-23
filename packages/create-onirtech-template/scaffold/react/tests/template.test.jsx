import { act } from "react";
import { expect, it } from "vitest";
import { createMockContext, mountTemplate } from "@onirtech/template-sdk/testing";
import "../src/index.js";

const ELEMENT = "__ELEMENT__";

// React 19 : les mises à jour de test doivent être enveloppées dans `act`.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

it("affiche le titre du paramètre", () => {
  const ctx = createMockContext({ params: { titre: "Album souvenirs" } });
  let el;

  act(() => {
    ({ el } = mountTemplate(ELEMENT, ctx));
  });

  expect(el.shadowRoot.textContent).toContain("Album souvenirs");
});

it("passe du formulaire au chat à la mise à jour du contexte", () => {
  let el;
  let update;

  act(() => {
    ({ el, update } = mountTemplate(ELEMENT, createMockContext()));
  });

  act(() => {
    update(
      createMockContext({
        state: { phase: "chat", messages: [{ role: "assistant", content: "Bonjour" }] },
      }),
    );
  });

  expect(el.shadowRoot.textContent).toContain("Bonjour");
});
