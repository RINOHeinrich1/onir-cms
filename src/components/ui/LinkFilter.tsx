"use client";

import { useRouter } from "next/navigation";

/**
 * Filtre multi-valeurs par chatbot (libellé exact).
 * `[]` = tous les chatbots ; `""` = chatbot sans nom.
 */
export function LinkFilter({
  basePath,
  value,
  labels,
  preserve = {},
}: {
  basePath: string;
  value: readonly string[];
  labels: string[];
  preserve?: Record<string, string>;
}) {
  const router = useRouter();
  const selected = new Set(value);
  const options = [...new Set([...value, ...labels])];

  const apply = (next: string[]): void => {
    const params = new URLSearchParams(preserve);
    for (const label of next) params.append("lien", label);
    const query = params.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  const toggle = (label: string): void => {
    apply(selected.has(label) ? value.filter((entry) => entry !== label) : [...value, label]);
  };

  return (
    <div className="tag-filter">
      <details className="tag-filter-details">
        <summary className="tag-filter-trigger">
          <span className="tag-filter-label">Chatbot</span>
          <span className="tag-filter-value">
            {value.length === 0
              ? "Tous les chatbots"
              : `${value.length} chatbot${value.length > 1 ? "s" : ""}`}
          </span>
          <span className="tag-filter-chevron" aria-hidden>
            ▾
          </span>
        </summary>
        <fieldset className="tag-filter-panel">
          <legend className="sr-only">Filtrer par chatbot</legend>
          <button
            type="button"
            className="tag-filter-clear"
            onClick={() => apply([])}
            disabled={value.length === 0}
          >
            Tous les chatbots
          </button>
          {options.map((label) => (
            <label key={label} className="tag-filter-option">
              <input type="checkbox" checked={selected.has(label)} onChange={() => toggle(label)} />
              <span>{label === "" ? "Chatbot sans nom" : label}</span>
            </label>
          ))}
        </fieldset>
      </details>
      {value.length > 0 ? (
        <div className="tag-filter-chips">
          {value.map((label) => (
            <span key={label} className="tag-filter-chip">
              {label === "" ? "Chatbot sans nom" : label}
              <button
                type="button"
                aria-label={`Retirer le filtre ${label === "" ? "chatbot sans nom" : label}`}
                onClick={() => toggle(label)}
              >
                ×
              </button>
            </span>
          ))}
          <button type="button" className="tag-filter-clear-inline" onClick={() => apply([])}>
            Tout effacer
          </button>
        </div>
      ) : null}
    </div>
  );
}
