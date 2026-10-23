"use client";

import { useState } from "react";
import { Lightbox, type LightboxImage } from "@/components/ui/Lightbox";
import { Modal } from "@/components/ui/Modal";
import { TemplateKeysBadges } from "@/components/ui/TemplateKeysBadges";
import { PhotoUploadForm } from "./PhotoUploadForm";
import type { MediaDto } from "./types";

/** Table de la photothèque (import, édition, suppression). */
export function PhotosPanel({
  photos,
  canWrite,
  onChanged,
  onEdit,
  onRemove,
}: {
  photos: MediaDto[];
  canWrite: boolean;
  onChanged: () => void;
  onEdit: (media: MediaDto) => void;
  onRemove: (media: MediaDto) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  return (
    <div>
      {canWrite ? (
        <div className="tools" style={{ marginBottom: "1.5rem" }}>
          <button type="button" className="btn small" onClick={() => setCreating(true)}>
            Importer une photo
          </button>
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Aperçu</th>
              <th>Libellé</th>
              <th>Portée</th>
              <th>Statut</th>
              <th>Créé par</th>
              {canWrite ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {photos.map((photo) => (
              <tr key={photo.id}>
                <td>
                  <button
                    type="button"
                    className="media-zoom"
                    onClick={() =>
                      setLightbox({
                        url: `/api/medias/${photo.id}/file`,
                        libelle: photo.libelle,
                      })
                    }
                    aria-label={`Agrandir : ${photo.libelle}`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: fichier servi par route (uuid) */}
                    <img
                      className="media-thumb"
                      src={`/api/medias/${photo.id}/file`}
                      alt={photo.libelle}
                      loading="lazy"
                    />
                  </button>
                </td>
                <td>
                  <strong>{photo.libelle}</strong>
                </td>
                <td>
                  <TemplateKeysBadges keys={photo.templateKeys} />
                </td>
                <td>
                  <span className={`badge ${photo.actif ? "" : "muted"}`}>
                    {photo.actif ? "active" : "inactive"}
                  </span>
                </td>
                <td>{photo.createdByLabel ?? <span className="muted-text">—</span>}</td>
                {canWrite ? (
                  <td>
                    <div className="tools">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => onEdit(photo)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => onRemove(photo)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
            {photos.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 6 : 5}>Aucune photo.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating ? (
        <Modal title="Importer une photo" onClose={() => setCreating(false)}>
          <PhotoUploadForm
            onSaved={() => {
              setCreating(false);
              onChanged();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      ) : null}

      {lightbox !== null ? <Lightbox image={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}
