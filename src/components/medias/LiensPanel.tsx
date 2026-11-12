"use client";

import { useState } from "react";
import { ChatLinkBadges } from "@/components/ui/ChatLinkBadges";
import { Modal } from "@/components/ui/Modal";
import { LienForm } from "./LienForm";
import type { MediaDto } from "./types";

/** Table des liens média (création, édition, suppression). */
export function LiensPanel({
  liens,
  canWrite,
  onChanged,
  onEdit,
  onRemove,
}: {
  liens: MediaDto[];
  canWrite: boolean;
  onChanged: () => void;
  onEdit: (media: MediaDto) => void;
  onRemove: (media: MediaDto) => void;
}) {
  const [creating, setCreating] = useState(false);

  return (
    <div>
      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Nouveau lien
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table table-cards">
          <thead>
            <tr>
              <th>Libellé</th>
              <th>URL</th>
              <th>Portée</th>
              <th>Statut</th>
              <th>Créé par</th>
              {canWrite ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {liens.map((lien) => (
              <tr key={lien.id}>
                <td data-label="Libellé">
                  <strong>{lien.libelle}</strong>
                </td>
                <td data-label="URL" className="cell-contacts">
                  <a
                    className="link"
                    href={lien.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {lien.url}
                  </a>
                </td>
                <td data-label="Portée">
                  <ChatLinkBadges ids={lien.chatLinkIds} />
                </td>
                <td data-label="Statut">
                  <span className={`badge ${lien.actif ? "" : "muted"}`}>
                    {lien.actif ? "active" : "inactive"}
                  </span>
                </td>
                <td data-label="Créé par">
                  {lien.createdByLabel ?? <span className="muted-text">—</span>}
                </td>
                {canWrite ? (
                  <td data-label="Actions" className="cell-actions">
                    <div className="tools">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => onEdit(lien)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => onRemove(lien)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {liens.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5}>Aucun lien.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating ? (
        <Modal title="Nouveau lien" onClose={() => setCreating(false)}>
          <LienForm
            onSaved={() => {
              setCreating(false);
              onChanged();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
