"use client";

import { useEffect, useState } from "react";
import { TEMPLATE_FIELD_TYPES, type TemplateField } from "@/domain/entities/chat-template";
import { MAX_FICHES_PER_CHATBOT } from "@/domain/entities/chatbot-config";
import {
  type ChatbotConfigDraft,
  draftFromFicheCollecte,
  emptyFiche,
  emptyField,
  type FicheDraft,
  type FicheFieldDraft,
} from "./chatbot-config-draft";

type FicheCollecteOption = {
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
  const simple = value.simple;
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
      <label className="field">
        Prompt système *
        <textarea
          rows={5}
          value={value.systemPrompt}
          onChange={(event) => onChange({ ...value, systemPrompt: event.target.value })}
          placeholder="Rôle, ton, règles de conversation, informations à ne pas divulguer…"
        />
      </label>

      <fieldset className="fieldset">
        <legend>Réglages simples</legend>
        <label className="field">
          Rôle
          <input
            type="text"
            value={simple.role}
            maxLength={200}
            onChange={(event) =>
              onChange({ ...value, simple: { ...simple, role: event.target.value } })
            }
          />
        </label>
        <label className="field">
          Objectif
          <textarea
            rows={2}
            value={simple.objective}
            maxLength={2000}
            onChange={(event) =>
              onChange({ ...value, simple: { ...simple, objective: event.target.value } })
            }
          />
        </label>
        <label className="field">
          Langue
          <select
            value={simple.languageMode}
            onChange={(event) =>
              onChange({
                ...value,
                simple: {
                  ...simple,
                  languageMode: event.target.value === "fixed" ? "fixed" : "auto",
                },
              })
            }
          >
            <option value="auto">Automatique (langue du visiteur)</option>
            <option value="fixed">Langue fixe</option>
          </select>
        </label>
        {simple.languageMode === "fixed" ? (
          <label className="field">
            Langue imposée
            <input
              type="text"
              value={simple.languageValue}
              placeholder="Ex. français"
              onChange={(event) =>
                onChange({ ...value, simple: { ...simple, languageValue: event.target.value } })
              }
            />
          </label>
        ) : null}
        <label className="field">
          Ton
          <input
            type="text"
            value={simple.tone}
            maxLength={200}
            onChange={(event) =>
              onChange({ ...value, simple: { ...simple, tone: event.target.value } })
            }
          />
        </label>
        <label className="field">
          Garde-fous (un par ligne)
          <textarea
            rows={3}
            value={simple.guardrails}
            onChange={(event) =>
              onChange({ ...value, simple: { ...simple, guardrails: event.target.value } })
            }
          />
        </label>
        <label className="field">
          Instructions complémentaires
          <textarea
            rows={2}
            value={simple.extraInstructions}
            onChange={(event) =>
              onChange({ ...value, simple: { ...simple, extraInstructions: event.target.value } })
            }
          />
        </label>
      </fieldset>

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

          <div className="field-row">
            <label className="field">
              Clé *
              <input
                type="text"
                value={fiche.key}
                placeholder="hotel"
                onChange={(event) =>
                  onChange(updateFiche(value, ficheIndex, { key: event.target.value }))
                }
              />
            </label>
            <label className="field">
              Libellé *
              <input
                type="text"
                value={fiche.label}
                placeholder="Demande d'hôtel"
                onChange={(event) =>
                  onChange(updateFiche(value, ficheIndex, { label: event.target.value }))
                }
              />
            </label>
          </div>

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
                Nom technique
                <input
                  type="text"
                  value={field.name}
                  placeholder="ville"
                  onChange={(event) =>
                    onChange(
                      updateFiche(value, ficheIndex, {
                        fields: updateField(fiche, fieldIndex, { name: event.target.value }).fields,
                      }),
                    )
                  }
                />
              </label>
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

          <label className="field">
            Modèle de rendu Markdown (fiche livrable)
            <textarea
              rows={4}
              value={fiche.renderTemplate}
              onChange={(event) =>
                onChange(updateFiche(value, ficheIndex, { renderTemplate: event.target.value }))
              }
            />
          </label>
        </div>
      ))}
    </div>
  );
}
