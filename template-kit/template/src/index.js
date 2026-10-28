// Template de référence (starter) — Web Component respectant le contrat
// `onirtech.template-host.v1`. Aucune dépendance : DOM natif + Shadow DOM.
// Le template NE PARLE PAS à l'API : il lit `ctx` et appelle `ctx.actions.*`.

const ELEMENT = "onirtech-template-starter";

function paramText(ctx, key, fallback) {
  const value = ctx.params?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
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

class StarterTemplate extends HTMLElement {
  #root;
  #ctx;

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
    if (!ctx) {
      this.#root.replaceChildren(el("p", { text: "Chargement…" }));
      return;
    }
    const style = el("style", {
      text: `
        :host { display:block; font-family: system-ui, sans-serif; color:#111; }
        .wrap { max-width: 34rem; margin: 0 auto; padding: 1.25rem; }
        h2 { color: ${ctx.theme.primary ?? "#023777"}; margin: 0 0 .5rem; }
        form { display:flex; flex-direction:column; gap:.75rem; }
        label { display:flex; flex-direction:column; gap:.25rem; font-size:.9rem; }
        input { padding:.6rem .7rem; border:1px solid #cbd5e1; border-radius:.5rem; font:inherit; }
        .check { flex-direction:row; align-items:flex-start; gap:.5rem; }
        button { background:${ctx.theme.primary ?? "#023777"}; color:#fff; border:0;
          padding:.7rem 1rem; border-radius:.6rem; font:inherit; cursor:pointer; }
        button:disabled { opacity:.5; cursor:default; }
        ul { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:.6rem; }
        li { padding:.6rem .8rem; border-radius:.6rem; background:#f1f5f9; }
        li.assistant { background:#e2e8f0; }
        li.operator { background:#dcfce7; }
        .msg-author { font-size:.72rem; font-weight:700; color:#0f766e; margin-bottom:.2rem; }
        li img { max-width:16rem; border-radius:.5rem; display:block; margin-top:.4rem; }
        .composer { display:flex; gap:.5rem; margin-top:1rem; }
        .composer input { flex:1; }
      `,
    });

    const children = [style];
    if (ctx.state.phase === "identity") {
      children.push(this.#identityForm(ctx));
    } else {
      children.push(this.#chat(ctx));
    }
    this.#root.replaceChildren(el("div", { class: "wrap" }, children));
  }

  #identityForm(ctx) {
    const nom = el("input", { type: "text", name: "nom", required: "true", placeholder: "Votre nom" });
    const email = el("input", { type: "email", name: "email", required: "true", placeholder: "vous@exemple.mg" });
    const consent = el("input", { type: "checkbox", name: "consentement" });
    return el("section", {}, [
      el("h2", { text: "Discutons de votre projet" }),
      el("form", {
        onsubmit: (event) => {
          event.preventDefault();
          if (!nom.value.trim() || !email.value.trim()) return;
          ctx.actions.submitIdentity({
            nom: nom.value.trim(),
            email: email.value.trim(),
            consentement: consent.checked,
          });
        },
      }, [
        el("label", {}, ["Nom", nom]),
        el("label", {}, ["Email", email]),
        ctx.consent
          ? el("label", { class: "check" }, [
              consent,
              el("span", { text: ctx.consent.texte }),
              ctx.consent.lien
                ? el("a", { href: ctx.consent.lien, target: "_blank", rel: "noopener", text: " Politique de confidentialité" })
                : null,
            ])
          : null,
        el("button", { type: "submit", text: "Démarrer la discussion" }),
      ]),
    ]);
  }

  #chat(ctx) {
    const items = ctx.state.messages.map((message) => {
      const media = (message.medias ?? []).map((m) =>
        m.type === "photo"
          ? el("img", { src: m.url, alt: m.libelle })
          : el("div", {}, [el("a", { href: m.url, target: "_blank", rel: "noopener", text: m.libelle })]),
      );
      const author =
        typeof message.authorName === "string"
          ? el("div", { class: "msg-author", text: message.authorName })
          : null;
      return el(
        "li",
        { class: `${message.role}${author === null ? "" : " operator"}` },
        [...(author === null ? [] : [author]), el("div", { text: message.content }), ...media],
      );
    });

    const input = el("input", { type: "text", placeholder: "Votre message…" });
    const send = () => {
      if (!input.value.trim()) return;
      ctx.actions.sendMessage(input.value.trim());
      input.value = "";
    };
    const title = paramText(ctx, "chat_title", ctx.brand.name || "Discussion");
    const welcomeTitle = paramText(ctx, "welcome_title", "Bienvenue");
    const welcomeMessage = paramText(
      ctx,
      "welcome_message",
      "Décrivez votre demande. Je vous réponds directement ici.",
    );
    return el("section", {}, [
      el("h2", { text: title }),
      el("ul", {}, items.length ? items : [
        el("li", { class: "assistant" }, [
          el("strong", { text: welcomeTitle }),
          el("div", { text: welcomeMessage }),
        ]),
      ]),
      ctx.state.typing ? el("p", { text: "…" }) : null,
      el("div", { class: "composer" }, [
        input,
        el("button", {
          type: "button",
          text: "Envoyer",
          onclick: send,
        }),
      ]),
      el("div", { style: "margin-top:1rem" }, [
        el("button", { type: "button", text: "Terminer", onclick: () => ctx.actions.finish() }),
      ]),
    ]);
  }
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, StarterTemplate);
