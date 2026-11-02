"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreatorFilterMenu } from "@/components/ui/CreatorFilterMenu";
import { confirmDialog } from "@/components/ui/confirm";
import {
  creatorOptions,
  hasUnassignedCreator,
  matchesCreator,
} from "@/components/ui/creator-options";
import { Modal } from "@/components/ui/Modal";
import { RoundCheckbox } from "@/components/ui/RoundCheckbox";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { ConnaissanceCard } from "./ConnaissanceCard";
import { ConnaissanceDetailModal } from "./ConnaissanceDetailModal";
import { ConnaissanceForm } from "./ConnaissanceForm";
import { pruneSelection, selectionState, toggleVisibleSelection } from "./connaissance-selection";
import type { ConnaissanceDto } from "./types";

/** Base de connaissances : cartes, détail, sélection multiple et CRUD (US-CONNAISS-001). */
export function ConnaissancesTable({
  initialConnaissances,
  canWrite,
}: {
  initialConnaissances: ConnaissanceDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [connaissances, setConnaissances] = useState<ConnaissanceDto[]>(initialConnaissances);
  const [editing, setEditing] = useState<ConnaissanceDto | null>(null);
  const [detail, setDetail] = useState<ConnaissanceDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const creators = creatorOptions(connaissances);
  const showUnassigned = hasUnassignedCreator(connaissances);
  const visibleConnaissances = connaissances.filter((item) => matchesCreator(item, creatorFilter));
  const visibleIds = visibleConnaissances.map((item) => item.id);
  const visibleSelection = selectionState(selectedIds, visibleIds);

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/connaissances", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { connaissances: ConnaissanceDto[] };
        setConnaissances(json.connaissances);
        setSelectedIds((current) =>
          pruneSelection(
            current,
            json.connaissances.map((item) => item.id),
          ),
        );
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

  const applyCreatorFilter = (next: string[]): void => {
    setCreatorFilter(next);
    setSelectedIds([]);
  };

  const remove = async (connaissance: ConnaissanceDto): Promise<void> => {
    setError(null);
    if (!(await confirmDialog(`Supprimer « ${connaissance.titre} » ?`))) return;
    try {
      const response = await fetch(`/api/connaissances/${connaissance.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression impossible");
        return;
      }
      setSelectedIds((current) => current.filter((id) => id !== connaissance.id));
      toast.success("Connaissance supprimée.");
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  const removeSelection = async (): Promise<void> => {
    if (selectedIds.length === 0 || bulkPending) return;
    const ids = [...selectedIds];
    setError(null);
    if (
      !(await confirmDialog(
        `Supprimer ${ids.length} connaissance${ids.length > 1 ? "s" : ""} ? Cette action est irréversible.`,
        {
          title: "Supprimer la sélection",
          confirmLabel: "Supprimer",
          danger: true,
        },
      ))
    ) {
      return;
    }

    setBulkPending(true);
    try {
      const response = await fetch("/api/connaissances", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = (await response.json()) as {
        error?: string;
        deleted?: number;
        missing?: number;
      };
      if (!response.ok) {
        setError(json.error ?? "Suppression impossible");
        return;
      }

      const deleted = json.deleted ?? 0;
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      await refresh();

      if (deleted === 0) {
        setError("Aucune connaissance supprimée");
        return;
      }
      if ((json.missing ?? 0) > 0) {
        toast.warning(
          `${deleted} connaissance${deleted > 1 ? "s" : ""} supprimée${deleted > 1 ? "s" : ""}, ${json.missing} introuvable${(json.missing ?? 0) > 1 ? "s" : ""}.`,
        );
        return;
      }
      toast.success(
        `${deleted} connaissance${deleted > 1 ? "s" : ""} supprimée${deleted > 1 ? "s" : ""}.`,
      );
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setBulkPending(false);
    }
  };

  return (
    <div className="connaissances-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <div className="connaissances-toolbar">
        <CreatorFilterMenu
          options={creators}
          showUnassigned={showUnassigned}
          value={creatorFilter}
          onChange={applyCreatorFilter}
        />

        <div className="connaissances-toolbar-actions">
          <RoundCheckbox
            checked={visibleSelection === "all"}
            indeterminate={visibleSelection === "partial"}
            disabled={visibleIds.length === 0}
            onChange={() =>
              setSelectedIds((current) => toggleVisibleSelection(current, visibleIds))
            }
            ariaLabel={visibleSelection === "all" ? "Tout désélectionner" : "Tout sélectionner"}
          >
            {visibleSelection === "all" ? "Tout désélectionner" : "Tout sélectionner"}
            <span className="connaissance-select-count">({visibleIds.length})</span>
          </RoundCheckbox>

          {canWrite ? (
            <button type="button" className="btn small" onClick={() => setCreating(true)}>
              Nouvelle entrée
            </button>
          ) : null}
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="connaissances-bulk-bar" role="status">
          <strong>
            {selectedIds.length} connaissance{selectedIds.length > 1 ? "s" : ""} sélectionnée
            {selectedIds.length > 1 ? "s" : ""}
          </strong>
          {canWrite ? (
            <button
              type="button"
              className="btn danger small"
              disabled={bulkPending}
              onClick={() => void removeSelection()}
            >
              {bulkPending ? "Suppression…" : "Supprimer la sélection"}
            </button>
          ) : null}
        </div>
      ) : null}

      <ul className="connaissances-list">
        {visibleConnaissances.map((connaissance) => (
          <ConnaissanceCard
            key={connaissance.id}
            connaissance={connaissance}
            canWrite={canWrite}
            selected={selectedIds.includes(connaissance.id)}
            onSelectionChange={(checked) =>
              setSelectedIds((current) =>
                checked
                  ? [...new Set([...current, connaissance.id])]
                  : current.filter((id) => id !== connaissance.id),
              )
            }
            onDetail={() => setDetail(connaissance)}
            onEdit={() => setEditing(connaissance)}
            onDelete={() => void remove(connaissance)}
          />
        ))}
      </ul>

      {visibleConnaissances.length === 0 ? (
        <p className="connaissances-empty">
          {connaissances.length === 0 ? "Aucune entrée." : "Aucune entrée pour ce créateur."}
        </p>
      ) : null}

      {detail !== null ? (
        <ConnaissanceDetailModal
          connaissance={detail}
          canEdit={canWrite}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            setEditing(detail);
          }}
        />
      ) : null}

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
