"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreatorFilter } from "@/components/ui/CreatorFilter";
import {
  creatorOptions,
  hasUnassignedCreator,
  matchesCreator,
} from "@/components/ui/creator-options";
import { Modal } from "@/components/ui/Modal";
import { TemplateKeysBadges } from "@/components/ui/TemplateKeysBadges";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { ConnaissanceForm } from "./ConnaissanceForm";
import type { ConnaissanceDto } from "./types";

/** Table de la base de connaissances + CRUD (US-CONNAISS-001). */
export function ConnaissancesTable({
  initialConnaissances,
  canWrite,
}: {
  initialConnaissances: ConnaissanceDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [connaissances, setConnaissances] = useState<ConnaissanceDto[]>(initialConnaissances);
  const [editing, setEditing] = useState<ConnaissanceDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const creators = creatorOptions(connaissances);
  const showUnassigned = hasUnassignedCreator(connaissances);
  const visibleConnaissances = connaissances.filter((item) => matchesCreator(item, creatorFilter));

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/connaissances", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { connaissances: ConnaissanceDto[] };
        setConnaissances(json.connaissances);
      }
    } catch {
      setError("Impossible de recharger la liste");
    }
    router.refresh();
  };

  const onSaved = async (): Promise<void> => {
    setEditing(null);
    setCreating(false);
    await refresh();
  };

  const remove = async (connaissance: ConnaissanceDto): Promise<void> => {
    setError(null);
    if (!window.confirm(`Supprimer « ${connaissance.titre} » ?`)) return;
    try {
      const response = await fetch(`/api/connaissances/${connaissance.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression impossible");
        return;
      }
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div className="connaissances-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <CreatorFilter
        options={creators}
        showUnassigned={showUnassigned}
        value={creatorFilter}
        onChange={setCreatorFilter}
      />

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouvelle entrée
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Titre</th>
              <th>Contenu</th>
              <th>Portée</th>
              <th>Statut</th>
              <th>Créé par</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visibleConnaissances.map((connaissance) => (
              <tr key={connaissance.id}>
                <td data-label="Titre">
                  <strong>{connaissance.titre}</strong>
                </td>
                <td data-label="Contenu" className="cell-contacts">
                  {connaissance.contenu}
                </td>
                <td data-label="Portée">
                  <TemplateKeysBadges keys={connaissance.templateKeys} />
                </td>
                <td data-label="Statut">
                  <span className={`badge ${connaissance.actif ? "" : "muted"}`}>
                    {connaissance.actif ? "active" : "inactive"}
                  </span>
                </td>
                <td data-label="Créé par">
                  {connaissance.createdByLabel ?? <span className="muted-text">—</span>}
                </td>
                {canWrite ? (
                  <td data-label="Actions" className="cell-actions">
                    <div className="tools">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setEditing(connaissance)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => void remove(connaissance)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {visibleConnaissances.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5}>
                  {connaissances.length === 0
                    ? "Aucune entrée."
                    : "Aucune entrée pour ce créateur."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating || editing !== null ? (
        <Modal
          title={editing === null ? "Nouvelle entrée" : `Modifier « ${editing.titre} »`}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
        >
          <ConnaissanceForm
            editing={editing}
            onSaved={() => void onSaved()}
            onCancel={() => {
              setEditing(null);
              setCreating(false);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
