"use client";

import type { ConfidentialiteDto } from "./types";

export function ConfidentialiteCard({
  confidentialite,
  canWrite,
  onDetail,
  onEdit,
  onDelete,
}: {
  confidentialite: ConfidentialiteDto;
  canWrite: boolean;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="confidentialite-card">
      <div className="confidentialite-card-body">
        <div className="confidentialite-card-head">
          <h3 title={confidentialite.titre}>{confidentialite.titre}</h3>
          <div className="confidentialite-card-badges">
            <span className={`badge ${confidentialite.actif ? "" : "muted"}`}>
              {confidentialite.actif ? "Active" : "Inactive"}
            </span>
            {confidentialite.lien !== "" ? (
              <a
                className="badge muted confidentialite-card-link"
                href={confidentialite.lien}
                target={confidentialite.lien.startsWith("http") ? "_blank" : undefined}
                rel={confidentialite.lien.startsWith("http") ? "noopener noreferrer" : undefined}
                title={confidentialite.lien}
              >
                {confidentialite.lien}
              </a>
            ) : null}
          </div>
        </div>

        <p className="confidentialite-card-excerpt" title={confidentialite.texte}>
          {confidentialite.texte}
        </p>

        <p className="confidentialite-card-creator">
          Créé par {confidentialite.createdByLabel ?? <span className="muted-text">—</span>}
        </p>
      </div>

      <div className="confidentialite-card-actions">
        <button type="button" className="btn ghost small" onClick={onDetail}>
          Détail
        </button>
        {canWrite ? (
          <>
            <button type="button" className="btn ghost small" onClick={onEdit}>
              Modifier
            </button>
            <button type="button" className="btn danger ghost small" onClick={onDelete}>
              Supprimer
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}
