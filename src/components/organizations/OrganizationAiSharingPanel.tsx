"use client";

import { useCallback, useEffect, useState } from "react";
import { useToastOnMessage } from "@/components/ui/ToastProvider";

type GrantTarget =
  | { kind: "provider"; providerId: string }
  | { kind: "model"; providerId: string; model: string }
  | { kind: "cluster"; clusterId: string };

type CatalogModel = { modelId: string; label: string; enabled: boolean };

type CatalogProvider = {
  id: string;
  label: string;
  organizationId: string;
  organizationName: string;
  archivedAt: string | null;
  models: CatalogModel[];
};

type CatalogCluster = {
  id: string;
  label: string;
  organizationId: string;
  organizationName: string;
  actif: boolean;
  members: { providerId: string; model: string; enabled: boolean }[];
};

type Grants = {
  providers: string[];
  models: { providerId: string; model: string }[];
  clusters: string[];
};

type Payload = {
  grants: Grants;
  catalog: { providers: CatalogProvider[]; clusters: CatalogCluster[] };
};

export function OrganizationAiSharingPanel({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/ai-grants`, {
        cache: "no-store",
      });
      const json = (await response.json()) as Payload & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Partages indisponibles");
        return;
      }
      setPayload(json);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (method: "POST" | "DELETE", target: GrantTarget): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/organizations/${organizationId}/ai-grants`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      const json = (await response.json()) as Payload & { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Action impossible");
        return;
      }
      setPayload(json);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  if (payload === null) return <p className="hint">Chargement des partages IA…</p>;

  const providerGrants = new Set(payload.grants.providers);
  const modelGrants = new Set(
    payload.grants.models.map((entry) => `${entry.providerId}:${entry.model}`),
  );
  const clusterGrants = new Set(payload.grants.clusters);
  const providers = payload.catalog.providers.filter(
    (provider) => provider.organizationId !== organizationId && provider.archivedAt === null,
  );
  const clusters = payload.catalog.clusters.filter(
    (cluster) => cluster.organizationId !== organizationId,
  );

  return (
    <section style={{ marginTop: "2rem" }}>
      <h3>Partages IA — {organizationName}</h3>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <p className="hint">
        Partagez des fournisseurs, modèles ou clusters avec cette organisation. Les ressources
        restent gérées par leur organisation propriétaire.
      </p>

      <h4>Fournisseurs et modèles</h4>
      {providers.length === 0 ? <p className="hint">Aucun fournisseur partageable.</p> : null}
      {providers.map((provider) => {
        const providerGranted = providerGrants.has(provider.id);
        return (
          <div className="field-row" key={provider.id}>
            <label>
              <input
                type="checkbox"
                checked={providerGranted}
                disabled={pending}
                onChange={() => {
                  const target: GrantTarget = { kind: "provider", providerId: provider.id };
                  void mutate(providerGranted ? "DELETE" : "POST", target);
                }}
              />{" "}
              <strong>{provider.label}</strong>{" "}
              <span className="hint">— {provider.organizationName}</span>
            </label>
            {provider.models.length > 0 ? (
              <div className="tools" style={{ flexWrap: "wrap" }}>
                {provider.models.map((model) => {
                  const modelGranted =
                    providerGranted || modelGrants.has(`${provider.id}:${model.modelId}`);
                  return (
                    <label
                      key={model.modelId}
                      className="hint"
                      style={{ display: "flex", gap: "0.35rem" }}
                    >
                      <input
                        type="checkbox"
                        checked={modelGranted}
                        disabled={pending || providerGranted || !model.enabled}
                        onChange={() => {
                          const target: GrantTarget = {
                            kind: "model",
                            providerId: provider.id,
                            model: model.modelId,
                          };
                          void mutate(modelGranted ? "DELETE" : "POST", target);
                        }}
                      />
                      {model.label}
                      {model.enabled ? "" : " (inactif)"}
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      <h4 style={{ marginTop: "1.5rem" }}>Clusters</h4>
      {clusters.length === 0 ? <p className="hint">Aucun cluster partageable.</p> : null}
      {clusters.map((cluster) => {
        const granted = clusterGrants.has(cluster.id);
        return (
          <div className="field-row" key={cluster.id}>
            <label>
              <input
                type="checkbox"
                checked={granted}
                disabled={pending || !cluster.actif}
                onChange={() => {
                  const target: GrantTarget = { kind: "cluster", clusterId: cluster.id };
                  void mutate(granted ? "DELETE" : "POST", target);
                }}
              />{" "}
              <strong>{cluster.label}</strong>{" "}
              <span className="hint">
                — {cluster.organizationName}
                {cluster.actif ? "" : " (inactif)"} · {cluster.members.length} membre(s)
              </span>
            </label>
          </div>
        );
      })}
    </section>
  );
}
