"use client";

import type { ChatbotMission } from "@/domain/entities/chatbot-information";

const LABELS: Record<ChatbotMission, string> = {
  collect: "Collecter des fiches",
  inform: "Informer avec des sources",
  hybrid: "Collecter et informer",
};

export function ChatbotMissionField({
  value,
  onChange,
}: {
  value: ChatbotMission;
  onChange: (value: ChatbotMission) => void;
}) {
  return (
    <fieldset className="field">
      <legend>Mission du chatbot *</legend>
      <span className="hint">
        La mission est stable. En mode hybride, le chatbot informe d’abord et ne collecte que si le
        visiteur le demande explicitement.
      </span>
      <div className="checks-row">
        {(Object.keys(LABELS) as ChatbotMission[]).map((mission) => (
          <label key={mission} className="check">
            <input
              type="radio"
              name="chatbot-mission"
              checked={value === mission}
              onChange={() => onChange(mission)}
            />{" "}
            {LABELS[mission]}
          </label>
        ))}
      </div>
      {value === "inform" ? (
        <span className="hint">
          Aucune fiche de collecte n’est utilisée. Les sources actives sont définies dans l’étape
          Données et Outils.
        </span>
      ) : null}
      {value === "collect" ? (
        <span className="hint">
          Aucune source de recherche, de connaissances ou de médias n’est consommée.
        </span>
      ) : null}
    </fieldset>
  );
}
