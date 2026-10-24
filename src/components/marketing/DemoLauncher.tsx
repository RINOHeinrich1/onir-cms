"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_EXPERIENCES } from "@/lib/demo-links";

/**
 * CTA « Démarrer la démo » : ouvre un choix entre l'expérience simplifiée
 * (chat par défaut, sans 3D) et l'expérience immersive (template 3D).
 */
export function DemoLauncher() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="site-button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Démarrer la démo
      </button>

      <dialog
        ref={dialogRef}
        className="site-demo-dialog"
        aria-labelledby="demo-dialog-title"
        onClose={() => setOpen(false)}
      >
        <div className="site-demo-panel">
          <div className="site-demo-head">
            <div>
              <p className="site-kicker">Démo</p>
              <h2 id="demo-dialog-title">Choisissez votre expérience.</h2>
            </div>
            <button
              type="button"
              className="site-demo-close"
              aria-label="Fermer le choix de démonstration"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </div>

          <p className="site-demo-intro">
            Deux façons de découvrir ONIR CMS avec les mêmes informations de base. Choisissez selon
            les capacités de votre appareil.
          </p>

          <div className="site-demo-grid">
            {DEMO_EXPERIENCES.map((experience) => (
              <a
                key={experience.id}
                href={experience.href}
                className={`site-demo-card site-demo-card-${experience.id}`}
              >
                <span className="site-demo-tag">{experience.tag}</span>
                <h3>{experience.title}</h3>
                <p>{experience.description}</p>
                <p className="site-demo-detail">{experience.detail}</p>
                <span className="site-demo-cta">Lancer la démo →</span>
              </a>
            ))}
          </div>

          <p className="site-demo-note">
            L’expérience immersive charge une scène 3D : privilégiez un appareil récent et une
            connexion stable. La démo ne remplace pas la documentation.
          </p>
        </div>
      </dialog>
    </>
  );
}
