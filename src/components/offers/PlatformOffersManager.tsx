"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";

type Offer = {
  id: string;
  name: string;
  description: string;
  provisioning: OrganizationProvisioning;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type CatalogModel = { modelId: string; label: string; enabled: boolean };
type CatalogProvider = {
  id: string;
  label: string;
  organizationName: string;
  models: CatalogModel[];
};
type CatalogCluster = { id: string; label: string; organizationName: string; actif: boolean };
type Catalog = { providers: CatalogProvider[]; clusters: CatalogCluster[] };

type AllocationTarget =
  | { kind: "model"; providerId: string; model: string }
  | { kind: "cluster"; clusterId: string };

type AllocationDraft = {
  key: string;
  target: AllocationTarget;
  maxTokens: string;
};

function targetKey(target: AllocationTarget): string {
  return target.kind === "model"
    ? `model:${target.providerId}:${target.model}`
    : `cluster:${target.clusterId}`;
}

function numberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function draftFrom(provisioning: OrganizationProvisioning): AllocationDraft[] {
  return provisioning.allocations.map((allocation) => ({
    key: targetKey(allocation.target),
    target: allocation.target,
    maxTokens: allocation.maxTokens === null ? "" : String(allocation.maxTokens),
  }));
}

export function PlatformOffersManager() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [catalog, setCatalog] = useState<Catalog>({ providers: [], clusters: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [maxChatbots, setMaxChatbots] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [resetMode, setResetMode] = useState<"manual" | "duration">("manual");
  const [resetDays, setResetDays] = useState("");
  const [allocations, setAllocations] = useState<AllocationDraft[]>([]);
  const [defaults, setDefaults] = useState<OrganizationProvisioning["defaults"]>([]);
  const [resource, setResource] = useState("");
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [offersResponse, catalogResponse] = await Promise.all([
        fetch("/api/platform/offers?includeInactive=1", { cache: "no-store" }),
        fetch("/api/admin/ai/catalog", { cache: "no-store" }),
      ]);
      const offersJson = (await offersResponse.json()) as { offers?: Offer[]; error?: string };
      const catalogJson = (await catalogResponse.json()) as Catalog & { error?: string };
      if (!offersResponse.ok) {
        setError(offersJson.error ?? "Offres indisponibles");
        return;
      }
      setOffers(offersJson.offers ?? []);
      setCatalog({
        providers: catalogJson.providers ?? [],
        clusters: catalogJson.clusters ?? [],
      });
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = (): void => {
    setEditingId(null);
    setName("");
    setDescription("");
    setActive(true);
    setMaxChatbots("");
    setMaxTokens("");
    setResetMode("manual");
    setResetDays("");
    setAllocations([]);
    setDefaults([]);
    setResource("");
  };

  const edit = (offer: Offer): void => {
    setEditingId(offer.id);
    setName(offer.name);
    setDescription(offer.description);
    setActive(offer.active);
    setMaxChatbots(
      offer.provisioning.maxChatbots === null ? "" : String(offer.provisioning.maxChatbots),
    );
    setMaxTokens(offer.provisioning.maxTokens === null ? "" : String(offer.provisioning.maxTokens));
    setResetMode(offer.provisioning.tokenResetMode);
    setResetDays(
      offer.provisioning.tokenResetDays === null ? "" : String(offer.provisioning.tokenResetDays),
    );
    setAllocations(draftFrom(offer.provisioning));
    setDefaults(offer.provisioning.defaults);
    setResource("");
  };

  const resourceOptions = (): { value: string; label: string }[] => [
    ...catalog.providers.flatMap((provider) =>
      provider.models
        .filter((model) => model.enabled)
        .map((model) => ({
          value: JSON.stringify({
            kind: "model",
            providerId: provider.id,
            model: model.modelId,
          }),
          label: `${provider.organizationName} · ${provider.label} · ${model.label}`,
        })),
    ),
    ...catalog.clusters
      .filter((cluster) => cluster.actif)
      .map((cluster) => ({
        value: JSON.stringify({ kind: "cluster", clusterId: cluster.id }),
        label: `${cluster.organizationName} · Cluster ${cluster.label}`,
      })),
  ];

  const addAllocation = (): void => {
    if (resource === "") return;
    const target = JSON.parse(resource) as AllocationTarget;
    const key = targetKey(target);
    if (allocations.some((entry) => entry.key === key)) return;
    setAllocations((current) => [...current, { key, target, maxTokens: "" }]);
    setResource("");
  };

  const targetLabel = (target: AllocationTarget): string => {
    if (target.kind === "cluster") {
      const cluster = catalog.clusters.find((entry) => entry.id === target.clusterId);
      return cluster === undefined ? `Cluster ${target.clusterId}` : `Cluster ${cluster.label}`;
    }
    const provider = catalog.providers.find((entry) => entry.id === target.providerId);
    return provider === undefined
      ? `${target.providerId} · ${target.model}`
      : `${provider.label} · ${target.model}`;
  };

  const save = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const allocationKeys = new Set(allocations.map((entry) => entry.key));
      const provisioning: OrganizationProvisioning = {
        maxChatbots: numberOrNull(maxChatbots),
        maxTokens: numberOrNull(maxTokens),
        tokenResetMode: resetMode,
        tokenResetDays: resetMode === "duration" ? numberOrNull(resetDays) : null,
        allocations: allocations.map((entry) => ({
          target: entry.target,
          maxTokens: numberOrNull(entry.maxTokens),
        })),
        defaults: defaults.filter((entry) => allocationKeys.has(targetKey(entry.target))),
      };
      const response = await fetch(
        editingId === null ? "/api/platform/offers" : `/api/platform/offers/${editingId}`,
        {
          method: editingId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            active,
            provisioning,
          }),
        },
      );
      const json = (await response.json()) as { offer?: Offer; error?: string };
      if (!response.ok || json.offer === undefined) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      await load();
      resetForm();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const remove = async (offer: Offer): Promise<void> => {
    if (!(await confirmDialog(`Supprimer l'offre « ${offer.name} » ?`))) return;
    setError(null);
    try {
      const response = await fetch(`/api/platform/offers/${offer.id}`, { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Suppression impossible");
        return;
      }
      await load();
      if (editingId === offer.id) resetForm();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div>
      {error !== null ? <p className="alert error">{error}</p> : null}
      <form
        className="form card"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3>{editingId === null ? "Nouvelle offre" : "Modifier l'offre"}</h3>
        <div className="grid-2">
          <label className="field">
            Nom
            <input
              type="text"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            Description
            <input
              type="text"
              maxLength={2000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="field">
            Nombre maximal de chatbots
            <input
              type="number"
              min="0"
              placeholder="Illimité"
              value={maxChatbots}
              onChange={(event) => setMaxChatbots(event.target.value)}
            />
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
              <option value="duration">Automatique</option>
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
        <label className="hint" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          Offre active et sélectionnable dans les invitations
        </label>

        <h4 style={{ marginTop: "1.2rem" }}>Ressources autorisées</h4>
        <label className="field">
          Modèle ou cluster
          <select value={resource} onChange={(event) => setResource(event.target.value)}>
            <option value="">— Choisir une ressource —</option>
            {resourceOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="tools">
          <button type="button" className="btn ghost small" onClick={addAllocation}>
            Ajouter la ressource
          </button>
        </div>
        {allocations.map((entry, index) => (
          <div className="field-row" key={entry.key}>
            <div className="grid-2">
              <span className="hint">{targetLabel(entry.target)}</span>
              <label className="field">
                Budget de tokens
                <input
                  type="number"
                  min="0"
                  placeholder="Illimité"
                  value={entry.maxTokens}
                  onChange={(event) =>
                    setAllocations((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, maxTokens: event.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <div className="tools">
              <button
                type="button"
                className="btn ghost small"
                onClick={() =>
                  setAllocations((current) => current.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                Retirer
              </button>
            </div>
          </div>
        ))}
        <div className="tools">
          <button type="submit" className="btn small" disabled={pending}>
            {pending ? "Enregistrement…" : editingId === null ? "Créer l'offre" : "Enregistrer"}
          </button>
          {editingId !== null ? (
            <button type="button" className="btn ghost small" onClick={resetForm}>
              Annuler
            </button>
          ) : null}
        </div>
      </form>

      <div className="table-scroll" style={{ marginTop: "2rem" }}>
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Offre</th>
              <th>Chatbots</th>
              <th>Budget global</th>
              <th>Ressources</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 ? (
              <tr>
                <td colSpan={6} className="hint">
                  Aucune offre.
                </td>
              </tr>
            ) : (
              offers.map((offer) => (
                <tr key={offer.id}>
                  <td data-label="Offre">
                    <strong>{offer.name}</strong>
                    {offer.description === "" ? null : (
                      <div className="hint">{offer.description}</div>
                    )}
                  </td>
                  <td data-label="Chatbots">
                    {offer.provisioning.maxChatbots === null
                      ? "Illimité"
                      : offer.provisioning.maxChatbots}
                  </td>
                  <td data-label="Budget global">
                    {offer.provisioning.maxTokens === null
                      ? "Illimité"
                      : offer.provisioning.maxTokens}
                  </td>
                  <td data-label="Ressources">{offer.provisioning.allocations.length}</td>
                  <td data-label="Statut">
                    <span className={`badge ${offer.active ? "" : "muted"}`}>
                      {offer.active ? "active" : "inactive"}
                    </span>
                  </td>
                  <td data-label="Actions" className="cell-actions">
                    <div className="tools">
                      <button type="button" className="btn ghost small" onClick={() => edit(offer)}>
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => void remove(offer)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
