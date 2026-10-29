"use client";

import { useCallback, useEffect, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  AI_USAGE_LABELS,
  AI_USAGES,
  type AiTarget,
  type AiUsage,
} from "@/domain/entities/ai-usage";
import { AiModelSelect } from "./AiModelSelect";
import type { AiProviderDto } from "./types";

type ClusterOption = { id: string; label: string; actif: boolean };
type TargetDraft = {
  kind: "inherit" | "model" | "cluster";
  providerId: string;
  model: string;
  clusterId: string;
};

function draftFromTarget(target: AiTarget | null): TargetDraft {
  if (target === null) {
    return { kind: "inherit", providerId: "", model: "", clusterId: "" };
  }
  if (target.kind === "cluster") {
    return { kind: "cluster", providerId: "", model: "", clusterId: target.clusterId };
  }
  return { kind: "model", providerId: target.providerId, model: target.model, clusterId: "" };
}

/** Défauts IA par usage métier (ADR-0058). */
export function AiUsageDefaults({
  providers,
  canManage,
  onSaved,
}: {
  providers: AiProviderDto[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [defaults, setDefaults] = useState<Partial<Record<AiUsage, TargetDraft>>>({});
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useToastOnMessage(error, notice);

  const load = useCallback(async (): Promise<void> => {
    const [defaultsResponse, clustersResponse] = await Promise.all([
      fetch("/api/ai/usage-defaults", { cache: "no-store" }),
      fetch("/api/ai/clusters", { cache: "no-store" }),
    ]);
    if (defaultsResponse.ok) {
      const json = (await defaultsResponse.json()) as {
        defaults?: { usage: AiUsage; target: AiTarget }[];
      };
      const next: Partial<Record<AiUsage, TargetDraft>> = {};
      for (const usage of AI_USAGES) {
        next[usage] = draftFromTarget(
          json.defaults?.find((entry) => entry.usage === usage)?.target ?? null,
        );
      }
      setDefaults(next);
    }
    if (clustersResponse.ok) {
      const json = (await clustersResponse.json()) as { clusters?: ClusterOption[] };
      setClusters((json.clusters ?? []).filter((cluster) => cluster.actif));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (usage: AiUsage, patch: Partial<TargetDraft>): void => {
    setDefaults((current) => ({
      ...current,
      [usage]: { ...(current[usage] ?? draftFromTarget(null)), ...patch },
    }));
  };

  const save = async (): Promise<void> => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      for (const usage of AI_USAGES) {
        const draft = defaults[usage] ?? draftFromTarget(null);
        if (draft.kind === "inherit") {
          const response = await fetch(`/api/ai/usage-defaults/${usage}`, { method: "DELETE" });
          if (!response.ok) throw new Error(`Suppression du défaut ${usage} impossible`);
          continue;
        }
        const target =
          draft.kind === "cluster"
            ? { kind: "cluster", clusterId: draft.clusterId }
            : { kind: "model", providerId: draft.providerId, model: draft.model };
        if (draft.kind === "cluster" && draft.clusterId === "") {
          throw new Error(`Choisissez un cluster pour ${AI_USAGE_LABELS[usage]}`);
        }
        if (draft.kind === "model" && (draft.providerId === "" || draft.model === "")) {
          throw new Error(`Choisissez un modèle pour ${AI_USAGE_LABELS[usage]}`);
        }
        const response = await fetch(`/api/ai/usage-defaults/${usage}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target),
        });
        if (!response.ok) {
          const json = (await response.json()) as { error?: string };
          throw new Error(json.error ?? `Enregistrement de ${usage} impossible`);
        }
      }
      setNotice("Défauts IA enregistrés.");
      onSaved();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
        Défauts par usage
      </h2>
      <p className="hint">
        Chaque usage hérite du lien par défaut. Un défaut explicite prend le relais quand le lien
        n’a pas d’override.
      </p>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {notice !== null ? <p className="alert success">{notice}</p> : null}

      <div className="ai-usage-defaults">
        {AI_USAGES.map((usage) => {
          const draft = defaults[usage] ?? draftFromTarget(null);
          return (
            <div className="ai-usage-row" key={usage}>
              <div>
                <strong>{AI_USAGE_LABELS[usage]}</strong>
                {usage === "assistant" ? (
                  <p className="hint">Configuration préparée ; fonctionnalité à venir.</p>
                ) : null}
              </div>
              <select
                value={draft.kind}
                disabled={!canManage || pending}
                aria-label={`Type de cible pour ${AI_USAGE_LABELS[usage]}`}
                onChange={(event) =>
                  patch(usage, { kind: event.target.value as TargetDraft["kind"] })
                }
              >
                <option value="inherit">
                  {usage === "assistant" ? "Aucun" : "Hériter du lien / legacy"}
                </option>
                <option value="model">Modèle</option>
                <option value="cluster">Cluster</option>
              </select>

              {draft.kind === "model" ? (
                <>
                  <select
                    value={draft.providerId}
                    disabled={!canManage || pending}
                    aria-label={`Fournisseur pour ${AI_USAGE_LABELS[usage]}`}
                    onChange={(event) =>
                      patch(usage, { providerId: event.target.value, model: "" })
                    }
                  >
                    <option value="">— Fournisseur —</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                  <AiModelSelect
                    providerId={draft.providerId === "" ? null : draft.providerId}
                    value={draft.model}
                    disabled={!canManage || pending || draft.providerId === ""}
                    onChange={(model) => patch(usage, { model })}
                  />
                </>
              ) : null}

              {draft.kind === "cluster" ? (
                <select
                  value={draft.clusterId}
                  disabled={!canManage || pending}
                  aria-label={`Cluster pour ${AI_USAGE_LABELS[usage]}`}
                  onChange={(event) => patch(usage, { clusterId: event.target.value })}
                >
                  <option value="">— Cluster —</option>
                  {clusters.map((cluster) => (
                    <option key={cluster.id} value={cluster.id}>
                      {cluster.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          );
        })}
      </div>

      {canManage ? (
        <div className="tools">
          <button
            type="button"
            className="btn small"
            disabled={pending}
            onClick={() => void save()}
          >
            {pending ? "Enregistrement…" : "Enregistrer les défauts"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
