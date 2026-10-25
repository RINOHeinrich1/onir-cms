/**
 * Suite de l'adaptateur Vue (ADR-0024 §7, §10.1, §10.2, §10.6, §10.7).
 *
 * Montage, rendu initial, affectation avant connexion, mise à jour des
 * `computed` sans démontage (état local conservé), délégation des `actions`,
 * injection CSS unique, démontage (`onUnmounted`), reconnexion et
 * enregistrement idempotent. Composants sans SFC : `defineComponent` + `h`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, onUnmounted, ref } from "vue";
import { createMockContext } from "../src/testing/index.js";
import type { OnirtechContext } from "../src/types.js";
import { defineVueTemplate, useTemplate } from "../src/vue/index.js";

type TemplateElement = HTMLElement & { onirtechContext: OnirtechContext | null };

/** Monte l'élément puis assigne le contexte (ordre de `TemplateHost`). */
async function mount(element: string, ctx: OnirtechContext): Promise<TemplateElement> {
  const el = document.createElement(element) as TemplateElement;
  document.body.append(el);
  el.onirtechContext = ctx;
  await nextTick();
  return el;
}

/** Réassigne le contexte (chemin utilisé par `TemplateHost`). */
async function update(el: TemplateElement, ctx: OnirtechContext): Promise<void> {
  el.onirtechContext = ctx;
  await nextTick();
}

afterEach(async () => {
  document.body.replaceChildren();
  await nextTick();
  vi.restoreAllMocks();
});

const TemplateDisplay = defineComponent({
  name: "TemplateDisplay",
  setup() {
    // biome-ignore lint/correctness/useHookAtTopLevel: composable Vue, pas un hook React.
    const { ctx, phase, messages, params, capabilities, actions } = useTemplate();
    return () =>
      h("div", [
        h("span", { "data-testid": "phase" }, phase.value),
        h("span", { "data-testid": "titre" }, String(params.value.titre ?? "")),
        h("span", { "data-testid": "caps" }, capabilities.value.join(",")),
        h("span", { "data-testid": "locale" }, ctx.value.locale),
        h(
          "ul",
          messages.value.map((message) => h("li", { key: message.id }, message.content)),
        ),
        h("button", { type: "button", onClick: () => actions.sendMessage("envoyé") }, "envoyer"),
      ]);
  },
});

describe("defineVueTemplate", () => {
  it("monte l'application et rend le contexte assigné après connexion", async () => {
    defineVueTemplate("onirtech-vue-display", TemplateDisplay);
    const ctx = createMockContext({ params: { titre: "Aurora" } });

    const el = await mount("onirtech-vue-display", ctx);
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

  it("accepte une affectation avant connectedCallback (rendu au montage)", async () => {
    defineVueTemplate("onirtech-vue-before", TemplateDisplay);
    const el = document.createElement("onirtech-vue-before") as TemplateElement;
    el.onirtechContext = createMockContext({ params: { titre: "Avant" } });

    document.body.append(el);
    await nextTick();

    expect(el.shadowRoot?.textContent).toContain("Avant");
  });

  it("met à jour les computed sans démonter l'application (état local conservé)", async () => {
    const unmounted: string[] = [];
    const TemplateCounter = defineComponent({
      name: "TemplateCounter",
      setup() {
        // biome-ignore lint/correctness/useHookAtTopLevel: composable Vue, pas un hook React.
        const { messages, phase } = useTemplate();
        const count = ref(0);
        onUnmounted(() => {
          unmounted.push("counter");
        });
        return () =>
          h("div", [
            h("span", { "data-testid": "count" }, String(count.value)),
            h("span", { "data-testid": "phase" }, phase.value),
            h("span", { "data-testid": "last" }, messages.value.at(-1)?.content ?? ""),
            h("button", { type: "button", onClick: () => (count.value += 1) }, "incrémenter"),
          ]);
      },
    });

    defineVueTemplate("onirtech-vue-counter", TemplateCounter);
    const el = await mount("onirtech-vue-counter", createMockContext());

    el.shadowRoot?.querySelector("button")?.click();
    el.shadowRoot?.querySelector("button")?.click();
    await nextTick();
    expect(el.shadowRoot?.querySelector("[data-testid=count]")?.textContent).toBe("2");

    await update(
      el,
      createMockContext({
        state: { phase: "chat", messages: [{ content: "Nouveau message" }] },
      }),
    );

    expect(unmounted).toEqual([]);
    expect(el.shadowRoot?.querySelector("[data-testid=count]")?.textContent).toBe("2");
    expect(el.shadowRoot?.querySelector("[data-testid=phase]")?.textContent).toBe("chat");
    expect(el.shadowRoot?.querySelector("[data-testid=last]")?.textContent).toBe("Nouveau message");
  });

  it("délègue les actions au contexte courant via un objet stable", async () => {
    defineVueTemplate("onirtech-vue-actions", TemplateDisplay);
    const first = vi.fn();
    const el = await mount(
      "onirtech-vue-actions",
      createMockContext({ actions: { sendMessage: first } }),
    );

    el.shadowRoot?.querySelector("button")?.click();
    expect(first).toHaveBeenCalledWith("envoyé");

    const second = vi.fn();
    await update(el, createMockContext({ actions: { sendMessage: second } }));

    el.shadowRoot?.querySelector("button")?.click();
    expect(second).toHaveBeenCalledWith("envoyé");
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("injecte le CSS une seule fois dans le shadow root", async () => {
    defineVueTemplate("onirtech-vue-css", TemplateDisplay, { css: ".aurora{color:red}" });
    const el = await mount("onirtech-vue-css", createMockContext());

    await update(el, createMockContext({ state: { messages: [{ content: "un" }] } }));
    await update(el, createMockContext({ state: { messages: [{ content: "deux" }] } }));

    const styles = el.shadowRoot?.querySelectorAll("style[data-onirtech-sdk]") ?? [];
    expect(styles.length).toBe(1);
    expect(styles[0]?.textContent).toBe(".aurora{color:red}");
  });

  it("démonte l'application et appelle les hooks à la déconnexion", async () => {
    const cleanups: string[] = [];
    const WithCleanup = defineComponent({
      name: "WithCleanup",
      setup() {
        // biome-ignore lint/correctness/useHookAtTopLevel: composable Vue, pas un hook React.
        useTemplate();
        onUnmounted(() => {
          cleanups.push("cleanup");
        });
        return () => h("span", "vivant");
      },
    });

    defineVueTemplate("onirtech-vue-cleanup", WithCleanup);
    const el = await mount("onirtech-vue-cleanup", createMockContext());
    expect(el.shadowRoot?.textContent).toContain("vivant");
    expect(cleanups).toEqual([]);

    el.remove();
    await nextTick();

    expect(cleanups).toEqual(["cleanup"]);
    expect(el.shadowRoot?.textContent).not.toContain("vivant");
  });

  it("remonte correctement après une reconnexion", async () => {
    defineVueTemplate("onirtech-vue-reconnect", TemplateDisplay);
    const el = await mount(
      "onirtech-vue-reconnect",
      createMockContext({ params: { titre: "Reconnecté" } }),
    );

    el.remove();
    await nextTick();
    expect(el.shadowRoot?.textContent).not.toContain("Reconnecté");

    document.body.append(el);
    await nextTick();
    expect(el.shadowRoot?.textContent).toContain("Reconnecté");
  });

  it("affiche errorFallback quand le composant lève", async () => {
    const errors: unknown[] = [];
    const TemplateBoom = defineComponent({
      name: "TemplateBoom",
      setup() {
        // biome-ignore lint/correctness/useHookAtTopLevel: composable Vue, pas un hook React.
        useTemplate();
        throw new Error("boom");
      },
    });

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    defineVueTemplate("onirtech-vue-error", TemplateBoom, {
      errorFallback: (error) => `Repli : ${(error as Error).message}`,
      onError: (error) => errors.push(error),
    });

    const el = await mount("onirtech-vue-error", createMockContext());

    expect(el.shadowRoot?.querySelector("[data-onirtech-error]")).not.toBeNull();
    expect(el.shadowRoot?.textContent).toContain("Repli : boom");
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("est idempotent : un second enregistrement retourne la classe existante", async () => {
    const TemplateOther = defineComponent({
      name: "TemplateOther",
      setup: () => () => h("span", "autre"),
    });

    const first = defineVueTemplate("onirtech-vue-idempotent", TemplateDisplay);
    const second = defineVueTemplate("onirtech-vue-idempotent", TemplateOther);

    expect(second).toBe(first);
    expect(customElements.get("onirtech-vue-idempotent")).toBe(first);

    const el = await mount(
      "onirtech-vue-idempotent",
      createMockContext({ params: { titre: "Premier" } }),
    );
    expect(el.shadowRoot?.textContent).toContain("Premier");
    expect(el.shadowRoot?.textContent).not.toContain("autre");
  });
});
