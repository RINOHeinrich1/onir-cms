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
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { ConfidentialiteForm } from "./ConfidentialiteForm";
import type { ConfidentialiteDto } from "./types";

/**
 * Table des politiques de confidentialité : création, édition, suppression
 * et état (US-CONFID-001).
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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
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
      !window.confirm(`Supprimer « ${item.titre} » ? Les liens rattachés perdront leur politique.`)
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

      <CreatorFilter
        options={creators}
        showUnassigned={showUnassigned}
        value={creatorFilter}
        onChange={setCreatorFilter}
      />

      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouvelle politique
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Titre</th>
              <th>Consentement</th>
              <th>Lien</th>
              <th>Statut</th>
              <th>Créé par</th>
              {canWrite ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.titre}</strong>
                </td>
                <td className="cell-contacts">{item.texte}</td>
                <td>
                  {item.lien === "" ? (
                    <span className="muted-text">—</span>
                  ) : (
                    <span className="badge muted" title={item.lien}>
                      {item.lien}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge ${item.actif ? "" : "muted"}`}>
                    {item.actif ? "active" : "inactive"}
                  </span>
                </td>
                <td>{item.createdByLabel ?? <span className="muted-text">—</span>}</td>
                {canWrite ? (
                  <td>
                    <div className="tools">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setEditing(item)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => void remove(item)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {visibleItems.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5}>
                  {items.length === 0
                    ? "Aucune politique de confidentialité."
                    : "Aucune politique pour ce créateur."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
