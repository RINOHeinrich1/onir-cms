"use client";

import { Modal } from "@/components/ui/Modal";
import type { ConfidentialiteDto } from "./types";

export function ConfidentialiteDetailModal({
  confidentialite,
  canWrite,
  onClose,
  onEdit,
}: {
  confidentialite: ConfidentialiteDto;
  canWrite: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal title={confidentialite.titre} onClose={onClose}>
      <div className="confidentialite-detail">
        <div className="confidentialite-card-badges">
          <span className={`badge ${confidentialite.actif ? "" : "muted"}`}>
            {confidentialite.actif ? "Active" : "Inactive"}
          </span>
          <span className="hint">Créé par {confidentialite.createdByLabel ?? "—"}</span>
        </div>

        <p className="confidentialite-detail-text">{confidentialite.texte}</p>

        {confidentialite.lien !== "" ? (
          <p className="confidentialite-detail-link">
            <a
              className="link"
              href={confidentialite.lien}
              target={confidentialite.lien.startsWith("http") ? "_blank" : undefined}
              rel={confidentialite.lien.startsWith("http") ? "noopener noreferrer" : undefined}
            >
              {confidentialite.lien}
            </a>
          </p>
        ) : null}
      </div>

      <div className="tools confidentialite-detail-actions">
        {canWrite ? (
          <button type="button" className="btn small" onClick={onEdit}>
            Modifier
          </button>
        ) : null}
        <button type="button" className="btn ghost small" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
