"use client";

import { useEffect, useState } from "react";
import { type ChatLinkOption, chatLinkScopeLabel, loadChatLinkOptions } from "./chat-link-options";

/**
 * Sélection de la portée d'un élément : 0..N chatbots.
 * Portée vide = globale (tous les chatbots). Les libellés sont humains.
 */
export function ChatLinkPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [options, setOptions] = useState<ChatLinkOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadChatLinkOptions()
      .then((loaded) => {
        if (!cancelled) {
          setOptions(loaded);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les chatbots.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string): void => {
    onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id]);
  };

  const selected = chatLinkScopeLabel(value, options);

  return (
    <div className="key-picker">
      <div className="key-chips">
        {selected.global ? (
          <span className="badge muted">Global (tous les chatbots)</span>
        ) : (
          value.map((id, index) => {
            const label = selected.labels[index] ?? "Chatbot indisponible";
            return (
              <span key={id} className="badge">
                {label}
                <button
                  type="button"
                  className="key-chip-remove"
                  aria-label={`Retirer ${label}`}
                  disabled={disabled}
                  onClick={() => toggle(id)}
                >
                  ×
                </button>
              </span>
            );
          })
        )}
      </div>

      <label className="check">
        <input
          type="checkbox"
          checked={value.length === 0}
          disabled={disabled}
          onChange={() => onChange([])}
        />
        Global (tous les chatbots)
      </label>

      {loading ? <span className="hint">Chargement des chatbots…</span> : null}
      {error !== null ? <span className="alert error">{error}</span> : null}
      {!loading && error === null && options.length === 0 ? (
        <span className="hint">Aucun chatbot disponible pour l&apos;instant.</span>
      ) : null}
      {options.length > 0 ? (
        <fieldset className="chat-link-picker-list">
          <legend className="hint">Chatbots de la portée</legend>
          {options.map((option) => (
            <label key={option.id} className="check">
              <input
                type="checkbox"
                checked={value.includes(option.id)}
                disabled={disabled}
                onChange={() => toggle(option.id)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
