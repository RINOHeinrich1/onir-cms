"use client";

import { HelpHint } from "@/components/ui/HelpHint";
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
      <legend>
        Opération du chatbot *
        <HelpHint label="Aide sur l’opération">
          L’opération est enregistrée avec le chatbot. En mode hybride, il peut informer ou
          collecter : la collecte est privilégiée lorsqu’une fiche est déjà en cours, ou lorsque le
          visiteur demande explicitement à la remplir.
        </HelpHint>
      </legend>
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
      {value === "inform" ? (
        <span className="hint">
          Aucune fiche de collecte n’est utilisée. Les sources actives sont définies dans l’étape
          Alimentation.
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
