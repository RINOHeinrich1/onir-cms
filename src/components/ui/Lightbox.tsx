"use client";

import { useEffect } from "react";

/** Image affichée en plein écran. */
export type LightboxImage = {
  url: string;
  libelle: string;
};

/**
 * Visionneuse plein écran partagée (chat, photothèque) : fond cliquable et
 * bouton de fermeture, ou fermeture au clavier (Échap).
 */
export function Lightbox({ image, onClose }: { image: LightboxImage; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Aperçu de l'image">
      {/* Fond cliquable = vrai bouton (accessible), derrière l'image. */}
      <button
        type="button"
        className="lightbox-backdrop"
        aria-label="Fermer l'aperçu"
        onClick={onClose}
      />
      <button type="button" className="lightbox-close" aria-label="Fermer" onClick={onClose}>
        ×
      </button>
      {/* biome-ignore lint/performance/noImgElement: aperçu plein écran */}
      <img className="lightbox-img" src={image.url} alt={image.libelle} />
    </div>
  );
}
