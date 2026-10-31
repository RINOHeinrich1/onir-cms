// Template de référence (starter) — Web Component respectant le contrat
// `onirtech.template-host.v1`. Aucune dépendance : DOM natif + Shadow DOM.
// Le template NE PARLE PAS à l'API : il lit `ctx` et appelle `ctx.actions.*`.

const ELEMENT = "onirtech-template-starter";

function paramText(ctx, key, fallback) {
  const value = ctx.params?.[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

function safeColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

function paramColor(ctx, key, themeKey, fallback) {
  return safeColor(ctx.params?.[key], safeColor(ctx.theme?.[themeKey], fallback));
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
  #collectionOpen = false;

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
      this.#root.replaceChildren(el("p", { class: "loading", text: "Chargement…" }));
      return;
    }

    const primary = paramColor(ctx, "primary_color", "primary", "#023777");
    const accent = paramColor(ctx, "accent_color", "accent", "#fcad28");
    const background = paramColor(ctx, "background_color", "background", "#f7f9fc");
    const surface = paramColor(ctx, "surface_color", "surface", "#ffffff");
    const ink = paramColor(ctx, "text_color", "text", "#0f172a");
    const muted = paramColor(ctx, "muted_color", "muted", "#64748b");
    const border = paramColor(ctx, "border_color", "border", "#e2e8f0");

    const style = el("style", {
      text: `
        :host {
          display: block;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: ${ink};
          --page-primary: ${primary};
          --page-accent: ${accent};
          --page-bg: ${background};
          --page-surface: ${surface};
          --page-ink: ${ink};
          --page-muted: ${muted};
          --page-border: ${border};
        }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, textarea { font: inherit; }
        button { -webkit-tap-highlight-color: transparent; }
        [hidden] { display: none !important; }
        .page {
          width: min(760px, calc(100% - 32px));
          margin: 24px auto;
          overflow: hidden;
          border: 1px solid var(--page-border);
          border-radius: 22px;
          background: var(--page-surface);
          box-shadow: 0 24px 70px rgba(15, 23, 42, .12);
        }
        .head {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 18px;
          color: #fff;
          background: linear-gradient(135deg, var(--page-primary), color-mix(in srgb, var(--page-primary) 82%, #000));
        }
        .avatar {
          flex: none;
          width: 42px;
          height: 42px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: color-mix(in srgb, #fff 18%, transparent);
          border: 1px solid color-mix(in srgb, #fff 25%, transparent);
          font-size: 16px;
          font-weight: 800;
        }
        .avatar img { width: 100%; height: 100%; object-fit: cover; }
        .head-copy { flex: 1; min-width: 0; }
        .head-copy h1 {
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 15px;
          font-weight: 750;
        }
        .status { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 11px; opacity: .82; }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; }
        .status-dot.done { background: #fbbf24; }
        .finish {
          flex: none;
          height: 32px;
          padding: 0 12px;
          border: 1px solid color-mix(in srgb, #fff 32%, transparent);
          border-radius: 999px;
          background: transparent;
          color: inherit;
          font-size: 10px;
          font-weight: 750;
          letter-spacing: .08em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .finish:hover:not(:disabled) { background: color-mix(in srgb, #fff 14%, transparent); }
        .finish:disabled { opacity: .45; cursor: not-allowed; }
        .body { display: flex; flex-direction: column; min-height: 520px; }
        .log {
          flex: 1;
          max-height: 560px;
          overflow-y: auto;
          padding: 18px;
          background: var(--page-bg);
        }
        .intro { display: flex; gap: 10px; margin-bottom: 18px; padding: 14px; border: 1px solid var(--page-border); border-radius: 14px; background: var(--page-surface); }
        .intro strong { display: block; margin-bottom: 3px; font-size: 13px; }
        .intro span { color: var(--page-muted); font-size: 12px; line-height: 1.5; }
        .messages { list-style: none; display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; }
        .message { display: flex; gap: 9px; align-items: flex-end; }
        .message.user { flex-direction: row-reverse; }
        .bubble {
          max-width: 82%;
          padding: 10px 13px;
          border: 1px solid var(--page-border);
          border-radius: 14px 14px 14px 5px;
          background: var(--page-surface);
          color: var(--page-ink);
          font-size: 13px;
          line-height: 1.55;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .message.user .bubble { border-color: transparent; border-radius: 14px 14px 5px 14px; background: var(--page-primary); color: #fff; }
        .message.operator .bubble { background: #ecfdf5; }
        .msg-author { margin-bottom: 4px; color: #0f766e; font-size: 9px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
        .media { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .media img { max-width: 220px; border-radius: 9px; display: block; }
        .media a { color: var(--page-primary); font-size: 12px; }
        .typing { margin: 14px 0 0; color: var(--page-muted); font-size: 12px; }
        .fallback {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin: 16px 0 0;
          padding: 14px;
          border: 1px dashed var(--page-border);
          border-radius: 14px;
          background: var(--page-surface);
        }
        .fallback-intro { margin: 0; font-size: 12.5px; font-weight: 700; line-height: 1.45; }
        .fallback-options { display: flex; flex-direction: column; gap: 6px; }
        .fallback-option, .fallback-form {
          padding: 9px 11px;
          border: 1px solid var(--page-border);
          border-radius: 10px;
          background: var(--page-bg);
          color: var(--page-primary);
          font-size: 12px;
          font-weight: 650;
          text-align: left;
          cursor: pointer;
        }
        .fallback-option:hover, .fallback-form:hover { border-color: var(--page-primary); }
        .fallback-form { text-align: center; }
        .composer { padding: 12px 14px 14px; border-top: 1px solid var(--page-border); background: var(--page-surface); }
        .composer-box { display: flex; align-items: flex-end; gap: 8px; padding: 8px 8px 8px 14px; border: 1.5px solid var(--page-border); border-radius: 14px; background: var(--page-surface); }
        .composer-box:focus-within { border-color: var(--page-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--page-primary) 14%, transparent); }
        .composer textarea { flex: 1; min-height: 30px; max-height: 110px; padding: 4px 0; border: 0; outline: 0; resize: none; background: transparent; color: var(--page-ink); font-size: 13px; line-height: 1.45; }
        .send { flex: none; width: 36px; height: 36px; border: 0; border-radius: 11px; background: var(--page-primary); color: #fff; font-size: 16px; cursor: pointer; }
        .hint { margin: 7px 2px 0; color: var(--page-muted); font-size: 10px; text-align: center; }
        .done { padding: 12px 16px; border-top: 1px solid #bbf7d0; background: #f0fdf4; color: #166534; font-size: 12px; font-weight: 650; }
        .identity { padding: 22px; }
        .identity h2 { margin: 0 0 5px; color: var(--page-primary); font-size: 18px; }
        .identity p { margin: 0 0 16px; color: var(--page-muted); font-size: 13px; line-height: 1.5; }
        .identity form { display: flex; flex-direction: column; gap: 12px; }
        .identity label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 650; }
        .identity input[type="text"], .identity input[type="email"] { padding: 10px 11px; border: 1px solid var(--page-border); border-radius: 10px; background: var(--page-surface); color: var(--page-ink); }
        .identity .check { flex-direction: row; align-items: flex-start; gap: 8px; font-weight: 400; line-height: 1.45; }
        .identity button[type="submit"] { padding: 11px; border: 0; border-radius: 10px; background: var(--page-primary); color: #fff; font-weight: 700; cursor: pointer; }
        .identity a { color: var(--page-primary); }
        .collection { margin-top: 16px; padding: 16px; border: 1px solid var(--page-border); border-radius: 14px; background: var(--page-surface); }
        .collection h3 { margin: 0 0 12px; color: var(--page-primary); font-size: 14px; }
        .collection form { display: flex; flex-direction: column; gap: 10px; }
        .collection label { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; font-weight: 650; }
        .collection input, .collection textarea, .collection select { padding: 9px 10px; border: 1px solid var(--page-border); border-radius: 9px; background: var(--page-surface); color: var(--page-ink); font-size: 12.5px; }
        .collection textarea { min-height: 72px; resize: vertical; }
        .collection-actions { display: flex; gap: 8px; margin-top: 4px; }
        .collection-actions button { flex: 1; padding: 10px; border: 1px solid var(--page-border); border-radius: 9px; background: var(--page-bg); color: var(--page-ink); cursor: pointer; }
        .collection-actions button[type="submit"] { border-color: var(--page-primary); background: var(--page-primary); color: #fff; font-weight: 700; }
        .loading { padding: 24px; text-align: center; color: #64748b; }
        @media (max-width: 520px) {
          .page { width: 100%; margin: 0; border-radius: 0; border-left: 0; border-right: 0; }
          .body { min-height: calc(100vh - 75px); }
          .log { max-height: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
        }
      `,
    });

    const title = paramText(ctx, "chat_title", ctx.brand.name || "Discussion");
    const logo =
      typeof ctx.brand.logoUrl === "string" && ctx.brand.logoUrl !== ""
        ? el("img", { src: ctx.brand.logoUrl, alt: "" })
        : el("span", { text: (ctx.brand.name || "A").slice(0, 1).toUpperCase() });
    const finalised = ctx.state.status === "finalisee";
    const header = el("header", { class: "head" }, [
      el("div", { class: "avatar" }, [logo]),
      el("div", { class: "head-copy" }, [
        el("h1", { text: title }),
        el("span", { class: "status" }, [
          el("span", { class: `status-dot${finalised ? " done" : ""}` }),
          el("span", { text: finalised ? "Demande enregistrée" : "Assistant en ligne" }),
        ]),
      ]),
    ]);

    const content =
      ctx.state.phase === "identity"
        ? this.#identityForm(ctx)
        : this.#chat(ctx, finalised, header);
    this.#root.replaceChildren(style, el("main", { class: "page" }, [header, content]));
  }

  #identityForm(ctx) {
    const nom = el("input", { type: "text", name: "nom", required: "true", placeholder: "Votre nom" });
    const email = el("input", { type: "email", name: "email", required: "true", placeholder: "vous@exemple.mg" });
    const consent = el("input", { type: "checkbox", name: "consentement" });
    return el("div", { class: "identity" }, [
      el("h2", { text: "Discutons de votre projet" }),
      el("p", { text: "Quelques informations suffisent pour démarrer la conversation." }),
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
              el("span", {}, [
                el("span", { text: ctx.consent.texte }),
                ctx.consent.lien
                  ? el("a", { href: ctx.consent.lien, target: "_blank", rel: "noopener", text: " Politique de confidentialité" })
                  : null,
              ]),
            ])
          : null,
        el("button", { type: "submit", text: "Démarrer la discussion" }),
      ]),
    ]);
  }

  #chat(ctx, finalised, header) {
    const items = ctx.state.messages.map((message) => {
      const media = (message.medias ?? []).map((m) =>
        m.type === "photo"
          ? el("img", { src: m.url, alt: m.libelle })
          : el("a", { href: m.url, target: "_blank", rel: "noopener", text: m.libelle }),
      );
      const author =
        typeof message.authorName === "string"
          ? el("div", { class: "msg-author", text: message.authorName })
          : null;
      const bubble = el("div", { class: "bubble" }, [
        ...(author === null ? [] : [author]),
        el("div", { text: message.content }),
        media.length > 0 ? el("div", { class: "media" }, media) : null,
      ]);
      return el("li", { class: `message ${message.role}${author === null ? "" : " operator"}` }, [bubble]);
    });

    const welcomeTitle = paramText(ctx, "welcome_title", "Bienvenue");
    const welcomeMessage = paramText(
      ctx,
      "welcome_message",
      "Décrivez votre demande. Je vous réponds directement ici.",
    );
    const intro = el("div", { class: "intro" }, [
      el("div", {}, [
        el("strong", { text: welcomeTitle }),
        el("span", { text: welcomeMessage }),
      ]),
    ]);

    const fallback = ctx.state.fallback;
    const modelForm = Array.isArray(ctx.resources.modelForm) ? ctx.resources.modelForm : [];
    const hasCollection = modelForm.length > 0;
    const collectionOpen = this.#collectionOpen && hasCollection;
    const fallbackView = fallback && !collectionOpen
      ? el("section", { class: "fallback", "aria-live": "polite" }, [
          el("p", { class: "fallback-intro", text: fallback.intro }),
          el("div", { class: "fallback-options" }, fallback.questions.map((question) =>
            el("button", {
              type: "button",
              class: "fallback-option",
              text: question.label,
              onclick: () => ctx.actions.selectFallback(question.id),
            }),
          )),
          fallback.showCollectionForm && hasCollection
            ? el("button", {
                type: "button",
                class: "fallback-form",
                text: "Remplir le formulaire",
                onclick: () => {
                  this.#collectionOpen = true;
                  ctx.actions.openCollectionForm();
                  this.#render();
                },
              })
            : null,
        ])
      : null;

    const textarea = el("textarea", {
      rows: "1",
      maxlength: "4000",
      placeholder: "Écrivez votre message…",
      "aria-label": "Votre message",
    });
    const sendMessage = () => {
      const content = textarea.value.trim();
      if (content === "") return;
      ctx.actions.sendMessage(content);
      textarea.value = "";
      textarea.style.height = "";
    };
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        sendMessage();
      }
    });
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
    });

    const composer = el("div", { class: "composer" }, [
      el("div", { class: "composer-box" }, [
        textarea,
        el("button", {
          type: "button",
          class: "send",
          "aria-label": "Envoyer",
          text: "➤",
          onclick: sendMessage,
        }),
      ]),
    ]);

    const collectionForm = collectionOpen ? this.#collectionForm(ctx, modelForm) : null;
    const finish =
      hasCollection && !fallback && !collectionOpen && !finalised && ctx.state.messages.length > 0
        ? el("button", {
            type: "button",
            class: "finish",
            text: "Terminer",
            onclick: () => ctx.actions.finish(),
          })
        : null;
    headerAction(header, finish);

    const log = el("div", { class: "log", role: "log", "aria-live": "polite" }, [
      intro,
      el("ul", { class: "messages" }, items),
      ctx.state.typing ? el("p", { class: "typing", text: "L’assistant écrit…" }) : null,
      fallbackView,
      collectionForm,
    ]);

    const body = el("div", { class: "body" }, [
      log,
      finalised
        ? el("p", { class: "done", text: "Votre demande a bien été enregistrée." })
        : fallback === undefined && !collectionOpen
          ? composer
          : null,
    ]);
    queueMicrotask(() => {
      log.scrollTop = log.scrollHeight;
      if (fallback === undefined) textarea.focus();
    });
    return body;
  }

  #collectionForm(ctx, fields) {
    const values = {};
    const controls = [];
    for (const field of fields) {
      if (field.type === "file") continue;
      let control;
      if (field.type === "textarea") {
        control = el("textarea", { name: field.name, maxlength: "4000" });
      } else if (field.type === "select" && Array.isArray(field.options)) {
        control = el("select", { name: field.name }, [
          el("option", { value: "", text: "Choisir…" }),
          ...field.options.map((option) => el("option", { value: option, text: option })),
        ]);
      } else {
        control = el("input", {
          type: field.type === "email" ? "email" : field.type === "url" ? "url" : "text",
          name: field.name,
          maxlength: "4000",
        });
      }
      controls.push(
        el("label", {}, [
          `${field.label}${field.required ? " *" : ""}`,
          control,
        ]),
      );
    }
    return el("section", { class: "collection" }, [
      el("h3", { text: "Compléter la fiche" }),
      el("form", {
        onsubmit: async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          for (const field of fields) {
            if (field.type === "file") continue;
            const control = form.elements.namedItem(field.name);
            values[field.name] = control !== null && "value" in control ? control.value : "";
          }
          await ctx.actions.submitCollection(values);
          this.#collectionOpen = false;
          this.#render();
        },
      }, [
        ...controls,
        el("div", { class: "collection-actions" }, [
          el("button", {
            type: "button",
            text: "Annuler",
            onclick: () => {
              this.#collectionOpen = false;
              this.#render();
            },
          }),
          el("button", { type: "submit", text: "Enregistrer" }),
        ]),
      ]),
    ]);
  }
}

/** Ajoute l'action Terminer dans l'en-tête après construction. */
function headerAction(header, finish) {
  if (finish === null) return;
  const copy = header.querySelector(".head-copy");
  if (copy !== null) copy.after(finish);
}

if (!customElements.get(ELEMENT)) customElements.define(ELEMENT, StarterTemplate);
