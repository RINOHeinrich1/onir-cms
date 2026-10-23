// Composant de référence : formulaire d'identification puis discussion.
// `useTemplate()` fournit phase/messages/params/actions avec re-render
// automatique à chaque mise à jour du contexte.
import { useState } from "react";
import { useTemplate } from "@onirtech/template-sdk/react";

export function Aurora() {
  const { phase, messages, params, actions } = useTemplate();
  const [draft, setDraft] = useState("");

  if (phase === "identity") {
    return (
      <form
        className="onirtech-identity"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const nom = String(data.get("nom") ?? "").trim();
          const email = String(data.get("email") ?? "").trim();
          if (nom === "" || email === "") return;
          actions.submitIdentity({
            nom,
            email,
            consentement: data.get("consentement") === "on",
          });
        }}
      >
        <h2>{String(params.titre ?? "Discutons de votre projet")}</h2>
        <label>
          Nom
          <input name="nom" type="text" placeholder="Votre nom" aria-label="Nom" required />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            placeholder="vous@exemple.mg"
            aria-label="Email"
            required
          />
        </label>
        <label className="check">
          <input name="consentement" type="checkbox" /> J&apos;accepte le traitement de mes données
        </label>
        <button type="submit">Démarrer la discussion</button>
      </form>
    );
  }

  return (
    <section className="onirtech-chat">
      <h2>{String(params.titre ?? "Discutons de votre projet")}</h2>
      <ul>
        {messages.map((message) => (
          <li key={message.id} className={message.role}>
            <div>{message.content}</div>
            {(message.medias ?? []).map((media, index) =>
              media.type === "photo" ? (
                <img key={index} src={media.url} alt={media.libelle} />
              ) : (
                <a key={index} href={media.url} target="_blank" rel="noopener noreferrer">
                  {media.libelle}
                </a>
              ),
            )}
          </li>
        ))}
      </ul>
      {messages.length === 0 ? <p>Bonjour !</p> : null}
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim() === "") return;
          actions.sendMessage(draft.trim());
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Votre message…"
          aria-label="Message"
        />
        <button type="submit">Envoyer</button>
      </form>
      <div className="footer">
        <button type="button" onClick={() => actions.finish()}>
          Terminer
        </button>
      </div>
    </section>
  );
}
