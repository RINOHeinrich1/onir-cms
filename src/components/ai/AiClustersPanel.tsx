"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import type { AiCluster, AiClusterMember } from "@/domain/entities/ai-usage";
import { AiModelSelect } from "./AiModelSelect";
import type { AiProviderDto } from "./types";

type MemberDraft = { id: string; providerId: string; model: string; enabled: boolean };
type ClusterDraft = { label: string; description: string; actif: boolean; members: MemberDraft[] };

function newMember(): MemberDraft {
  return { id: crypto.randomUUID(), providerId: "", model: "", enabled: true };
}

function emptyDraft(): ClusterDraft {
  return {
    label: "",
    description: "",
    actif: true,
    members: [newMember()],
  };
}

function draftFromCluster(cluster: AiCluster): ClusterDraft {
  return {
    label: cluster.label,
    description: cluster.description,
    actif: cluster.actif,
    members: cluster.members.map((member: AiClusterMember, index) => ({
      id: `${index}-${member.providerId}-${member.model}`,
      providerId: member.providerId,
      model: member.model,
      enabled: member.enabled,
    })),
  };
}

/** Clusters de modèles avec fallback ordonné (ADR-0058). */
export function AiClustersPanel({
  providers,
  canManage,
}: {
  providers: AiProviderDto[];
  canManage: boolean;
}) {
  const [clusters, setClusters] = useState<AiCluster[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClusterDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toast = useToast();
  useToastOnMessage(error, notice);

  const load = useCallback(async (): Promise<void> => {
    const response = await fetch("/api/ai/clusters?includeInactive=1", { cache: "no-store" });
    if (response.ok) {
      const json = (await response.json()) as { clusters?: AiCluster[] };
      setClusters(json.clusters ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (value: Partial<ClusterDraft>): void => {
    setDraft((current) => (current === null ? current : { ...current, ...value }));
  };

  const patchMember = (index: number, value: Partial<MemberDraft>): void => {
    setDraft((current) =>
      current === null
        ? current
        : {
            ...current,
            members: current.members.map((member, currentIndex) =>
              currentIndex === index ? { ...member, ...value } : member,
            ),
          },
    );
  };

  const save = async (): Promise<void> => {
    if (draft === null) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        editingId === null ? "/api/ai/clusters" : `/api/ai/clusters/${editingId}`,
        {
          method: editingId === null ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Enregistrement impossible");
        return;
      }
      toast.success(editingId === null ? "Cluster créé." : "Cluster modifié.");
      setDraft(null);
      setEditingId(null);
      await load();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const remove = async (cluster: AiCluster): Promise<void> => {
    if (!(await confirmDialog(`Supprimer le cluster « ${cluster.label} » ?`))) return;
    setError(null);
    try {
      const response = await fetch(`/api/ai/clusters/${cluster.id}`, { method: "DELETE" });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Suppression impossible");
        return;
      }
      await load();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <section className="card" style={{ marginBottom: "1.5rem" }}>
      <div className="page-head" style={{ marginBottom: "1rem" }}>
        <div>
          <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
            Clusters de secours
          </h2>
          <p className="hint">
            Les modèles sont essayés dans l’ordre. Un cluster peut mélanger plusieurs fournisseurs.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setEditingId(null);
              setDraft(emptyDraft());
            }}
          >
            Nouveau cluster
          </button>
        ) : null}
      </div>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {notice !== null ? <p className="alert success">{notice}</p> : null}

      {draft !== null ? (
        <div className="card ai-cluster-editor">
          <h3 className="text-title" style={{ fontSize: "0.95rem" }}>
            {editingId === null ? "Nouveau cluster" : "Modifier le cluster"}
          </h3>
          <label className="field">
            Nom *
            <input
              type="text"
              maxLength={120}
              value={draft.label}
              onChange={(event) => patch({ label: event.target.value })}
            />
          </label>
          <label className="field">
            Description
            <textarea
              rows={2}
              value={draft.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.actif}
              onChange={(event) => patch({ actif: event.target.checked })}
            />
            Cluster actif
          </label>

          <div className="ai-cluster-members">
            {draft.members.map((member, index) => (
              <div className="ai-cluster-member" key={member.id}>
                <span className="badge">#{index + 1}</span>
                <select
                  value={member.providerId}
                  aria-label={`Fournisseur du membre ${index + 1}`}
                  onChange={(event) =>
                    patchMember(index, { providerId: event.target.value, model: "" })
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
                  providerId={member.providerId === "" ? null : member.providerId}
                  value={member.model}
                  disabled={member.providerId === ""}
                  onChange={(model) => patchMember(index, { model })}
                />
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={index === 0}
                  onClick={() => {
                    const members = [...draft.members];
                    const before = members[index - 1];
                    const current = members[index];
                    if (before === undefined || current === undefined) return;
                    members[index - 1] = current;
                    members[index] = before;
                    patch({ members });
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={index === draft.members.length - 1}
                  onClick={() => {
                    const members = [...draft.members];
                    const after = members[index + 1];
                    const current = members[index];
                    if (after === undefined || current === undefined) return;
                    members[index + 1] = current;
                    members[index] = after;
                    patch({ members });
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn ghost small"
                  disabled={draft.members.length === 1}
                  onClick={() =>
                    patch({ members: draft.members.filter((_entry, i) => i !== index) })
                  }
                >
                  Retirer
                </button>
              </div>
            ))}
          </div>
          <div className="tools">
            <button
              type="button"
              className="btn ghost small"
              onClick={() => patch({ members: [...draft.members, newMember()] })}
            >
              Ajouter un modèle
            </button>
            <button
              type="button"
              className="btn small"
              disabled={pending}
              onClick={() => void save()}
            >
              {pending ? "Enregistrement…" : "Enregistrer le cluster"}
            </button>
            <button type="button" className="btn ghost small" onClick={() => setDraft(null)}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}

      <div className="ai-cluster-list">
        {clusters.length === 0 ? <p className="hint">Aucun cluster configuré.</p> : null}
        {clusters.map((cluster) => (
          <div className="ai-cluster-card" key={cluster.id}>
            <div className="page-head" style={{ marginBottom: "0.5rem" }}>
              <strong>
                {cluster.label}{" "}
                {cluster.actif ? null : <span className="badge orange">inactif</span>}
              </strong>
              {canManage ? (
                <div className="tools">
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setEditingId(cluster.id);
                      setDraft(draftFromCluster(cluster));
                    }}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className="btn danger ghost small"
                    onClick={() => void remove(cluster)}
                  >
                    Supprimer
                  </button>
                </div>
              ) : null}
            </div>
            {cluster.description === "" ? null : <p className="hint">{cluster.description}</p>}
            <ol className="ai-cluster-members-read">
              {cluster.members.map((member) => (
                <li key={member.position}>
                  {providers.find((provider) => provider.id === member.providerId)?.label ??
                    "Fournisseur"}{" "}
                  · {member.model}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
