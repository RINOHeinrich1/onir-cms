// Formulaire du sas d'entrée (nom / email / consentement).
import { h } from "../lib/dom.js";
import { isValidEmail } from "../lib/identity.js";

export function createEntryUI({ root, onSubmit }) {
  const panel = h("div", { class: "panel" });
  const el = h("div", { class: "entry" }, [panel]);
  root.append(el);

  let built = false;
  let sending = false;
  let consentRequired = false;
  let form = null, name = null, email = null, consent = null, btn = null;

  function isValid() {
    const nom = (name?.value ?? "").trim();
    const mail = (email?.value ?? "").trim();
    const consentOk = consentRequired ? !!consent?.checked : true;
    return nom.length > 0 && isValidEmail(mail) && consentOk;
  }

  function refresh() {
    if (btn) btn.disabled = sending || !isValid();
  }

  function render(host) {
    if (built || !host) return;
    built = true;
    consentRequired = !!host.consent;
    name = h("input", { type: "text", placeholder: "Votre nom", autocomplete: "name" });
    email = h("input", { type: "email", placeholder: "vous@exemple.mg", autocomplete: "email" });
    consent = h("input", { type: "checkbox" });
    btn = h("button", { type: "submit", text: "Ouvrir la porte", disabled: true });
    const onInput = () => refresh();
    name.addEventListener("input", onInput);
    email.addEventListener("input", onInput);
    consent.addEventListener("change", onInput);
    const consentLabel = host.consent
      ? h("label", { class: "check" }, [
          consent,
          h("span", {}, [
            host.consent.texte || "J'accepte la politique de confidentialité",
            host.consent.lien
              ? h("a", {
                  class: "form-link", href: host.consent.lien, text: " En savoir plus",
                  onclick: (e) => { e.preventDefault(); host.actions.openMedia(host.consent.lien); },
                })
              : null,
          ]),
        ])
      : null;
    form = h("form", { class: "form", onsubmit: (e) => onSubmit(e) }, [
      h("label", {}, ["Nom", name]),
      h("label", {}, ["Email", email]),
      consentLabel,
      btn,
    ]);
    panel.replaceChildren(
      h("h1", { class: "entry-title", text: "Bienvenue" }),
      host.brand?.name ? h("p", { class: "entry-brand", text: host.brand.name }) : null,
      h("p", { class: "entry-sub", text: "Présentez-vous, puis ouvrez la porte pour entrer." }),
      form,
    );
    refresh();
  }

  function show() { el.classList.add("show"); }
  function hide() { el.classList.remove("show", "opening"); }
  /** Formulaire AFFICHÉ (sas) — conditionne la visibilité des actions extérieures. */
  function isShown() { return el.classList.contains("show"); }
  function values() {
    return {
      nom: (name?.value ?? "").trim(),
      email: (email?.value ?? "").trim(),
      consentement: consentRequired ? !!consent?.checked : true,
    };
  }
  function setSending(value) {
    sending = value;
    if (name) name.disabled = value;
    if (email) email.disabled = value;
    if (consent) consent.disabled = value;
    refresh();
  }

  return { el, render, show, hide, isShown, values, isValid, setSending, refresh };
}
