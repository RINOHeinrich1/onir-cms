"use client";

import { HelpHint } from "@/components/ui/HelpHint";
import type { ChatbotMission } from "@/domain/entities/chatbot-information";

const LABELS: Record<ChatbotMission, string> = {
  collect: "Collecter des fiches",
  inform: "Informer avec des sources",
  hybrid: "Collecter et informer",
};

const EXPLANATIONS: Record<ChatbotMission, string> = {
  collect: "Aucune source de recherche, de connaissances ou de médias n’est consommée.",
  inform:
    "Aucune fiche de collecte n’est utilisée. Les sources actives sont définies dans l’étape Alimentation.",
  hybrid:
    "Les étapes Collecte et Alimentation sont affichées. La collecte est privilégiée si une fiche est déjà en cours ou demandée explicitement.",
};

export function ChatbotMissionField({
  value,
  onChange,
}: {
  value: ChatbotMission;
  onChange: (value: ChatbotMission) => void;
}) {
  return (
    <section className="chatbot-card chatbot-mission">
      <div className="chatbot-card-head">
        <h2>
          Opération *
          <HelpHint label="Aide sur l’opération">
            L’opération est enregistrée avec le chatbot. En mode hybride, il peut informer ou
            collecter : la collecte est privilégiée lorsqu’une fiche est déjà en cours, ou lorsque
            le visiteur demande explicitement à la remplir.
          </HelpHint>
        </h2>
        <span className="badge on">{LABELS[value]}</span>
      </div>
      <fieldset className="chatbot-mission-options">
        <legend className="sr-only">Opération du chatbot</legend>
        <div className="checks-row">
          {(Object.keys(LABELS) as ChatbotMission[]).map((mission) => (
            <label key={mission} className="check">
              <input
                type="radio"
                name="chatbot-mission"
                value={mission}
                checked={value === mission}
                onChange={() => onChange(mission)}
              />{" "}
              {LABELS[mission]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="chatbot-mission-explanation">{EXPLANATIONS[value]}</p>
    </section>
  );
}
