/**
 * Suite de l'adaptateur React (ADR-0024 §6, §10.1, §10.2, §10.5-§10.7).
 *
 * Montage, rendu initial, mise à jour sans démontage, état local conservé,
 * démontage, repli d'erreur, injection CSS unique et enregistrement idempotent.
 */
import { act, useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineReactTemplate, useTemplate } from "../src/react/index.js";
import { createMockContext } from "../src/testing/index.js";
import type { OnirtechContext } from "../src/types.js";

// React 19 : les mises à jour de test doivent être enveloppées dans `act`
// (jamais positionné dans le code publié).
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

type TemplateElement = HTMLElement & { onirtechContext: OnirtechContext | null };

/** Monte un élément dans `document.body` (connexion → éventuel rendu). */
function mount(element: string, ctx: OnirtechContext | null): TemplateElement {
  const el = document.createElement(element) as TemplateElement;
  if (ctx !== null) el.onirtechContext = ctx;
  act(() => {
    document.body.append(el);
  });
  return el;
}

/** Réassigne le contexte (chemin utilisé par `TemplateHost`). */
function update(el: TemplateElement, ctx: OnirtechContext): void {
  act(() => {
    el.onirtechContext = ctx;
  });
}

/** Nettoyage global : les démontages déclenchent `disconnectedCallback`. */
afterEach(() => {
  act(() => {
    document.body.replaceChildren();
  });
  vi.restoreAllMocks();
});

function Display() {
  const { ctx, phase, messages, params, capabilities, actions } = useTemplate();
  return (
    <div>
      <span data-testid="phase">{phase}</span>
      <span data-testid="titre">{String(params.titre ?? "")}</span>
      <span data-testid="caps">{capabilities.join(",")}</span>
      <span data-testid="locale">{ctx.locale}</span>
      <ul>
        {messages.map((message) => (
          <li key={message.id}>{message.content}</li>
        ))}
      </ul>
      <button type="button" onClick={() => actions.sendMessage("envoyé")}>
        envoyer
      </button>
    </div>
  );
}

describe("defineReactTemplate", () => {
  it("monte le composant et rend le contexte assigné après connexion", () => {
    defineReactTemplate("onirtech-test-display", Display);
    const ctx = createMockContext({ params: { titre: "Aurora" } });

    const el = mount("onirtech-test-display", ctx);
    const root = el.shadowRoot as ShadowRoot;

    expect(root).not.toBeNull();
    expect(root.querySelector("[data-onirtech-root]")).not.toBeNull();
    expect(root.textContent).toContain("Aurora");
    expect(root.textContent).toContain("identity");
    expect(root.textContent).toContain("fr");
    expect(root.textContent).toContain(
      "messages,media,modelForm,theme,userState,knowledge,attachments",
    );
    expect(el.onirtechContext).toBe(ctx);
  });

  it("accepte une affectation avant connectedCallback (rendu au montage)", () => {
    defineReactTemplate("onirtech-test-before", Display);
    const el = document.createElement("onirtech-test-before") as TemplateElement;
    el.onirtechContext = createMockContext({ params: { titre: "Avant" } });

    act(() => {
      document.body.append(el);
    });

    expect(el.shadowRoot?.textContent).toContain("Avant");
  });

  it("met à jour via le provider sans réinitialiser l'état local", () => {
    function Counter() {
      const { messages } = useTemplate();
      const [count, setCount] = useState(0);
      return (
        <div>
          <span data-testid="count">{count}</span>
          <span data-testid="messages">{messages.length}</span>
          <span data-testid="last">{messages.at(-1)?.content ?? ""}</span>
          <button type="button" onClick={() => setCount((value) => value + 1)}>
            incrémenter
          </button>
        </div>
      );
    }

    defineReactTemplate("onirtech-test-counter", Counter);
    const el = mount("onirtech-test-counter", createMockContext());
    act(() => {
      el.shadowRoot?.querySelector("button")?.click();
      el.shadowRoot?.querySelector("button")?.click();
    });
    expect(el.shadowRoot?.querySelector("[data-testid=count]")?.textContent).toBe("2");

    update(el, createMockContext({ state: { messages: [{ content: "Nouveau message" }] } }));

    expect(el.shadowRoot?.querySelector("[data-testid=count]")?.textContent).toBe("2");
    expect(el.shadowRoot?.querySelector("[data-testid=last]")?.textContent).toBe("Nouveau message");
    expect(el.shadowRoot?.textContent).toContain("Nouveau message");
  });

  it("injecte le CSS une seule fois dans le shadow root", () => {
    defineReactTemplate("onirtech-test-css", Display, { css: ".aurora{color:red}" });
    const el = mount("onirtech-test-css", createMockContext());

    update(el, createMockContext({ state: { messages: [{ content: "un" }] } }));
    update(el, createMockContext({ state: { messages: [{ content: "deux" }] } }));

    const styles = el.shadowRoot?.querySelectorAll("style[data-onirtech-sdk]") ?? [];
    expect(styles.length).toBe(1);
    expect(styles[0]?.textContent).toBe(".aurora{color:red}");
  });

  it("démonte React et appelle le nettoyage à la déconnexion", () => {
    const cleanups: string[] = [];
    function WithCleanup() {
      useTemplate();
      useEffect(
        () => () => {
          cleanups.push("cleanup");
        },
        [],
      );
      return <span>vivant</span>;
    }

    defineReactTemplate("onirtech-test-cleanup", WithCleanup);
    const el = mount("onirtech-test-cleanup", createMockContext());
    expect(el.shadowRoot?.textContent).toContain("vivant");
    expect(cleanups).toEqual([]);

    act(() => {
      el.remove();
    });

    expect(cleanups).toEqual(["cleanup"]);
  });

  it("remonte correctement après une reconnexion", () => {
    defineReactTemplate("onirtech-test-reconnect", Display);
    const ctx = createMockContext({ params: { titre: "Reconnecté" } });
    const el = mount("onirtech-test-reconnect", ctx);
    act(() => {
      el.remove();
    });
    expect(el.shadowRoot?.textContent).not.toContain("Reconnecté");

    act(() => {
      document.body.append(el);
    });
    expect(el.shadowRoot?.textContent).toContain("Reconnecté");
  });

  it("affiche errorFallback quand le composant lève", () => {
    const errors: unknown[] = [];
    function Boom(): never {
      useTemplate();
      throw new Error("boom");
    }

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    defineReactTemplate("onirtech-test-error", Boom, {
      errorFallback: (error) => `Repli : ${(error as Error).message}`,
      onError: (error) => errors.push(error),
    });

    const el = mount("onirtech-test-error", createMockContext());

    expect(el.shadowRoot?.querySelector("[data-onirtech-error]")).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain("Repli : boom");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(consoleError).toHaveBeenCalled();
  });

  it("utilise le repli texte minimal sans errorFallback", () => {
    function Boom(): never {
      useTemplate();
      throw new Error("boom");
    }

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    defineReactTemplate("onirtech-test-error-default", Boom);
    const el = mount("onirtech-test-error-default", createMockContext());

    expect(el.shadowRoot?.textContent).toContain("Une erreur est survenue.");
  });

  it("est idempotent : un second enregistrement retourne la classe existante", () => {
    function Other() {
      return <span>autre</span>;
    }

    const first = defineReactTemplate("onirtech-test-idempotent", Display);
    const second = defineReactTemplate("onirtech-test-idempotent", Other);

    expect(second).toBe(first);
    expect(customElements.get("onirtech-test-idempotent")).toBe(first);

    const el = mount(
      "onirtech-test-idempotent",
      createMockContext({ params: { titre: "Premier" } }),
    );
    expect(el.shadowRoot?.textContent).toContain("Premier");
    expect(el.shadowRoot?.textContent).not.toContain("autre");
  });
});
