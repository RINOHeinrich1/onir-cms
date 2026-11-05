"use client";

import type { ChatbotSourceMeta } from "./chatbot-config-draft";

type SourceKey = keyof ChatbotSourceMeta;

const TITLES: Record<SourceKey, string> = {
  fiches: "Fiches existantes",
  connaissances: "Connaissances",
  medias: "Médias",
};

export function ChatbotSourceLabelsFields({
  value,
  onChange,
}: {
  value: ChatbotSourceMeta;
  onChange: (value: ChatbotSourceMeta) => void;
}) {
  return (
    <div className="chatbot-config">
      {(Object.keys(TITLES) as SourceKey[]).map((key) => (
        <fieldset className="fieldset" key={key}>
          <legend>{TITLES[key]}</legend>
          <div className="field-row">
            <label className="field">
              Libellé de la source
              <input
                type="text"
                maxLength={120}
                value={value[key].label}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [key]: { ...value[key], label: event.target.value },
                  })
                }
              />
            </label>
            <label className="field">
              Quand l’utiliser
              <input
                type="text"
                maxLength={400}
                value={value[key].usageHint}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [key]: { ...value[key], usageHint: event.target.value },
                  })
                }
              />
            </label>
          </div>
        </fieldset>
      ))}
    </div>
  );
}
