"use client";

import { useEffect, useId, useState } from "react";

type TemplateOption = { key: string; label: string };

/**
 * Saisie de la portée d'un élément : 0..N clés de modèles de raisonnement.
 * Portée vide = globale. Les modèles connus sont proposés en suggestions.
 */
export function TemplateKeyPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [options, setOptions] = useState<TemplateOption[]>([]);
  const listId = useId();

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/templates", { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as {
          templates?: { key: string; label: string }[];
        };
        if (!cancelled) {
          setOptions(
            (json.templates ?? []).map((template) => ({
              key: template.key,
              label: template.label,
            })),
          );
        }
      } catch {
        // Suggestions indisponibles : la saisie libre reste possible.
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const add = (raw: string): void => {
    const key = raw.trim();
    if (key === "" || value.includes(key)) return;
    onChange([...value, key]);
    setDraft("");
  };

  const remove = (key: string): void => {
    onChange(value.filter((entry) => entry !== key));
  };

  return (
    <div className="key-picker">
      <div className="key-chips">
        {value.length === 0 ? (
          <span className="badge muted">Globale (tous les modèles)</span>
        ) : (
          value.map((key) => (
            <span key={key} className="badge">
              {key}
              <button
                type="button"
                className="key-chip-remove"
                aria-label={`Retirer ${key}`}
                onClick={() => remove(key)}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>
      <input
        type="text"
        list={listId}
        value={draft}
        disabled={disabled}
        placeholder="Ajouter un modèle (Entrée)…"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          }
          if (event.key === "Backspace" && draft === "" && value.length > 0) {
            remove(value[value.length - 1] as string);
          }
        }}
      />
      <datalist id={listId}>
        {options
          .filter((option) => !value.includes(option.key))
          .map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
      </datalist>
    </div>
  );
}
