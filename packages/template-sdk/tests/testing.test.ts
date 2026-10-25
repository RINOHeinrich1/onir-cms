import { afterEach, describe, expect, it, vi } from "vitest";
import { defineTemplate } from "../src/define-template.js";
import { createMockContext, mountTemplate } from "../src/testing/index.js";
import type { OnirtechContext } from "../src/types.js";

/** Champs du contrat hôte qui doivent tous être définis (ADR-0024 §8.1). */
const CONTRACT_KEYS = [
  "host",
  "link",
  "locale",
  "brand",
  "theme",
  "capabilities",
  "params",
  "consent",
  "state",
  "resources",
  "actions",
  "on",
] as const;

type TemplateElement = HTMLElement & { onirtechContext: OnirtechContext | null };

afterEach(() => {
  document.body.replaceChildren();
});

describe("createMockContext", () => {
  it("produit un contexte complet : aucun champ du contrat n'est undefined", () => {
    const ctx = createMockContext();

    for (const key of CONTRACT_KEYS) {
      expect(ctx[key]).toBeDefined();
    }
    expect(ctx.host).toEqual({ protocol: "onirtech.template-host.v1", version: 1 });
    expect(ctx.link.type).toBe("standard");
    expect(typeof ctx.link.label).toBe("string");
    expect(ctx.link.userStateEnabled).toBe(false);
    expect(ctx.locale).toBe("fr");
    expect(ctx.brand.name).toBe("ONIRTECH");
    expect(ctx.brand.logoUrl).toBeNull();
    expect(Object.keys(ctx.theme).length).toBeGreaterThan(0);
    expect(new Set(ctx.capabilities)).toEqual(
      new Set(["messages", "media", "modelForm", "theme", "userState", "knowledge", "attachments"]),
    );
    expect(ctx.params).toEqual({});
    expect(Object.isFrozen(ctx.params)).toBe(true);
    expect(ctx.consent).not.toBeNull();
    expect(ctx.consent?.texte).toBeTruthy();
    expect(ctx.consent?.lien).toBeTruthy();
    expect(ctx.state).toEqual({
      phase: "identity",
      status: "en_cours",
      messages: [],
      typing: false,
    });
    expect(ctx.resources).toEqual({
      media: { photos: [], liens: [] },
      modelForm: null,
    });
  });

  it("fournit des actions no-op et un désabonnement", async () => {
    const ctx = createMockContext();

    expect(() => ctx.actions.sendMessage("Bonjour")).not.toThrow();
    expect(ctx.actions.finish()).toBeUndefined();
    expect(() => ctx.actions.openMedia("https://example.com")).not.toThrow();
    expect(() => ctx.actions.resize(320)).not.toThrow();
    expect(() =>
      ctx.actions.submitIdentity({ nom: "Ada", email: "ada@example.com" }),
    ).not.toThrow();
    await expect(ctx.actions.request("media")).resolves.toBeUndefined();

    const unsubscribe = ctx.on("state", () => undefined);
    expect(typeof unsubscribe).toBe("function");
    expect(unsubscribe()).toBeUndefined();
  });

  it("fusionne en profondeur une surcharge partielle", () => {
    const ctx = createMockContext({
      params: { titre: "Album souvenirs" },
      state: {
        phase: "chat",
        messages: [{ role: "assistant", content: "Bonjour" }],
      },
    });

    expect(ctx.params).toEqual({ titre: "Album souvenirs" });
    expect(Object.isFrozen(ctx.params)).toBe(true);

    // Champs frères conservés par la fusion profonde.
    expect(ctx.state.phase).toBe("chat");
    expect(ctx.state.status).toBe("en_cours");
    expect(ctx.state.typing).toBe(false);
    expect(ctx.brand.name).toBe("ONIRTECH");

    // Message partiel complété avec les champs obligatoires du contrat.
    expect(ctx.state.messages).toHaveLength(1);
    const [message] = ctx.state.messages;
    expect(message?.role).toBe("assistant");
    expect(message?.content).toBe("Bonjour");
    expect(message?.medias).toEqual([]);
    expect(message?.id).toBeTruthy();
    expect(message?.at).toBeTruthy();
  });

  it("remplace les tableaux au lieu de les fusionner index par index", () => {
    const ctx = createMockContext({ capabilities: ["messages"] });
    expect(ctx.capabilities).toEqual(["messages"]);
  });

  it("surcharge partiellement les actions (les autres restent no-op)", () => {
    const sendMessage = vi.fn<(content: string) => void>();
    const ctx = createMockContext({ actions: { sendMessage } });

    ctx.actions.sendMessage("Test");
    expect(sendMessage).toHaveBeenCalledWith("Test");
    expect(typeof ctx.actions.finish).toBe("function");
  });

  it("ne partage aucun état mutable entre deux contextes", () => {
    const first = createMockContext({ params: { titre: "Album" }, capabilities: ["media"] });
    first.capabilities.push("theme");

    const second = createMockContext();
    expect(second.params).toEqual({});
    expect(second.capabilities).toHaveLength(7);
  });
});

describe("mountTemplate", () => {
  it("monte, met à jour puis démonte le Custom Element", () => {
    const onUnmount = vi.fn();
    defineTemplate(
      "sdk-testing-cycle",
      (ctx) => {
        const p = document.createElement("p");
        p.textContent = ctx.state.messages[0]?.content ?? ctx.brand.name;
        return p;
      },
      { onUnmount },
    );

    const { el, update, unmount } = mountTemplate("sdk-testing-cycle", createMockContext());
    expect(el.shadowRoot?.textContent).toBe("ONIRTECH");

    update(
      createMockContext({
        state: { phase: "chat", messages: [{ role: "assistant", content: "Bonjour" }] },
      }),
    );
    expect(el.shadowRoot?.textContent).toBe("Bonjour");

    const template = el as TemplateElement;
    expect(template.onirtechContext?.state.phase).toBe("chat");

    unmount();
    expect(el.isConnected).toBe(false);
    expect(document.body.contains(el)).toBe(false);
    expect(template.onirtechContext).toBeNull();
    expect(onUnmount).toHaveBeenCalledTimes(1);
  });

  it("lève une erreur explicite si l'élément n'est pas enregistré", () => {
    const ctx = createMockContext();

    expect(() => mountTemplate("sdk-testing-inexistant", ctx)).toThrow(/non enregistré/);
    expect(customElements.get("sdk-testing-inexistant")).toBeUndefined();
    expect(document.body.childElementCount).toBe(0);
  });
});
