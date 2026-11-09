"use client";

import { HelpHint } from "@/components/ui/HelpHint";
import type { ChatbotConfigDraft } from "./chatbot-config-draft";

const LABELS = {
  ai: "Conversationnelle",
  semi_heuristic: "Semi-heuristique (formulaire)",
} as const;

export function ChatbotCollectionModeField({
  value,
  onChange,
}: {
  value: ChatbotConfigDraft;
  onChange: (value: ChatbotConfigDraft) => void;
}) {
  if (value.mission === "inform") return null;
  const hasFiche = value.fiches.length > 0;

  return (
    <section className="chatbot-card">
      <div className="chatbot-card-head">
        <div>
          <h2>
            Stratégie de collecte
            <HelpHint label="Aide sur la stratégie de collecte">
              En semi-heuristique, l’IA ne collecte pas les champs en texte : elle explique les
              champs et invite à ouvrir le formulaire. Le formulaire reste disponible dès le début
              du chat.
            </HelpHint>
          </h2>
          <p className="hint">
            Comment les informations sont recueillies lorsque le visiteur veut remplir une fiche.
          </p>
        </div>
        <span className="badge">{LABELS[value.collectionMode]}</span>
      </div>
      <fieldset className="fieldset" disabled={!hasFiche}>
        <legend>Mode de collecte</legend>
        <div className="template-mode-switch">
          {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`btn ghost small${value.collectionMode === mode ? " active" : ""}`}
              aria-pressed={value.collectionMode === mode}
              onClick={() => onChange({ ...value, collectionMode: mode })}
            >
              {LABELS[mode]}
            </button>
          ))}
        </div>
        {hasFiche ? (
          <p className="hint">
            {value.collectionMode === "semi_heuristic"
              ? "Le formulaire est la seule source de collecte. L’IA informe, explique les champs et refuse les données saisies en texte."
              : "L’IA conduit la collecte par la conversation et enrichit la fiche au fil des messages."}
          </p>
        ) : (
          <p className="hint">Ajoutez au moins une fiche pour choisir une stratégie de collecte.</p>
        )}
      </fieldset>
    </section>
  );
}
