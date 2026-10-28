"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { aiCapabilitiesFor } from "@/domain/ai-capabilities";
import type { AiProviderModel } from "@/domain/entities/ai-model";
import type { AiProviderDto } from "./types";

/** Gestion des modèles d'un fournisseur (synchronisation, ajout, activation). */
export function AiModelsPanel({
  provider,
  onChanged,
  onClose,
}: {
  provider: AiProviderDto;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [models, setModels] = useState<AiProviderModel[]>([]);
  const [defaultModel, setDefaultModel] = useState(provider.defaultModel);
  const [modelId, setModelId] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useToastOnMessage(error, notice);
  const [pending, setPending] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const reload = useCallback(async (): Promise<void> => {
    const response = await fetch(`/api/ai/providers/${provider.id}/models`);
    const json = (await response.json()) as {
      items?: AiProviderModel[];
      error?: string;
    };
    if (!response.ok) {
      setError(json.error ?? "Chargement des modèles impossible");
      return;
    }
    setModels(json.items ?? []);
  }, [provider.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (action: () => Promise<boolean>): Promise<void> => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const ok = await action();
      if (ok) await reload();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const sync = (): Promise<void> =>
    run(async () => {
      const response = await fetch(`/api/ai/providers/${provider.id}/models/sync`, {
        method: "POST",
      });
      const json = (await response.json()) as {
        imported?: number;
        catalogSize?: number;
        error?: string;
      };
      if (!response.ok) {
        setError(json.error ?? "Synchronisation impossible");
        return false;
      }
      setNotice(
        `Catalogue synchronisé : ${json.imported ?? 0} nouveau(x) sur ${json.catalogSize ?? 0}.`,
      );
      return true;
    });

  const add = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run(async () => {
      const response = await fetch(`/api/ai/providers/${provider.id}/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, label }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Ajout impossible");
        return false;
      }
      setModelId("");
      setLabel("");
      setNotice("Modèle ajouté.");
      return true;
    });
  };

  const toggle = (model: AiProviderModel): void => {
    void run(async () => {
      const response = await fetch(`/api/ai/providers/${provider.id}/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !model.enabled }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Mise à jour impossible");
        return false;
      }
      setNotice(model.enabled ? "Modèle désactivé." : "Modèle activé.");
      return true;
    });
  };

  const setReasoning = (model: AiProviderModel, reasoningMode: string): void => {
    void run(async () => {
      const response = await fetch(`/api/ai/providers/${provider.id}/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasoningMode }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Réglage du raisonnement impossible");
        return false;
      }
      setNotice("Réglage du raisonnement enregistré.");
      return true;
    });
  };

  const makeDefault = (model: AiProviderModel): void => {
    void run(async () => {
      const response = await fetch(`/api/ai/providers/${provider.id}/default-model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.modelId }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Modèle par défaut non enregistré");
        return false;
      }
      setDefaultModel(model.modelId);
      setNotice(`Modèle par défaut : ${model.modelId}`);
      onChanged();
      return true;
    });
  };

  const test = (model: AiProviderModel): void => {
    setTestingId(model.id);
    setTestResults((current) => ({ ...current, [model.id]: "Test en cours…" }));
    void fetch(`/api/ai/providers/${provider.id}/models/${model.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxTokens: 80 }),
    })
      .then(async (response) => {
        const json = (await response.json()) as {
          ok?: boolean;
          response?: string;
          latencyMs?: number;
          error?: string;
        };
        setTestResults((current) => ({
          ...current,
          [model.id]:
            response.ok && json.ok === true
              ? `${json.latencyMs ?? 0} ms · ${json.response ?? ""}`
              : `Erreur : ${json.error ?? "test impossible"}`,
        }));
      })
      .catch(() => {
        setTestResults((current) => ({ ...current, [model.id]: "Erreur réseau" }));
      })
      .finally(() => setTestingId(null));
  };

  const remove = (model: AiProviderModel): void => {
    if (!window.confirm(`Supprimer le modèle « ${model.label} » ?`)) return;
    void run(async () => {
      const response = await fetch(`/api/ai/providers/${provider.id}/models/${model.id}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Suppression impossible");
        return false;
      }
      setNotice("Modèle supprimé.");
      return true;
    });
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="page-head" style={{ marginBottom: "1rem" }}>
        <div>
          <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
            Modèles — {provider.label}
          </h2>
          <p className="hint">
            Un modèle désactivé ou supprimé n&apos;est plus proposé. Les modèles absents du
            catalogue distant ne sont jamais supprimés automatiquement. Le mode Auto désactive le
            raisonnement des modèles Gemma/Qwen Infomaniak pour éviter les boucles JSON.
          </p>
        </div>
        <button type="button" className="btn ghost small" onClick={onClose}>
          Fermer
        </button>
      </div>

      {error !== null ? <p className="alert error">{error}</p> : null}
      {notice !== null ? <p className="alert success">{notice}</p> : null}

      <div className="tools" style={{ marginBottom: "1rem" }}>
        <button type="button" className="btn small" disabled={pending} onClick={() => void sync()}>
          {pending ? "Traitement…" : "Synchroniser depuis /models"}
        </button>
        <a
          className="btn ghost small"
          href={`/parametres/ia/test?provider=${provider.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Page de test
        </a>
      </div>

      <form className="form" onSubmit={add} style={{ marginBottom: "1.5rem" }}>
        <div className="grid-2">
          <label className="field">
            Identifiant du modèle
            <input
              type="text"
              required
              value={modelId}
              placeholder="Ex. Qwen/Qwen3.5-122B-A10B-FP8"
              onChange={(event) => setModelId(event.target.value)}
            />
          </label>
          <label className="field">
            Libellé (optionnel)
            <input
              type="text"
              value={label}
              placeholder="Nom affiché"
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
        </div>
        <div className="tools">
          <button type="submit" className="btn small" disabled={pending || modelId.trim() === ""}>
            Ajouter manuellement
          </button>
        </div>
      </form>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Modèle</th>
              <th>Source</th>
              <th>État</th>
              <th>Raisonnement</th>
              <th>Défaut</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model.id}>
                <td>
                  <strong>{model.label}</strong>
                  {model.label !== model.modelId ? (
                    <div className="hint">{model.modelId}</div>
                  ) : null}
                  {testResults[model.id] !== undefined ? (
                    <div className="hint">{testResults[model.id]}</div>
                  ) : null}
                </td>
                <td>{model.source === "catalog" ? "Catalogue" : "Manuel"}</td>
                <td>
                  <span className={`badge ${model.enabled ? "" : "orange"}`}>
                    {model.enabled ? "actif" : "désactivé"}
                  </span>
                </td>
                <td>
                  {aiCapabilitiesFor(provider.preset, model.modelId, provider.reasoningProfile)
                    .supportsReasoningToggle ? (
                    <select
                      value={model.reasoningMode ?? "auto"}
                      disabled={pending || !model.enabled}
                      onChange={(event) => setReasoning(model, event.target.value)}
                      aria-label={`Raisonnement de ${model.label}`}
                    >
                      <option value="auto">Auto</option>
                      <option value="enabled">Activé</option>
                      <option value="disabled">Désactivé</option>
                    </select>
                  ) : (
                    <span className="hint">Non supporté</span>
                  )}
                </td>
                <td>
                  {defaultModel === model.modelId ? (
                    <span className="badge">par défaut</span>
                  ) : (
                    <span className="hint">—</span>
                  )}
                </td>
                <td>
                  <div className="tools">
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={pending || testingId === model.id || !model.enabled}
                      onClick={() => test(model)}
                    >
                      {testingId === model.id ? "Test…" : "Tester"}
                    </button>
                    <a
                      className="btn ghost small"
                      href={`/parametres/ia/test?provider=${provider.id}&model=${model.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Page test
                    </a>
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={pending || (model.enabled && defaultModel === model.modelId)}
                      onClick={() => toggle(model)}
                    >
                      {model.enabled ? "Désactiver" : "Activer"}
                    </button>
                    {model.enabled && defaultModel !== model.modelId ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={pending}
                        onClick={() => makeDefault(model)}
                      >
                        Par défaut
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn danger ghost small"
                      disabled={pending || defaultModel === model.modelId}
                      onClick={() => remove(model)}
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {models.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  Aucun modèle. Synchronisez le catalogue ou ajoutez un identifiant manuellement.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
