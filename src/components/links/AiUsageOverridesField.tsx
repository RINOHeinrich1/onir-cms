"use client";

import { useEffect, useState } from "react";
import { AiModelSelect } from "@/components/ai/AiModelSelect";
import { AI_LINK_USAGES, type AiLinkTarget, type AiLinkUsage } from "@/domain/entities/ai-usage";
import type { AiProviderOption } from "./types";

type ClusterOption = { id: string; label: string; actif: boolean };

const LABELS: Record<AiLinkUsage, string> = {
  response: "Génération de réponse",
  extraction: "Extraction de données",
  selection: "Sélection médias & connaissances",
  summary: "Résumé de conversation",
};

function normalize(
  value: Partial<Record<AiLinkUsage, AiLinkTarget>>,
): Record<AiLinkUsage, AiLinkTarget> {
  return Object.fromEntries(
    AI_LINK_USAGES.map((usage) => [usage, value[usage] ?? { kind: "inherit" }]),
  ) as Record<AiLinkUsage, AiLinkTarget>;
}

/** Overrides IA par usage d'un chatbot (ADR-0058). */
export function AiUsageOverridesField({
  chatLinkId,
  providers,
  value,
  onChange,
  canAssign,
}: {
  chatLinkId?: string;
  providers: AiProviderOption[];
  value: Partial<Record<AiLinkUsage, AiLinkTarget>>;
  onChange: (value: Record<AiLinkUsage, AiLinkTarget>) => void;
  canAssign: boolean;
}) {
  const [clusters, setClusters] = useState<ClusterOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const current = normalize(value);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/clusters", { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json()) as { clusters?: ClusterOption[]; error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setError(json.error ?? "Clusters indisponibles");
          return;
        }
        setClusters((json.clusters ?? []).filter((cluster) => cluster.actif));
      })
      .catch(() => {
        if (!cancelled) setError("Clusters indisponibles");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (chatLinkId === undefined) return;
    let cancelled = false;
    void fetch(`/api/links/${chatLinkId}/ai-usage`, { cache: "no-store" })
      .then(async (response) => {
        const json = (await response.json()) as {
          overrides?: { usage: AiLinkUsage; target: AiLinkTarget }[];
          error?: string;
        };
        if (cancelled || !response.ok) return;
        const next = normalize({});
        for (const row of json.overrides ?? []) next[row.usage] = row.target;
        onChange(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [chatLinkId, onChange]);

  const patch = (usage: AiLinkUsage, target: AiLinkTarget): void => {
    onChange({ ...current, [usage]: target });
  };

  return (
    <fieldset className="card" style={{ marginBottom: "1rem" }}>
      <legend className="field">Moteurs IA par usage</legend>
      <p className="hint">
        Laissez « Hériter du défaut » pour utiliser la configuration de l’usage. Un modèle ou un
        cluster explicite prend le dessus pour ce chatbot.
      </p>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <div className="ai-usage-overrides">
        {AI_LINK_USAGES.map((usage) => {
          const target = current[usage];
          return (
            <div className="ai-usage-row" key={usage}>
              <strong>{LABELS[usage]}</strong>
              <select
                value={target.kind}
                disabled={!canAssign}
                aria-label={`Cible ${LABELS[usage]}`}
                onChange={(event) => {
                  const kind = event.target.value as AiLinkTarget["kind"];
                  if (kind === "inherit") patch(usage, { kind: "inherit" });
                  else if (kind === "cluster") patch(usage, { kind: "cluster", clusterId: "" });
                  else patch(usage, { kind: "model", providerId: "", model: "" });
                }}
              >
                <option value="inherit">Hériter du défaut</option>
                <option value="model">Modèle</option>
                <option value="cluster">Cluster</option>
              </select>

              {target.kind === "model" ? (
                <>
                  <select
                    value={target.providerId}
                    disabled={!canAssign}
                    aria-label={`Fournisseur ${LABELS[usage]}`}
                    onChange={(event) =>
                      patch(usage, { kind: "model", providerId: event.target.value, model: "" })
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
                    providerId={target.providerId === "" ? null : target.providerId}
                    value={target.model}
                    disabled={!canAssign || target.providerId === ""}
                    onChange={(model) =>
                      patch(usage, {
                        kind: "model",
                        providerId: target.providerId,
                        model,
                      })
                    }
                  />
                </>
              ) : null}

              {target.kind === "cluster" ? (
                <select
                  value={target.clusterId}
                  disabled={!canAssign}
                  aria-label={`Cluster ${LABELS[usage]}`}
                  onChange={(event) =>
                    patch(usage, { kind: "cluster", clusterId: event.target.value })
                  }
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
      {!canAssign ? <p className="hint">Vous ne pouvez pas modifier les moteurs IA.</p> : null}
    </fieldset>
  );
}
