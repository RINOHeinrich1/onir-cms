"use client";

import type { ChatLinkSources } from "@/domain/entities/chat";

const LABELS: Record<keyof ChatLinkSources, string> = {
  connaissances: "Connaissances",
  phototheque: "Photothèque",
  lien: "Liens",
};

/**
 * Sélection des sources recherchées lors de la génération de réponse
 * (connaissances / photothèque / liens). Seules les sources cochées sont
 * interrogées (US-MEDIA-001).
 */
export function SourcesField({
  value,
  onChange,
}: {
  value: ChatLinkSources;
  onChange: (next: ChatLinkSources) => void;
}) {
  const keys = Object.keys(LABELS) as (keyof ChatLinkSources)[];
  return (
    <fieldset className="field sources-field">
      <legend>Données recherchées à la génération</legend>
      <span className="hint">
        Seules les sources cochées sont interrogées pour composer la réponse.
      </span>
      <div className="checks-row">
        {keys.map((key) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
            />{" "}
            {LABELS[key]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
