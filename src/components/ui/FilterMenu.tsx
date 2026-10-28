"use client";

import { useEffect, useId, useState } from "react";

export type FilterMenuOption = { value: string; label: string };

export type FilterMenuSection = {
  id: string;
  label: string;
  options: FilterMenuOption[];
  value: readonly string[];
};

function valuesBySection(sections: readonly FilterMenuSection[]): Record<string, string[]> {
  return Object.fromEntries(sections.map((section) => [section.id, [...section.value]]));
}

/** Bouton unique de filtres : sections indépendantes, tags cumulatifs, application groupée. */
export function FilterMenu({
  sections,
  onApply,
}: {
  sections: readonly FilterMenuSection[];
  onApply: (values: Record<string, string[]>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>(() => valuesBySection(sections));
  const [queries, setQueries] = useState<Record<string, string>>({});
  const panelId = useId();
  const signature = JSON.stringify(sections.map((section) => [section.id, section.value]));

  // biome-ignore lint/correctness/useExhaustiveDependencies: synchronise le brouillon quand les filtres appliqués changent
  useEffect(() => {
    setDraft(valuesBySection(sections));
  }, [signature]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const selectedCount = sections.reduce((total, section) => total + section.value.length, 0);

  const toggle = (sectionId: string, value: string): void => {
    setDraft((current) => {
      const selected = current[sectionId] ?? [];
      return {
        ...current,
        [sectionId]: selected.includes(value)
          ? selected.filter((entry) => entry !== value)
          : [...selected, value],
      };
    });
  };

  const clearSection = (sectionId: string): void => {
    setDraft((current) => ({ ...current, [sectionId]: [] }));
  };

  const apply = (): void => {
    onApply(draft);
    setQueries({});
    setOpen(false);
  };

  const clearAll = (): void => {
    const empty = Object.fromEntries(sections.map((section) => [section.id, []]));
    setDraft(empty);
    setQueries({});
    onApply(empty);
    setOpen(false);
  };

  const removeApplied = (sectionId: string, value: string): void => {
    onApply({
      ...valuesBySection(sections),
      [sectionId]: (sections.find((section) => section.id === sectionId)?.value ?? []).filter(
        (entry) => entry !== value,
      ),
    });
  };

  return (
    <div className="filter-menu">
      <div className="filter-trigger-row">
        <button
          type="button"
          className="filter-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          <span>Filtrer</span>
          {selectedCount > 0 ? <span className="filter-count">{selectedCount}</span> : null}
        </button>
        {sections.map((section) =>
          section.value.length > 0 ? (
            <span className="filter-applied-group" key={section.id}>
              <span className="filter-applied-label">{section.label}</span>
              {section.value.map((value) => {
                const label =
                  section.options.find((option) => option.value === value)?.label ?? value;
                return (
                  <span className="filter-chip" key={value}>
                    {label}
                    <button
                      type="button"
                      aria-label={`Retirer le filtre ${section.label} ${label}`}
                      onClick={() => removeApplied(section.id, value)}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </span>
          ) : null,
        )}
      </div>

      {open ? (
        <>
          <button
            type="button"
            className="filter-backdrop"
            aria-label="Fermer les filtres"
            onClick={() => setOpen(false)}
          />
          <section className="filter-panel" id={panelId} role="dialog" aria-label="Filtres">
            <div className="filter-panel-head">
              <h2>Filtres</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Fermer les filtres"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="filter-sections">
              {sections.map((section) => {
                const selected = draft[section.id] ?? [];
                const searchable = section.options.length > 8;
                const query = (queries[section.id] ?? "").trim().toLocaleLowerCase("fr");
                const visibleOptions = section.options
                  .filter(
                    (option) =>
                      query === "" || option.label.toLocaleLowerCase("fr").includes(query),
                  )
                  .sort(
                    (left, right) =>
                      Number(selected.includes(right.value)) -
                      Number(selected.includes(left.value)),
                  );

                return (
                  <fieldset className="filter-section" key={section.id}>
                    <legend>
                      <span>{section.label}</span>
                      {selected.length > 0 ? (
                        <button
                          type="button"
                          className="filter-section-clear"
                          onClick={() => clearSection(section.id)}
                        >
                          Effacer
                        </button>
                      ) : null}
                    </legend>
                    {searchable ? (
                      <label className="filter-section-search">
                        <span className="sr-only">Rechercher dans {section.label}</span>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          aria-hidden
                        >
                          <circle cx="11" cy="11" r="7" />
                          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                        </svg>
                        <input
                          type="search"
                          value={queries[section.id] ?? ""}
                          placeholder={`Rechercher dans ${section.label}…`}
                          onChange={(event) =>
                            setQueries((current) => ({
                              ...current,
                              [section.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    <div className={`filter-options ${searchable ? "filter-options-scroll" : ""}`}>
                      {visibleOptions.map((option) => (
                        <label className="filter-option" key={option.value}>
                          <input
                            type="checkbox"
                            checked={selected.includes(option.value)}
                            onChange={() => toggle(section.id, option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                      {visibleOptions.length === 0 ? (
                        <span className="filter-option-empty">Aucun résultat.</span>
                      ) : null}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="filter-panel-actions">
              <button type="button" className="btn ghost small" onClick={clearAll}>
                Tout effacer
              </button>
              <button type="button" className="btn small" onClick={apply}>
                Appliquer
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
