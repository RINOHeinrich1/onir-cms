import { afterEach, describe, expect, it, vi } from "vitest";
import { defineTemplate } from "../src/define-template.js";
import type { OnirtechContext } from "../src/types.js";

type TemplateElement = HTMLElement & { onirtechContext: OnirtechContext | null };

function makeContext(label: string): OnirtechContext {
  return {
    brand: { name: label, logoUrl: null },
    state: { phase: "chat", status: "en_cours", messages: [], typing: false },
  } as unknown as OnirtechContext;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("defineTemplate", () => {
  it("rend le contexte assigné avant le montage", () => {
    defineTemplate("sdk-test-avant", (ctx) => {
      const p = document.createElement("p");
      p.textContent = ctx.brand.name;
      return p;
    });
    const el = document.createElement("sdk-test-avant") as TemplateElement;
    el.onirtechContext = makeContext("avant");
    expect(el.shadowRoot?.textContent).toBe("");
    document.body.append(el);
    expect(el.shadowRoot?.textContent).toBe("avant");
  });

  it("rend à chaque réassignation et remplace le contenu", () => {
    defineTemplate("sdk-test-update", (ctx) => {
      const p = document.createElement("p");
      p.textContent = ctx.brand.name;
      return p;
    });
    const el = document.createElement("sdk-test-update") as TemplateElement;
    document.body.append(el);
    el.onirtechContext = makeContext("un");
    expect(el.shadowRoot?.textContent).toBe("un");
    el.onirtechContext = makeContext("deux");
    expect(el.shadowRoot?.textContent).toBe("deux");
    expect(el.shadowRoot?.querySelectorAll("p")).toHaveLength(1);
    expect(el.onirtechContext?.brand.name).toBe("deux");
  });

  it("injecte le CSS une seule fois (un unique <style>)", () => {
    defineTemplate("sdk-test-css", (ctx) => ctx.brand.name, {
      css: ":host { display: block; }",
    });
    const el = document.createElement("sdk-test-css") as TemplateElement;
    document.body.append(el);
    el.onirtechContext = makeContext("a");
    el.onirtechContext = makeContext("b");
    expect(el.shadowRoot?.querySelectorAll("style")).toHaveLength(1);
    expect(el.shadowRoot?.querySelector("style")?.textContent).toBe(":host { display: block; }");
  });

  it("appelle onUnmount à la déconnexion", () => {
    const onUnmount = vi.fn();
    defineTemplate("sdk-test-unmount", (ctx) => ctx.brand.name, { onUnmount });
    const el = document.createElement("sdk-test-unmount") as TemplateElement;
    document.body.append(el);
    el.remove();
    expect(onUnmount).toHaveBeenCalledTimes(1);
  });

  it("capture l'erreur, prévient onError et affiche errorFallback", () => {
    const onError = vi.fn();
    defineTemplate(
      "sdk-test-erreur",
      () => {
        throw new Error("boom");
      },
      {
        onError,
        errorFallback: () => "Rendu indisponible",
      },
    );
    const el = document.createElement("sdk-test-erreur") as TemplateElement;
    document.body.append(el);
    el.onirtechContext = makeContext("x");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(el.shadowRoot?.textContent).toBe("Rendu indisponible");
  });

  it("est idempotent : un double appel retourne la classe existante", () => {
    const first = defineTemplate("sdk-test-idempotent", (ctx) => ctx.brand.name);
    const second = defineTemplate("sdk-test-idempotent", () => "autre");
    expect(second).toBe(first);
    expect(customElements.get("sdk-test-idempotent")).toBe(first);
  });

  it("supporte shadowDom: none (pas de shadow root)", () => {
    defineTemplate("sdk-test-none", (ctx) => ctx.brand.name, { shadowDom: "none" });
    const el = document.createElement("sdk-test-none") as TemplateElement;
    document.body.append(el);
    el.onirtechContext = makeContext("hote");
    expect(el.shadowRoot).toBeNull();
    expect(el.textContent).toBe("hote");
  });
});
