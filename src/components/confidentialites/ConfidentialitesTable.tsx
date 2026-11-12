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
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { ConfidentialiteCard } from "./ConfidentialiteCard";
import { ConfidentialiteDetailModal } from "./ConfidentialiteDetailModal";
import { ConfidentialiteForm } from "./ConfidentialiteForm";
import type { ConfidentialiteDto } from "./types";

/**
 * Cartes des politiques de confidentialité : création, détail, édition,
 * suppression et état (US-CONFID-001).
 */
export function ConfidentialitesTable({
  initialConfidentialites,
  canWrite,
}: {
  initialConfidentialites: ConfidentialiteDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ConfidentialiteDto[]>(initialConfidentialites);
  const [editing, setEditing] = useState<ConfidentialiteDto | null>(null);
  const [detail, setDetail] = useState<ConfidentialiteDto | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const creators = creatorOptions(items);
  const showUnassigned = hasUnassignedCreator(items);
  const visibleItems = items.filter((item) => matchesCreator(item, creatorFilter));

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/confidentialites", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { confidentialites: ConfidentialiteDto[] };
        setItems(json.confidentialites);
      }
    } catch {
      setError("Impossible de recharger la liste");
    }
    router.refresh();
  };

  const remove = async (item: ConfidentialiteDto): Promise<void> => {
    if (
      !(await confirmDialog(
        `Supprimer « ${item.titre} » ? Les liens rattachés perdront leur politique.`,
      ))
    ) {
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/confidentialites/${item.id}`, { method: "DELETE" });
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
    <div className="confidentialites-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <div className="confidentialites-toolbar">
        <CreatorFilterMenu
          options={creators}
          showUnassigned={showUnassigned}
          value={creatorFilter}
          onChange={setCreatorFilter}
        />

        {canWrite ? (
          <div className="tools confidentialites-toolbar-actions">
            <button type="button" className="btn small" onClick={() => setCreating(true)}>
              Nouvelle politique
            </button>
          </div>
        ) : null}
      </div>

      <ul className="confidentialites-list">
        {visibleItems.map((item) => (
          <ConfidentialiteCard
            key={item.id}
            confidentialite={item}
            canWrite={canWrite}
            onDetail={() => setDetail(item)}
            onEdit={() => setEditing(item)}
            onDelete={() => void remove(item)}
          />
        ))}
      </ul>

      {visibleItems.length === 0 ? (
        <p className="confidentialites-empty">
          {items.length === 0
            ? "Aucune politique de confidentialité."
            : "Aucune politique pour ce créateur."}
        </p>
      ) : null}

      {detail !== null ? (
        <ConfidentialiteDetailModal
          confidentialite={detail}
          canWrite={canWrite}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            setEditing(detail);
          }}
        />
      ) : null}

      {creating ? (
        <Modal title="Nouvelle politique" onClose={() => setCreating(false)}>
          <ConfidentialiteForm
            confidentialite={null}
            onSaved={() => {
              setCreating(false);
              void refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      ) : null}

      {editing !== null ? (
        <Modal title="Modifier la politique" onClose={() => setEditing(null)}>
          <ConfidentialiteForm
            confidentialite={editing}
            onSaved={() => {
              setEditing(null);
              void refresh();
            }}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
