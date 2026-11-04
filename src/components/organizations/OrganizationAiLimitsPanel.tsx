"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToastOnMessage } from "@/components/ui/ToastProvider";

type Target =
  | { kind: "model"; providerId: string; model: string }
  | { kind: "cluster"; clusterId: string };

type Limits = {
  maxChatbots: number | null;
  chatbotsCount: number;
  budget: {
    maxTokens: number | null;
    tokensUsed: number;
    tokenResetMode: "manual" | "duration";
    tokenResetDays: number | null;
  } | null;
  allocations: {
    id: string;
    target: Target;
    maxTokens: number | null;
    tokensUsed: number;
  }[];
};

type Options = {
  providers: {
    id: string;
    label: string;
    models: { modelId: string; label: string; enabled: boolean }[];
  }[];
  clusters: { id: string; label: string; actif: boolean }[];
};

type AllocationDraft = {
  key: string;
  kind: "model" | "cluster";
  providerId: string;
  model: string;
  clusterId: string;
  maxTokens: string;
};

function draftsFrom(limits: Limits): AllocationDraft[] {
  return limits.allocations.map((allocation) =>
    allocation.target.kind === "model"
      ? {
          key: allocation.id,
          kind: "model",
          providerId: allocation.target.providerId,
          model: allocation.target.model,
          clusterId: "",
          maxTokens: allocation.maxTokens === null ? "" : String(allocation.maxTokens),
        }
      : {
          key: allocation.id,
          kind: "cluster",
          providerId: "",
          model: "",
          clusterId: allocation.target.clusterId,
          maxTokens: allocation.maxTokens === null ? "" : String(allocation.maxTokens),
        },
  );
}

function numberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

export function OrganizationAiLimitsPanel({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [limits, setLimits] = useState<Limits | null>(null);
  const [options, setOptions] = useState<Options>({ providers: [], clusters: [] });
  const [maxChatbots, setMaxChatbots] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [resetMode, setResetMode] = useState<"manual" | "duration">("manual");
  const [resetDays, setResetDays] = useState("");
  const [drafts, setDrafts] = useState<AllocationDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [limitsResponse, optionsResponse] = await Promise.all([
        fetch(`/api/organizations/${organizationId}/limits`, { cache: "no-store" }),
        fetch(`/api/organizations/${organizationId}/limits/options`, { cache: "no-store" }),
      ]);
      const limitsJson = (await limitsResponse.json()) as { limits?: Limits; error?: string };
      const optionsJson = (await optionsResponse.json()) as Options & { error?: string };
      if (!limitsResponse.ok || limitsJson.limits === undefined) {
        setError(limitsJson.error ?? "Limites indisponibles");
        return;
      }
      setLimits(limitsJson.limits);
      setOptions({ providers: optionsJson.providers ?? [], clusters: optionsJson.clusters ?? [] });
      setMaxChatbots(
        limitsJson.limits.maxChatbots === null ? "" : String(limitsJson.limits.maxChatbots),
      );
      setMaxTokens(
        limitsJson.limits.budget?.maxTokens === null ||
          limitsJson.limits.budget?.maxTokens === undefined
          ? ""
          : String(limitsJson.limits.budget.maxTokens),
      );
      setResetMode(limitsJson.limits.budget?.tokenResetMode ?? "manual");
      setResetDays(
        limitsJson.limits.budget?.tokenResetDays === null ||
          limitsJson.limits.budget?.tokenResetDays === undefined
          ? ""
          : String(limitsJson.limits.budget.tokenResetDays),
      );
      setDrafts(draftsFrom(limitsJson.limits));
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addAllocation = (): void => {
    const provider = options.providers[0];
    const model = provider?.models[0];
    setDrafts((current) => [
      ...current,
      {
        key: `${Date.now()}-${Math.random()}`,
        kind: model === undefined && options.clusters[0] !== undefined ? "cluster" : "model",
        providerId: provider?.id ?? "",
        model: model?.modelId ?? "",
        clusterId: options.clusters[0]?.id ?? "",
        maxTokens: "",
      },
    ]);
  };

  const updateDraft = (index: number, patch: Partial<AllocationDraft>): void => {
    setDrafts((current) =>
      current.map((draft, currentIndex) =>
        currentIndex === index ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const save = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/limits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxChatbots: numberOrNull(maxChatbots),
          maxTokens: numberOrNull(maxTokens),
          tokenResetMode: resetMode,
          tokenResetDays: resetMode === "duration" ? numberOrNull(resetDays) : null,
          allocations: drafts.map((draft) =>
            draft.kind === "model"
              ? {
                  kind: "model",
                  providerId: draft.providerId,
                  model: draft.model,
                  maxTokens: numberOrNull(draft.maxTokens),
                }
              : {
                  kind: "cluster",
                  clusterId: draft.clusterId,
                  maxTokens: numberOrNull(draft.maxTokens),
                },
          ),
        }),
      });
      const json = (await response.json()) as { limits?: Limits; error?: string };
      if (!response.ok || json.limits === undefined) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      setLimits(json.limits);
      setDrafts(draftsFrom(json.limits));
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const reset = async (): Promise<void> => {
    if (!(await confirmDialog("Réinitialiser les compteurs IA de cette organisation ?"))) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/limits/reset`, {
        method: "POST",
      });
      const json = (await response.json()) as { limits?: Limits; error?: string };
      if (!response.ok || json.limits === undefined) {
        setError(json.error ?? "Réinitialisation impossible");
        return;
      }
      setLimits(json.limits);
      setDrafts(draftsFrom(json.limits));
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  if (loading) return <p className="hint">Chargement des limites IA…</p>;

  return (
    <section style={{ marginTop: "2rem" }}>
      <h3>Limites IA — {organizationName}</h3>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <div className="grid-2">
        <label className="field">
          Nombre maximal de chatbots
          <input
            type="number"
            min="0"
            placeholder="Illimité"
            value={maxChatbots}
            onChange={(event) => setMaxChatbots(event.target.value)}
          />
          <span className="hint">{limits?.chatbotsCount ?? 0} chatbot(s) existant(s).</span>
        </label>
        <label className="field">
          Budget global de tokens
          <input
            type="number"
            min="0"
            placeholder="Illimité"
            value={maxTokens}
            onChange={(event) => setMaxTokens(event.target.value)}
          />
          <span className="hint">
            Consommé : {limits?.budget?.tokensUsed ?? 0}
            {limits?.budget?.maxTokens === null || limits?.budget?.maxTokens === undefined
              ? ""
              : ` / ${limits.budget.maxTokens}`}
          </span>
        </label>
        <label className="field">
          Réinitialisation
          <select
            value={resetMode}
            onChange={(event) =>
              setResetMode(event.target.value === "duration" ? "duration" : "manual")
            }
          >
            <option value="manual">Manuelle</option>
            <option value="duration">Automatique après une durée</option>
          </select>
        </label>
        {resetMode === "duration" ? (
          <label className="field">
            Durée (jours)
            <input
              type="number"
              min="1"
              max="3650"
              value={resetDays}
              onChange={(event) => setResetDays(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      <h4 style={{ marginTop: "1.5rem" }}>Quotas par modèle ou cluster</h4>
      {drafts.length === 0 ? <p className="hint">Aucune allocation ciblée.</p> : null}
      {drafts.map((draft, index) => {
        const provider = options.providers.find((entry) => entry.id === draft.providerId);
        return (
          <div className="field-row" key={draft.key}>
            <div className="grid-2">
              <label className="field">
                Type de cible
                <select
                  value={draft.kind}
                  onChange={(event) => {
                    const kind = event.target.value === "cluster" ? "cluster" : "model";
                    updateDraft(index, {
                      kind,
                      providerId: kind === "model" ? (options.providers[0]?.id ?? "") : "",
                      model:
                        kind === "model" ? (options.providers[0]?.models[0]?.modelId ?? "") : "",
                      clusterId: kind === "cluster" ? (options.clusters[0]?.id ?? "") : "",
                    });
                  }}
                >
                  <option value="model">Fournisseur / modèle</option>
                  <option value="cluster">Cluster</option>
                </select>
              </label>
              {draft.kind === "model" ? (
                <>
                  <label className="field">
                    Fournisseur
                    <select
                      value={draft.providerId}
                      onChange={(event) => {
                        const nextProvider = options.providers.find(
                          (entry) => entry.id === event.target.value,
                        );
                        updateDraft(index, {
                          providerId: event.target.value,
                          model: nextProvider?.models[0]?.modelId ?? "",
                        });
                      }}
                    >
                      <option value="">— Choisir —</option>
                      {options.providers.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Modèle
                    <select
                      value={draft.model}
                      onChange={(event) => updateDraft(index, { model: event.target.value })}
                    >
                      <option value="">— Choisir —</option>
                      {(provider?.models ?? []).map((model) => (
                        <option key={model.modelId} value={model.modelId}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="field">
                  Cluster
                  <select
                    value={draft.clusterId}
                    onChange={(event) => updateDraft(index, { clusterId: event.target.value })}
                  >
                    <option value="">— Choisir —</option>
                    {options.clusters.map((cluster) => (
                      <option key={cluster.id} value={cluster.id}>
                        {cluster.label}
                        {cluster.actif ? "" : " (inactif)"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                Budget de tokens
                <input
                  type="number"
                  min="0"
                  placeholder="Illimité"
                  value={draft.maxTokens}
                  onChange={(event) => updateDraft(index, { maxTokens: event.target.value })}
                />
              </label>
            </div>
            <div className="tools">
              <button
                type="button"
                className="btn ghost small"
                onClick={() =>
                  setDrafts((current) =>
                    current.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
              >
                Retirer
              </button>
            </div>
          </div>
        );
      })}

      <div className="tools" style={{ marginTop: "1rem" }}>
        <button type="button" className="btn ghost small" onClick={addAllocation}>
          Ajouter une allocation
        </button>
        <button type="button" className="btn small" disabled={pending} onClick={() => void save()}>
          Enregistrer les limites
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={pending || limits?.budget === null}
          onClick={() => void reset()}
        >
          Réinitialiser les tokens
        </button>
      </div>
    </section>
  );
}
