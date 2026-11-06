"use client";

import type { ConnaissanceConflict } from "@/application/use-cases/connaissances/resolve-connaissance-conflicts";
import { Modal } from "@/components/ui/Modal";

export type ConnaissanceConflictAction = "update" | "keep";

export function ConnaissanceConflictModal({
  conflicts,
  onResolve,
  onClose,
}: {
  conflicts: readonly ConnaissanceConflict[];
  onResolve: (action: ConnaissanceConflictAction) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Connaissances déjà existantes"
      onClose={onClose}
      dialogClassName="connaissance-conflict-modal"
      bodyClassName="connaissance-conflict-body"
    >
      <p className="connaissance-conflict-intro">
        {conflicts.length} connaissance{conflicts.length > 1 ? "s" : ""} du brouillon
        {conflicts.length > 1 ? " ont" : " a"} déjà un titre utilisé dans votre organisation.
      </p>

      <ul className="connaissance-conflict-list">
        {conflicts.map((conflict) => (
          <li key={conflict.existingId} className="connaissance-conflict-item">
            <strong>{conflict.titre}</strong>
            <p>{conflict.existingContenuPreview}</p>
            <div className="connaissance-conflict-impact">
              <span>Chatbots qui utilisent déjà cette connaissance</span>
              {conflict.affectedChatbots.length === 0 ? (
                <em>Aucun chatbot existant actuellement.</em>
              ) : (
                <ul>
                  {conflict.affectedChatbots.map((chatbot) => (
                    <li key={chatbot.id}>{chatbot.label}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="connaissance-conflict-actions">
        <button type="button" className="btn" onClick={() => onResolve("update")}>
          Mettre à jour les connaissances
        </button>
        <button type="button" className="btn subtle" onClick={() => onResolve("keep")}>
          Garder les anciennes
        </button>
      </div>
      <p className="connaissance-conflict-note">
        « Mettre à jour » remplace le contenu des connaissances existantes et peut modifier les
        réponses des chatbots listés. « Garder les anciennes » n’ajoute pas les doublons et ne
        modifie aucun contenu.
      </p>
    </Modal>
  );
}
