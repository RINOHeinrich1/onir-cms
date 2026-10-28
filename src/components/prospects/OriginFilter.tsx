"use client";

import { useRouter } from "next/navigation";

const MANUEL = "manuel";
const LINK_PREFIX = "lien:";

/**
 * Filtre multi-valeurs d'origine : manuels et/ou chatbots.
 * La valeur d'un chatbot reste son libellé exact, préfixé par `lien:`.
 */
export function OriginFilter({
  value,
  linkLabels,
}: {
  /** Valeurs sérialisées (`manuel` / `lien:<libellé>`), [] = toutes. */
  value: readonly string[];
  linkLabels: string[];
}) {
  const router = useRouter();
  const selected = new Set(value);
  const options = [
    MANUEL,
    ...[
      ...new Set([
        ...value.filter((entry) => entry.startsWith(LINK_PREFIX)),
        ...linkLabels.map((label) => `${LINK_PREFIX}${label}`),
      ]),
    ],
  ];

  const apply = (next: string[]): void => {
    const params = new URLSearchParams();
    for (const entry of next) params.append("origine", entry);
    const query = params.toString();
    router.push(query ? `/prospects?${query}` : "/prospects", { scroll: false });
  };

  const toggle = (entry: string): void => {
    apply(selected.has(entry) ? value.filter((item) => item !== entry) : [...value, entry]);
  };

  return (
    <div className="tag-filter">
      <details className="tag-filter-details">
        <summary className="tag-filter-trigger">
          <span className="tag-filter-label">Origine</span>
          <span className="tag-filter-value">
            {value.length === 0
              ? "Toutes les origines"
              : `${value.length} origine${value.length > 1 ? "s" : ""}`}
          </span>
          <span className="tag-filter-chevron" aria-hidden>
            ▾
          </span>
        </summary>
        <fieldset className="tag-filter-panel">
          <legend className="sr-only">Filtrer les prospects par origine</legend>
          <button
            type="button"
            className="tag-filter-clear"
            onClick={() => apply([])}
            disabled={value.length === 0}
          >
            Toutes les origines
          </button>
          {options.map((entry) => (
            <label key={entry} className="tag-filter-option">
              <input type="checkbox" checked={selected.has(entry)} onChange={() => toggle(entry)} />
              <span>
                {entry === MANUEL
                  ? "Manuels"
                  : entry === LINK_PREFIX
                    ? "Chatbot sans nom"
                    : entry.slice(LINK_PREFIX.length)}
              </span>
            </label>
          ))}
        </fieldset>
      </details>
      {value.length > 0 ? (
        <div className="tag-filter-chips">
          {value.map((entry) => (
            <span key={entry} className="tag-filter-chip">
              {entry === MANUEL
                ? "Manuels"
                : entry === LINK_PREFIX
                  ? "Chatbot sans nom"
                  : entry.slice(LINK_PREFIX.length)}
              <button
                type="button"
                aria-label={`Retirer le filtre origine`}
                onClick={() => toggle(entry)}
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
