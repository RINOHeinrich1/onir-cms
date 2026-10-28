"use client";

import type { CreatorOption } from "./creator-options";
import { NO_CREATOR } from "./creator-options";

export function CreatorFilter({
  options,
  showUnassigned,
  value,
  onChange,
}: {
  options: CreatorOption[];
  showUnassigned: boolean;
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const selected = new Set(value);
  const labels = new Map(options.map((option) => [option.id, option.label]));
  if (showUnassigned) labels.set(NO_CREATOR, "Non renseigné");

  const toggle = (id: string): void => {
    onChange(selected.has(id) ? value.filter((entry) => entry !== id) : [...value, id]);
  };

  return (
    <div className="tag-filter">
      <details className="tag-filter-details">
        <summary className="tag-filter-trigger">
          <span className="tag-filter-label">Créé par</span>
          <span className="tag-filter-value">
            {value.length === 0
              ? "Tous les créateurs"
              : `${value.length} créateur${value.length > 1 ? "s" : ""}`}
          </span>
          <span className="tag-filter-chevron" aria-hidden>
            ▾
          </span>
        </summary>
        <fieldset className="tag-filter-panel">
          <legend className="sr-only">Filtrer par créateur</legend>
          <button
            type="button"
            className="tag-filter-clear"
            onClick={() => onChange([])}
            disabled={value.length === 0}
          >
            Tous les créateurs
          </button>
          {options.map((option) => (
            <label key={option.id} className="tag-filter-option">
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                onChange={() => toggle(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {showUnassigned ? (
            <label className="tag-filter-option">
              <input
                type="checkbox"
                checked={selected.has(NO_CREATOR)}
                onChange={() => toggle(NO_CREATOR)}
              />
              <span>Non renseigné</span>
            </label>
          ) : null}
        </fieldset>
      </details>
      {value.length > 0 ? (
        <div className="tag-filter-chips">
          {value.map((id) => (
            <span key={id} className="tag-filter-chip">
              {labels.get(id) ?? "Créateur"}
              <button
                type="button"
                aria-label={`Retirer le filtre ${labels.get(id) ?? "créateur"}`}
                onClick={() => toggle(id)}
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" className="tag-filter-clear-inline" onClick={() => onChange([])}>
            Tout effacer
          </button>
        </div>
      ) : null}
    </div>
  );
}
