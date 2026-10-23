// Interface du template vanilla : les deux phases du contrat
// (`identity` puis `chat`). Aucune dépendance hors SDK, aucun `innerHTML`.
import { h, hasCapability, param } from "@onirtech/template-sdk";

/** Formulaire d'identification (phase `identity`). */
export function identity(ctx) {
  const nom = h("input", {
    name: "nom",
    type: "text",
    placeholder: "Votre nom",
    "aria-label": "Nom",
    required: "true",
  });
  const email = h("input", {
    name: "email",
    type: "email",
    placeholder: "vous@exemple.mg",
    "aria-label": "Email",
    required: "true",
  });
  const consentement = h("input", { name: "consentement", type: "checkbox" });

  return h(
    "form",
    {
      class: "onirtech-identity",
      onsubmit: (event) => {
        event.preventDefault();
        if (nom.value.trim() === "" || email.value.trim() === "") return;
        ctx.actions.submitIdentity({
          nom: nom.value.trim(),
          email: email.value.trim(),
          consentement: consentement.checked,
        });
      },
    },
    h("h2", { text: param(ctx, "titre", "Discutons de votre projet") }),
    h("label", {}, "Nom", nom),
    h("label", {}, "Email", email),
    h(
      "label",
      { class: "check" },
      consentement,
      ` ${ctx.consent?.texte ?? "J'accepte le traitement de mes données"}`,
    ),
    h("button", { type: "submit", text: "Démarrer la discussion" }),
  );
}

/** Discussion (phase `chat`). */
export function chat(ctx) {
  const champ = h("input", {
    type: "text",
    placeholder: "Votre message…",
    "aria-label": "Message",
  });
  const envoyer = () => {
    if (champ.value.trim() === "") return;
    ctx.actions.sendMessage(champ.value.trim());
    champ.value = "";
  };

  const messages = ctx.state.messages.map((message) =>
    h(
      "li",
      { class: message.role },
      h("div", { text: message.content }),
      ...(message.medias ?? []).map((media) =>
        media.type === "photo"
          ? h("img", { src: media.url, alt: media.libelle })
          : h("a", { href: media.url, target: "_blank", rel: "noopener", text: media.libelle }),
      ),
    ),
  );

  return h(
    "section",
    { class: "onirtech-chat" },
    h("h2", { text: param(ctx, "titre", "Discutons de votre projet") }),
    hasCapability(ctx, "media") ? h("p", { class: "hint", text: "Photos et liens disponibles" }) : null,
    h(
      "ul",
      {},
      ...(messages.length ? messages : [h("li", { class: "assistant", text: "Bonjour !" })]),
    ),
    ctx.state.typing ? h("p", { class: "typing", text: "…" }) : null,
    h(
      "div",
      { class: "composer" },
      champ,
      h("button", { type: "button", text: "Envoyer", onclick: envoyer }),
    ),
    h(
      "div",
      { class: "footer" },
      h("button", { type: "button", text: "Terminer", onclick: () => ctx.actions.finish() }),
    ),
  );
}
