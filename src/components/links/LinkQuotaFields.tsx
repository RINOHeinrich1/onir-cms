"use client";

import type { TokenResetMode } from "@/domain/entities/chat";

export type LinkQuotaDraft = {
  maxFiches: string;
  maxTokens: string;
  tokenResetMode: TokenResetMode;
  tokenResetDays: string;
};

export const EMPTY_LINK_QUOTA_DRAFT: LinkQuotaDraft = {
  maxFiches: "",
  maxTokens: "",
  tokenResetMode: "manual",
  tokenResetDays: "",
};

/** Champs de quotas d'un chatbot (ADR-0048), partagés création/édition. */
export function LinkQuotaFields({
  value,
  onChange,
}: {
  value: LinkQuotaDraft;
  onChange: (value: LinkQuotaDraft) => void;
}) {
  return (
    <div className="field">
      <span className="label">Limites du chatbot</span>
      <label className="field">
        Fiches maximum (à vie)
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="Illimité"
          value={value.maxFiches}
          onChange={(event) => onChange({ ...value, maxFiches: event.target.value })}
        />
      </label>
      <label className="field">
        Budget de tokens IA
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          placeholder="Illimité"
          value={value.maxTokens}
          onChange={(event) => onChange({ ...value, maxTokens: event.target.value })}
        />
        <span className="hint">
          Toutes les opérations IA du chatbot sont comptées : réponses, connaissances, médias et
          fiches.
        </span>
      </label>
      <label className="field">
        Réinitialisation du budget tokens
        <select
          value={value.tokenResetMode}
          onChange={(event) =>
            onChange({
              ...value,
              tokenResetMode: event.target.value === "duration" ? "duration" : "manual",
            })
          }
        >
          <option value="manual">Manuelle par un administrateur</option>
          <option value="duration">Automatique après une durée</option>
        </select>
      </label>
      {value.tokenResetMode === "duration" ? (
        <label className="field">
          Durée avant réinitialisation (jours)
          <input
            type="number"
            min={1}
            max={3650}
            step={1}
            inputMode="numeric"
            placeholder="30"
            value={value.tokenResetDays}
            onChange={(event) => onChange({ ...value, tokenResetDays: event.target.value })}
          />
        </label>
      ) : null}
      <span className="hint">
        La limite de fiches est définitive. Le budget de tokens peut être réinitialisé manuellement
        ou automatiquement.
      </span>
    </div>
  );
}
