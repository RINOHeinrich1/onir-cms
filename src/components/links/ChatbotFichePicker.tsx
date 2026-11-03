"use client";

import { useEffect, useMemo, useState } from "react";
import { FicheCollecteForm } from "@/components/fiches-collecte/FicheCollecteForm";
import type { FicheCollecteDto } from "@/components/fiches-collecte/types";
import { Modal } from "@/components/ui/Modal";
import type { TemplateField } from "@/domain/entities/chat-template";
import { MAX_FICHES_PER_CHATBOT } from "@/domain/entities/chatbot-config";
import { draftFromFicheCollecte, type FicheDraft } from "./chatbot-config-draft";

export type FicheCollecteOption = {
  id: string;
  key: string;
  label: string;
  description: string;
  intent: string;
  instructions: string;
  renderTemplate: string;
  version: number;
  fields: TemplateField[];
};

type Props = {
  value: FicheDraft[];
  onChange: (fiches: FicheDraft[]) => void;
};

/** Sélection MULTIPLE de fiches de collecte existantes (snapshot à la création). */
export function ChatbotFichePicker({ value, onChange }: Props) {
  const [options, setOptions] = useState<FicheCollecteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/fiches-collecte", { cache: "no-store" })
      .then(async (response) =>
        response.ok ? ((await response.json()) as { fiches?: FicheCollecteOption[] }) : null,
      )
      .then((json) => {
        if (cancelled) return;
        if (json?.fiches === undefined) {
          setError("Impossible de charger les fiches de collecte");
          return;
        }
        setOptions(json.fiches);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de charger les fiches de collecte");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedIds = useMemo(
    () =>
      new Set(
        value
          .map((fiche) => fiche.sourceFicheId)
          .filter((id): id is string => id !== undefined && id !== ""),
      ),
    [value],
  );

  const visibleOptions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    if (normalized === "") return options;
    return options.filter((option) =>
      [option.label, option.key, option.description]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(normalized),
    );
  }, [options, query]);

  const availableCount = Math.max(options.length, value.length);
  const remainingAssignable = Math.max(0, MAX_FICHES_PER_CHATBOT - value.length);
  const remainingLabel =
    remainingAssignable === 1 ? "1 fiche assignable" : `${remainingAssignable} fiches assignables`;

  const toggle = (option: FicheCollecteOption): void => {
    setError(null);
    if (selectedIds.has(option.id)) {
      onChange(value.filter((fiche) => fiche.sourceFicheId !== option.id));
      return;
    }
    if (value.length >= MAX_FICHES_PER_CHATBOT) {
      setError(`${MAX_FICHES_PER_CHATBOT} fiches de collecte maximum`);
      return;
    }
    if (value.some((fiche) => fiche.key === option.key)) {
      setError(`La fiche « ${option.label} » est déjà sélectionnée (clé ${option.key})`);
      return;
    }
    onChange([...value, draftFromFicheCollecte(option)]);
  };

  const remove = (fiche: FicheDraft): void => {
    onChange(value.filter((entry) => entry.id !== fiche.id));
  };

  return (
    <div className="chatbot-fiche-picker">
      <fieldset className="fieldset">
        <legend>Choisir parmi les fiches existantes</legend>
        <p className="hint">
          Sélectionnez une ou plusieurs fiches. Une copie (snapshot) est enregistrée dans le chatbot
          : les modifications ultérieures des fiches réutilisables ne l’affectent pas.
        </p>
        <div className="chatbot-fiche-picker-tools">
          <input
            type="search"
            value={query}
            placeholder="Rechercher une fiche…"
            aria-label="Rechercher une fiche de collecte"
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            + Créer une fiche
          </button>
          <a href="/fiches-collecte" target="_blank" rel="noreferrer" className="btn ghost small">
            Gérer les fiches
          </a>
        </div>

        {error !== null ? <p className="alert error">{error}</p> : null}
        {loading ? <p className="hint">Chargement des fiches…</p> : null}
        {!loading && options.length === 0 ? (
          <p className="hint">
            Aucune fiche de collecte n’existe encore.{" "}
            <a href="/fiches-collecte" target="_blank" rel="noreferrer">
              Créez-en une
            </a>{" "}
            pour continuer.
          </p>
        ) : null}

        {!loading && options.length > 0 ? (
          <div className="chatbot-fiche-options">
            {visibleOptions.map((option) => {
              const checked = selectedIds.has(option.id);
              return (
                <label
                  key={option.id}
                  className={`chatbot-fiche-option${checked ? " selected" : ""}`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(option)} />
                  <span>
                    <strong>{option.label}</strong>
                    <small>
                      {option.key} · v{option.version}
                      {option.description === "" ? "" : ` — ${option.description}`}
                    </small>
                  </span>
                </label>
              );
            })}
            {visibleOptions.length === 0 ? (
              <p className="hint">Aucune fiche ne correspond à cette recherche.</p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {creating ? (
        <Modal title="Nouvelle fiche de collecte" onClose={() => setCreating(false)} wide>
          <FicheCollecteForm
            fiche={null}
            onCancel={() => setCreating(false)}
            onSaved={(fiche: FicheCollecteDto) => {
              setOptions((current) => [...current, fiche]);
              onChange([...value, draftFromFicheCollecte(fiche)]);
              setCreating(false);
            }}
          />
        </Modal>
      ) : null}

      <div className="chatbot-fiche-selected">
        <strong>
          Fiches sélectionnées ({value.length}/{availableCount} disponibles)
        </strong>
        <p className="hint">
          Le maximum est de {MAX_FICHES_PER_CHATBOT} fiches ; il reste {remainingLabel}.
        </p>
        {value.length === 0 && options.length > 0 ? (
          <p className="hint">
            Aucune fiche sélectionnée : le chatbot ne collectera aucun champ automatiquement.
          </p>
        ) : value.length === 0 ? null : (
          <ul>
            {value.map((fiche) => (
              <li key={fiche.id}>
                <span>
                  {fiche.label} <small>({fiche.key})</small>
                </span>
                <button
                  type="button"
                  className="btn danger ghost small"
                  onClick={() => remove(fiche)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
