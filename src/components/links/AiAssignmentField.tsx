"use client";

import { AiModelSelect } from "@/components/ai/AiModelSelect";
import type { AiProviderOption } from "./types";

export type LinkAiValue = {
  aiProviderId: string | null;
  aiModel: string | null;
};

/** Section « Moteur IA » d'un lien : héritage ou fournisseur + modèle explicite. */
export function AiAssignmentField({
  providers,
  value,
  onChange,
  canAssign,
}: {
  providers: AiProviderOption[];
  value: LinkAiValue;
  onChange: (value: LinkAiValue) => void;
  canAssign: boolean;
}) {
  const explicit = value.aiProviderId !== null;
  const selectedProvider = providers.find((provider) => provider.id === value.aiProviderId) ?? null;

  const selectExplicit = (): void => {
    const first = providers[0];
    if (first === undefined) return;
    onChange({
      aiProviderId: first.id,
      aiModel: first.defaultModel ?? "",
    });
  };

  const selectProvider = (providerId: string): void => {
    const provider = providers.find((entry) => entry.id === providerId);
    onChange({
      aiProviderId: providerId,
      aiModel: provider?.defaultModel ?? "",
    });
  };

  return (
    <fieldset className="card" style={{ marginBottom: "1rem" }}>
      <legend className="field" style={{ marginBottom: "0.5rem" }}>
        Moteur IA
      </legend>
      <p className="hint">
        Par défaut, le lien hérite du fournisseur/modèle de l&apos;organisation. Un choix explicite
        ne bascule pas silencieusement en cas d&apos;indisponibilité.
      </p>

      <label className="field">
        Mode
        <select
          value={explicit ? "explicit" : "inherit"}
          disabled={!canAssign}
          onChange={(event) => {
            if (event.target.value === "inherit") {
              onChange({ aiProviderId: null, aiModel: null });
            } else {
              selectExplicit();
            }
          }}
        >
          <option value="inherit">Hériter du défaut de l&apos;organisation</option>
          <option value="explicit" disabled={providers.length === 0}>
            Choisir un fournisseur et un modèle
          </option>
        </select>
      </label>

      {explicit ? (
        <>
          <label className="field">
            Fournisseur
            <select
              value={value.aiProviderId ?? ""}
              disabled={!canAssign}
              onChange={(event) => selectProvider(event.target.value)}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
              {selectedProvider === null && value.aiProviderId !== null ? (
                <option value={value.aiProviderId}>Fournisseur indisponible</option>
              ) : null}
            </select>
          </label>
          <div className="field">
            <span>Modèle</span>
            <AiModelSelect
              providerId={value.aiProviderId}
              value={value.aiModel ?? ""}
              disabled={!canAssign}
              onChange={(model) => onChange({ aiProviderId: value.aiProviderId, aiModel: model })}
            />
          </div>
        </>
      ) : null}

      {!canAssign ? (
        <p className="hint">Vous n&apos;êtes pas autorisé à modifier le moteur IA de ce lien.</p>
      ) : null}
      {providers.length === 0 ? (
        <p className="hint">
          Aucun fournisseur actif. Le lien utilisera le défaut de l&apos;organisation ou la
          configuration legacy.
        </p>
      ) : null}
    </fieldset>
  );
}
