"use client";

import { ChatLinkBadges } from "@/components/ui/ChatLinkBadges";
import { Modal } from "@/components/ui/Modal";
import type { ConnaissanceDto } from "./types";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("fr-FR");
}

/** Consultation complète d'une connaissance, avec contenu scrollable. */
export function ConnaissanceDetailModal({
  connaissance,
  canEdit,
  onClose,
  onEdit,
}: {
  connaissance: ConnaissanceDto;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal title={connaissance.titre} onClose={onClose}>
      <dl className="kv connaissance-detail-meta">
        <dt>Statut</dt>
        <dd>
          <span className={`badge ${connaissance.actif ? "" : "muted"}`}>
            {connaissance.actif ? "Active" : "Inactive"}
          </span>
        </dd>
        <dt>Portée</dt>
        <dd>
          <ChatLinkBadges ids={connaissance.chatLinkIds} />
        </dd>
        <dt>Créé par</dt>
        <dd>{connaissance.createdByLabel ?? <span className="muted-text">—</span>}</dd>
        <dt>Dernière mise à jour</dt>
        <dd>{formatDate(connaissance.updatedAt)}</dd>
      </dl>

      <section className="connaissance-detail-section">
        <h4>Contenu</h4>
        <section
          className="connaissance-detail-content"
          aria-label="Contenu complet de la connaissance"
        >
          {connaissance.contenu}
        </section>
      </section>

      <div className="connaissance-detail-actions">
        <button type="button" className="btn ghost small" onClick={onClose}>
          Fermer
        </button>
        {canEdit ? (
          <button type="button" className="btn small" onClick={onEdit}>
            Modifier
          </button>
        ) : null}
      </div>
    </Modal>
  );
}
