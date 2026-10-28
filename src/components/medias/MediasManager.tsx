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
import { LiensPanel } from "./LiensPanel";
import { MediaEditForm } from "./MediaEditForm";
import { PhotosPanel } from "./PhotosPanel";
import type { MediaDto, TypeMedia } from "./types";

/** Onglet Médias : deux sous-onglets — Photothèque et Liens (US-MEDIA-001). */
export function MediasManager({
  initialMedias,
  canWrite,
}: {
  initialMedias: MediaDto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [medias, setMedias] = useState<MediaDto[]>(initialMedias);
  const [vue, setVue] = useState<TypeMedia>("photo");
  const [editing, setEditing] = useState<MediaDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const creators = creatorOptions(medias);
  const showUnassigned = hasUnassignedCreator(medias);
  const visibleMedias = medias.filter((media) => matchesCreator(media, creatorFilter));

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/medias", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { medias: MediaDto[] };
        setMedias(json.medias);
      }
    } catch {
      setError("Impossible de recharger la liste");
    }
    router.refresh();
  };

  const remove = async (media: MediaDto): Promise<void> => {
    setError(null);
    if (!window.confirm(`Supprimer « ${media.libelle} » ?`)) return;
    try {
      const response = await fetch(`/api/medias/${media.id}`, { method: "DELETE" });
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

  const photos = visibleMedias.filter((media) => media.type === "photo");
  const liens = visibleMedias.filter((media) => media.type === "lien");

  return (
    <div className="medias-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <CreatorFilter
        options={creators}
        showUnassigned={showUnassigned}
        value={creatorFilter}
        onChange={setCreatorFilter}
      />

      <div className="subtabs" role="tablist" aria-label="Type de média">
        <button
          type="button"
          role="tab"
          aria-selected={vue === "photo"}
          className={`subtab ${vue === "photo" ? "active" : ""}`}
          onClick={() => setVue("photo")}
        >
          Photothèque ({photos.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={vue === "lien"}
          className={`subtab ${vue === "lien" ? "active" : ""}`}
          onClick={() => setVue("lien")}
        >
          Liens ({liens.length})
        </button>
      </div>

      {vue === "photo" ? (
        <PhotosPanel
          photos={photos}
          canWrite={canWrite}
          onChanged={() => void refresh()}
          onEdit={setEditing}
          onRemove={(media) => void remove(media)}
        />
      ) : (
        <LiensPanel
          liens={liens}
          canWrite={canWrite}
          onChanged={() => void refresh()}
          onEdit={setEditing}
          onRemove={(media) => void remove(media)}
        />
      )}

      {editing !== null ? (
        <Modal title={`Modifier « ${editing.libelle} »`} onClose={() => setEditing(null)}>
          <MediaEditForm
            media={editing}
            canWrite={canWrite}
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
