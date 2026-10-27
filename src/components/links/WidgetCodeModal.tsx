"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

/**
 * Code d'intégration du widget (ADR-0040). Le snippet est généré par le cœur :
 * il ne contient que le jeton et la position, jamais le code du template.
 */
export function WidgetCodeModal({
  snippet,
  embedUrl,
  onClose,
}: {
  snippet: string;
  embedUrl: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Le textarea reste sélectionnable manuellement.
    }
  };

  return (
    <Modal title="Code d'intégration du widget" onClose={onClose}>
      <p className="hint">
        Collez ce code dans le site ou la plateforme qui doit afficher le chatbot. Le widget
        apparaîtra en bas à droite ou à gauche selon la position choisie.
      </p>
      <label className="field">
        Code à copier
        <textarea
          readOnly
          rows={8}
          value={snippet}
          onFocus={(event) => event.currentTarget.select()}
          style={{ fontFamily: "monospace", fontSize: "0.78rem" }}
        />
      </label>
      <p className="alert warn">
        En copiant ce code et en l&apos;intégrant sur un site tiers, vous assumez l&apos;entière
        responsabilité de cette intégration, notamment en matière de confidentialité et de
        protection des données. ONIR CMS est un logiciel open source MIT : chaque propriétaire
        d&apos;instance est responsable de ses propres traitements.
      </p>
      <div className="tools" style={{ marginTop: "1rem" }}>
        <button type="button" className="btn small" onClick={() => void copy()}>
          {copied ? "Copié !" : "Copier le code"}
        </button>
        <a className="btn ghost small" href={embedUrl} target="_blank" rel="noopener noreferrer">
          Ouvrir le widget
        </a>
        <button type="button" className="btn ghost small" onClick={onClose}>
          Fermer
        </button>
      </div>
    </Modal>
  );
}
