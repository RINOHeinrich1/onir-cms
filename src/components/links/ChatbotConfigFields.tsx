"use client";

import { useEffect, useState } from "react";
import { TEMPLATE_FIELD_TYPES } from "@/domain/entities/chat-template";
import { MAX_FICHES_PER_CHATBOT } from "@/domain/entities/chatbot-config";
import { ficheKeyFromLabel } from "@/domain/entities/fiche-collecte";
import { ChatbotBehaviorFields } from "./ChatbotBehaviorFields";
import type { FicheCollecteOption } from "./ChatbotFichePicker";
import {
  type ChatbotConfigDraft,
  draftFromFicheCollecte,
  emptyFiche,
  emptyField,
  type FicheDraft,
  type FicheFieldDraft,
} from "./chatbot-config-draft";

type Props = {
  value: ChatbotConfigDraft;
  onChange: (value: ChatbotConfigDraft) => void;
};

function updateFiche(
  value: ChatbotConfigDraft,
  index: number,
  patch: Partial<FicheDraft>,
): ChatbotConfigDraft {
  return {
    ...value,
    fiches: value.fiches.map((fiche, current) =>
      current === index ? { ...fiche, ...patch } : fiche,
    ),
  };
}

function updateField(
  fiche: FicheDraft,
  index: number,
  patch: Partial<FicheFieldDraft>,
): FicheDraft {
  return {
    ...fiche,
    fields: fiche.fields.map((field, current) =>
      current === index ? { ...field, ...patch } : field,
    ),
  };
}

/**
 * Éditeur de configuration autonome : prompt système, réglages simples et
 * 1..N fiches de collecte (ADR-0049). Aucune notion de modèle de raisonnement.
 */
export function ChatbotConfigFields({ value, onChange }: Props) {
  const [fichesCollecte, setFichesCollecte] = useState<FicheCollecteOption[]>([]);
  const [selectedFiche, setSelectedFiche] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const canAddFiche = value.fiches.length < MAX_FICHES_PER_CHATBOT;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/fiches-collecte", { cache: "no-store" })
      .then(async (response) =>
        response.ok ? ((await response.json()) as { fiches?: FicheCollecteOption[] }) : null,
      )
      .then((json) => {
        if (!cancelled && json?.fiches !== undefined) setFichesCollecte(json.fiches);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const importFiche = (): void => {
    const fiche = fichesCollecte.find((entry) => entry.id === selectedFiche);
    if (fiche === undefined) return;
    if (!canAddFiche) {
      setImportError(`${MAX_FICHES_PER_CHATBOT} fiches de collecte maximum`);
      return;
    }
    setImportError(null);
    onChange({ ...value, fiches: [...value.fiches, draftFromFicheCollecte(fiche)] });
    setSelectedFiche("");
  };

  return (
    <div className="chatbot-config">
      <fieldset className="fieldset">
        <legend>Choisir une fiche existante</legend>
        <div className="field-row">
          <label className="field">
            Fiche de collecte réutilisable
            <select
              value={selectedFiche}
              onChange={(event) => setSelectedFiche(event.target.value)}
            >
              <option value="">— Choisir —</option>
              {fichesCollecte.map((fiche) => (
                <option key={fiche.id} value={fiche.id}>
                  {fiche.label} ({fiche.key}) · v{fiche.version}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn ghost small"
            style={{ alignSelf: "end" }}
            disabled={selectedFiche === "" || !canAddFiche}
            onClick={importFiche}
          >
            Importer une copie
          </button>
        </div>
        <span className="hint">
          La fiche est copiée dans la configuration du chatbot (snapshot). Une modification
          ultérieure de la fiche réutilisable n’affecte pas ce chatbot.
        </span>
        {importError !== null ? <p className="alert error">{importError}</p> : null}
      </fieldset>
      <ChatbotBehaviorFields value={value} onChange={onChange} />

      <div className="chatbot-fiches-head">
        <strong>Fiches de collecte ({value.fiches.length})</strong>
        <button
          type="button"
          className="btn ghost small"
          onClick={() =>
            onChange({ ...value, fiches: [...value.fiches, emptyFiche(value.fiches.length)] })
          }
        >
          Ajouter une fiche
        </button>
      </div>

      {value.fiches.map((fiche, ficheIndex) => (
        <div className="chatbot-fiche-card" key={fiche.id}>
          <div className="chatbot-fiche-head">
            <strong>Fiche {ficheIndex + 1}</strong>
            {value.fiches.length > 1 ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={() =>
                  onChange({
                    ...value,
                    fiches: value.fiches.filter((_entry, current) => current !== ficheIndex),
                  })
                }
              >
                Retirer
              </button>
            ) : null}
          </div>

          <label className="field">
            Libellé *
            <input
              type="text"
              value={fiche.label}
              placeholder="Demande d'hôtel"
              onChange={(event) =>
                onChange(
                  updateFiche(value, ficheIndex, {
                    label: event.target.value,
                    key: ficheKeyFromLabel(event.target.value),
                  }),
                )
              }
            />
          </label>

          <label className="field">
            Description
            <input
              type="text"
              value={fiche.description}
              onChange={(event) =>
                onChange(updateFiche(value, ficheIndex, { description: event.target.value }))
              }
            />
          </label>
          <label className="field">
            Intention
            <input
              type="text"
              value={fiche.intent}
              placeholder="Quand le visiteur cherche un hébergement"
              onChange={(event) =>
                onChange(updateFiche(value, ficheIndex, { intent: event.target.value }))
              }
            />
          </label>
          <label className="field">
            Instructions de la fiche
            <textarea
              rows={2}
              value={fiche.instructions}
              onChange={(event) =>
                onChange(updateFiche(value, ficheIndex, { instructions: event.target.value }))
              }
            />
          </label>

          <div className="chatbot-fields-head">
            <span>Champs</span>
            <button
              type="button"
              className="btn ghost small"
              onClick={() =>
                onChange(
                  updateFiche(value, ficheIndex, { fields: [...fiche.fields, emptyField()] }),
                )
              }
            >
              Ajouter un champ
            </button>
          </div>
          {fiche.fields.map((field, fieldIndex) => (
            <div className="field-row" key={field.id}>
              <label className="field">
                Libellé
                <input
                  type="text"
                  value={field.label}
                  placeholder="Ville"
                  onChange={(event) =>
                    onChange(
                      updateFiche(value, ficheIndex, {
                        fields: updateField(fiche, fieldIndex, { label: event.target.value })
                          .fields,
                      }),
                    )
                  }
                />
              </label>
              <label className="field">
                Type
                <select
                  value={field.type}
                  onChange={(event) =>
                    onChange(
                      updateFiche(value, ficheIndex, {
                        fields: updateField(fiche, fieldIndex, {
                          type: event.target.value as FicheFieldDraft["type"],
                        }).fields,
                      }),
                    )
                  }
                >
                  {TEMPLATE_FIELD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field checkbox">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) =>
                    onChange(
                      updateFiche(value, ficheIndex, {
                        fields: updateField(fiche, fieldIndex, {
                          required: event.target.checked,
                        }).fields,
                      }),
                    )
                  }
                />
                Obligatoire
              </label>
              {field.type === "select" || field.type === "multi" ? (
                <label className="field">
                  Options (virgules)
                  <input
                    type="text"
                    value={field.options}
                    onChange={(event) =>
                      onChange(
                        updateFiche(value, ficheIndex, {
                          fields: updateField(fiche, fieldIndex, {
                            options: event.target.value,
                          }).fields,
                        }),
                      )
                    }
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="btn ghost small"
                onClick={() =>
                  onChange(
                    updateFiche(value, ficheIndex, {
                      fields: fiche.fields.filter((_entry, current) => current !== fieldIndex),
                    }),
                  )
                }
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
