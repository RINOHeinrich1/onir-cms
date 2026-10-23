"use client";

import { useEffect, useState } from "react";

/**
 * Voile de chargement de la page (template visuel) :
 * affiché dès l'arrivée sur le lien, masqué dès que le template signale qu'il est
 * prêt (`data-onirtech-ready`). Couvre le téléchargement du bundle + l'init 3D.
 */
export function TemplateLoader() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const isReady = (): boolean => document.querySelector("[data-onirtech-ready]") !== null;
    if (isReady()) {
      setHidden(true);
      return;
    }
    const interval = window.setInterval(() => {
      if (isReady()) {
        window.clearInterval(interval);
        setHidden(true);
      }
    }, 200);
    const guard = window.setTimeout(() => {
      window.clearInterval(interval);
      setHidden(true);
    }, 9000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(guard);
    };
  }, []);

  if (hidden) return null;

  return (
    <div className="template-loader" aria-hidden="true">
      <div className="template-loader-page">
        <span className="template-loader-spinner" />
        <span>Chargement…</span>
      </div>
    </div>
  );
}
