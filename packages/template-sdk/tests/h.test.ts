import { describe, expect, it, vi } from "vitest";
import { h } from "../src/h.js";

describe("h", () => {
  it("écrit `text` comme texte et jamais comme HTML", () => {
    const node = h("div", { text: "<b>gras</b>" });
    expect(node.textContent).toBe("<b>gras</b>");
    expect(node.querySelector("b")).toBeNull();
  });

  it("ne contient pas d'innerHTML (aucune injection via les valeurs du contexte)", () => {
    const source = h.toString();
    expect(source.includes("innerHTML")).toBe(false);
  });

  it("mappe `class` sur className", () => {
    const node = h("span", { class: "assistant actif" });
    expect(node.className).toBe("assistant actif");
    expect(node.getAttribute("class")).toBe("assistant actif");
  });

  it("branche les écouteurs `on*`", () => {
    const listener = vi.fn();
    const button = h("button", { onclick: listener });
    button.click();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ignore les attributs null et undefined", () => {
    const node = h("input", { name: "nom", title: undefined, role: null });
    expect(node.hasAttribute("name")).toBe(true);
    expect(node.hasAttribute("title")).toBe(false);
    expect(node.hasAttribute("role")).toBe(false);
  });

  it("aplatit les enfants et ignore null/false", () => {
    const list = h("ul", {}, [h("li", { text: "a" }), "b"], null, false, 3, [["c"]]);
    expect(list.textContent).toBe("ab3c");
    expect(list.children).toHaveLength(1);
  });

  it("ne crée ni n'exécute de script fourni comme texte", () => {
    const payload = "<script>window.__sdkInjected = true</script>";
    const node = h("p", { text: payload });
    expect(node.querySelector("script")).toBeNull();
    expect(node.textContent).toBe(payload);
    expect((globalThis as { __sdkInjected?: boolean }).__sdkInjected).toBeUndefined();
  });
});
