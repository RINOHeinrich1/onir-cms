// Widget de référence (starter) — surface `widget` (ADR-0040).
// Le launcher et le panneau restent sous la responsabilité du template. Le
// cœur ne fournit que l'iframe, les actions et les bornes de taille.
const ELEMENT = "onirtech-widget-starter";

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child,
    );
  }
  return node;
}

class StarterWidget extends HTMLElement {
  #root;
  #ctx;
  #open = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  set onirtechContext(ctx) {
    this.#ctx = ctx;
    this.#render();
  }

  get onirtechContext() {
    return this.#ctx;
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    const ctx = this.#ctx;
    if (!ctx) return;
    const style = el("style", {
      text: `
        :host { display:block; width:100%; height:100%; font-family:system-ui,sans-serif; }
        * { box-sizing:border-box; }
        .launcher { width:100%; height:100%; border:0; border-radius:50%;
          background:${ctx.theme.primary ?? "#023777"}; color:#fff; font-size:1.55rem;
          cursor:pointer; box-shadow:0 10px 30px rgba(15,23,42,.28);
          display:grid; place-items:center; }
        .panel { display:flex; flex-direction:column; width:100%; height:100%;
          overflow:hidden; border-radius:1rem; background:#fff;
          box-shadow:0 18px 60px rgba(15,23,42,.28); border:1px solid #dbe3ee; }
        header { display:flex; align-items:center; justify-content:space-between;
          gap:.75rem; padding:.85rem 1rem; background:${ctx.theme.primary ?? "#023777"}; color:#fff; }
        header strong { font-size:.95rem; font-weight:650; }
        header button { background:transparent; border:0; color:#fff; font-size:1.4rem; cursor:pointer; }
        .messages { flex:1; overflow:auto; padding:1rem; display:flex; flex-direction:column; gap:.6rem;
          background:#f8fafc; }
        .message { max-width:85%; padding:.6rem .75rem; border-radius:.75rem; font-size:.9rem;
          line-height:1.35; white-space:pre-wrap; }
        .message.assistant { align-self:flex-start; background:#e8eef7; color:#111827; }
        .message.user { align-self:flex-end; background:${ctx.theme.primary ?? "#023777"}; color:#fff; }
        .composer { display:flex; gap:.5rem; padding:.75rem; border-top:1px solid #e2e8f0; background:#fff; }
        .composer input { flex:1; min-width:0; padding:.6rem .7rem; border:1px solid #cbd5e1;
          border-radius:.6rem; font:inherit; }
        .composer button { border:0; border-radius:.6rem; padding:.6rem .8rem;
          background:${ctx.theme.primary ?? "#023777"}; color:#fff; font:inherit; cursor:pointer; }
        .typing { color:#64748b; font-size:.8rem; padding:0 1rem .5rem; }
        .empty { color:#64748b; font-size:.85rem; }
      `,
    });
    if (!this.#open) {
      this.#root.replaceChildren(
        style,
        el("button", {
          class: "launcher",
          type: "button",
          "aria-label": "Ouvrir l'assistant",
          text: "💬",
          onclick: () => {
            this.#open = true;
            ctx.actions.openWidget({ width: 420, height: 680 });
            this.#render();
          },
        }),
      );
      return;
    }

    const messages = ctx.state.messages;
    const input = el("input", { type: "text", placeholder: "Votre message…" });
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      ctx.actions.sendMessage(text);
      input.value = "";
    };
    const panel = el("section", { class: "panel" }, [
      el("header", {}, [
        el("strong", { text: ctx.brand.name || "Assistant" }),
        el("button", {
          type: "button",
          "aria-label": "Fermer",
          text: "×",
          onclick: () => {
            this.#open = false;
            ctx.actions.closeWidget();
            this.#render();
          },
        }),
      ]),
      el(
        "div",
        { class: "messages" },
        messages.length === 0
          ? [el("p", { class: "empty", text: "Bonjour, comment pouvons-nous vous aider ?" })]
          : messages.map((message) =>
              el("div", {
                class: `message ${message.role}`,
                text: message.content,
              }),
            ),
      ),
      ctx.state.typing ? el("div", { class: "typing", text: "…" }) : null,
      el("div", { class: "composer" }, [
        input,
        el("button", { type: "button", text: "Envoyer", onclick: send }),
      ]),
      el("div", { style: "padding:0 .75rem .75rem;text-align:right" }, [
        el("button", {
          type: "button",
          text: "Terminer",
          style: "border:0;background:transparent;color:#475569;font:inherit;cursor:pointer",
          onclick: () => ctx.actions.finish(),
        }),
      ]),
    ]);
    this.#root.replaceChildren(style, panel);
    window.setTimeout(() => input.focus(), 0);
  }
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, StarterWidget);
