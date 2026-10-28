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
        <table className="table">
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
                <td>
                  <strong>{lien.libelle}</strong>
                </td>
                <td className="cell-contacts">
                  <a
                    className="link"
                    href={lien.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {lien.url}
                  </a>
                </td>
                <td>
                  <ChatLinkBadges ids={lien.chatLinkIds} />
                </td>
                <td>
                  <span className={`badge ${lien.actif ? "" : "muted"}`}>
                    {lien.actif ? "active" : "inactive"}
                  </span>
                </td>
                <td>{lien.createdByLabel ?? <span className="muted-text">—</span>}</td>
                {canWrite ? (
                  <td>
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
