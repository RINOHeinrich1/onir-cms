"use client";

import { useId, useMemo, useRef, useState } from "react";

export type FicheScopeOption = {
  key: string;
  label: string;
};

export function FicheScopeTagInput({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: FicheScopeOption[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = useMemo(
    () => value.map((key) => options.find((option) => option.key === key) ?? { key, label: key }),
    [options, value],
  );
  const suggestions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return options.filter((option) => {
      if (value.includes(option.key)) return false;
      if (needle === "") return true;
      return (
        option.label.toLocaleLowerCase("fr").includes(needle) ||
        option.key.toLocaleLowerCase("fr").includes(needle)
      );
    });
  }, [options, query, value]);

  const add = (key: string): void => {
    if (value.includes(key)) return;
    onChange([...value, key]);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.focus();
  };

  const remove = (key: string): void => {
    onChange(value.filter((entry) => entry !== key));
    inputRef.current?.focus();
  };

  return (
    <div className="fiche-scope-field">
      <span className="fiche-scope-label">Fiches de collecte interrogées</span>
      <div className="fiche-scope-control">
        <div className="fiche-scope-tags">
          {selected.map((option) => (
            <span key={option.key} className="fiche-scope-tag">
              {option.label}
              <button
                type="button"
                aria-label={`Retirer ${option.label}`}
                onClick={() => remove(option.key)}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            value={query}
            disabled={disabled}
            placeholder={selected.length === 0 ? "Rechercher une fiche de collecte…" : "Ajouter…"}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === "Enter" && open && suggestions[activeIndex] !== undefined) {
                event.preventDefault();
                add(suggestions[activeIndex]?.key ?? "");
              } else if (event.key === "Escape") {
                setOpen(false);
              } else if (event.key === "Backspace" && query === "" && value.length > 0) {
                remove(value[value.length - 1] ?? "");
              }
            }}
          />
        </div>
        {open ? (
          <div id={listId} className="fiche-scope-suggestions">
            {suggestions.length === 0 ? (
              <p className="fiche-scope-empty">Aucune fiche de collecte trouvée.</p>
            ) : (
              suggestions.map((option, index) => (
                <div key={option.key} className="fiche-scope-suggestion">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => add(option.key)}
                    className={index === activeIndex ? "active" : undefined}
                  >
                    <span>{option.label}</span>
                    <small>{option.key}</small>
                  </button>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
      <span className="hint">
        La recherche portera sur toutes les instances de ces fiches de collecte dans l’organisation.
      </span>
    </div>
  );
}
