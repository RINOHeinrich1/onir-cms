"use client";

import { ChatLinkBadges } from "@/components/ui/ChatLinkBadges";
import { RoundCheckbox } from "@/components/ui/RoundCheckbox";
import type { ConnaissanceDto } from "./types";

/** Carte horizontale d'une connaissance : aperçu tronqué + actions. */
export function ConnaissanceCard({
  connaissance,
  canWrite,
  selected,
  onSelectionChange,
  onDetail,
  onEdit,
  onDelete,
}: {
  connaissance: ConnaissanceDto;
  canWrite: boolean;
  selected: boolean;
  onSelectionChange: (checked: boolean) => void;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className={`connaissance-card${selected ? " is-selected" : ""}`}>
      <div className="connaissance-card-select">
        <RoundCheckbox
          checked={selected}
          onChange={onSelectionChange}
          ariaLabel={`Sélectionner « ${connaissance.titre} »`}
        />
      </div>

      <div className="connaissance-card-body">
        <div className="connaissance-card-head">
          <h3>{connaissance.titre}</h3>
          <div className="connaissance-card-badges">
            <span className={`badge ${connaissance.actif ? "" : "muted"}`}>
              {connaissance.actif ? "Active" : "Inactive"}
            </span>
            <ChatLinkBadges ids={connaissance.chatLinkIds} />
          </div>
        </div>

        <p className="connaissance-card-excerpt">{connaissance.contenu}</p>

        <p className="connaissance-card-creator">
          Créé par {connaissance.createdByLabel ?? <span className="muted-text">—</span>}
        </p>
      </div>

      <div className="connaissance-card-actions">
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
