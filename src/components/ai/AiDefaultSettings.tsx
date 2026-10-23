"use client";

import { useState } from "react";
import { AiModelSelect } from "./AiModelSelect";
import type { AiProviderDto, AiSettingsDto } from "./types";

/** Défaut IA de l'organisation utilisé par les liens en mode hérité. */
export function AiDefaultSettings({
  providers,
  settings,
  canManage,
  onSaved,
}: {
  providers: AiProviderDto[];
  settings: AiSettingsDto | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [providerId, setProviderId] = useState(settings?.defaultProviderId ?? "");
  const [model, setModel] = useState(settings?.defaultModel ?? "");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const save = async (): Promise<void> => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId, model }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      setNotice("Défaut de l'organisation enregistré.");
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const clear = async (): Promise<void> => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/ai/settings", { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Suppression impossible");
        return;
      }
      setProviderId("");
      setModel("");
      setNotice("Aucun défaut : les liens hérités utilisent la configuration legacy.");
      onSaved();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
        Défaut de l&apos;organisation
      </h2>
      <p className="hint">
        Les liens sans choix explicite utilisent ce fournisseur et ce modèle. Sans défaut, la
        configuration legacy de l&apos;environnement reste utilisée.
      </p>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {notice !== null ? <p className="alert success">{notice}</p> : null}

      <div className="grid-2">
        <label className="field">
          Fournisseur
          <select
            value={providerId}
            disabled={!canManage || pending}
            onChange={(event) => {
              setProviderId(event.target.value);
              setModel("");
            }}
          >
            <option value="">— Aucun défaut —</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Modèle</span>
          <AiModelSelect
            providerId={providerId === "" ? null : providerId}
            value={model}
            onChange={setModel}
            disabled={!canManage || pending}
          />
        </div>
      </div>

      {canManage ? (
        <div className="tools">
          <button
            type="button"
            className="btn small"
            disabled={pending || providerId === "" || model.trim() === ""}
            onClick={() => void save()}
          >
            Enregistrer le défaut
          </button>
          <button
            type="button"
            className="btn ghost small"
            disabled={pending}
            onClick={() => void clear()}
          >
            Aucun défaut
          </button>
        </div>
      ) : null}
    </section>
  );
}
