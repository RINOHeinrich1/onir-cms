"use client";

import { useState } from "react";
import type { KnowledgeMergePolicy } from "@/application/ports/template-ai-repository";
import { Modal } from "@/components/ui/Modal";

export function KnowledgeMergeDialog({
  existingCount,
  onCancel,
  onChoose,
}: {
  existingCount: number;
  onCancel: () => void;
  onChoose: (policy: KnowledgeMergePolicy) => void;
}) {
  const [policy, setPolicy] = useState<KnowledgeMergePolicy>("append");

  return (
    <Modal title="Connaissances existantes" onClose={onCancel}>
      <p>
        Ce modèle possède <strong>{existingCount}</strong> connaissance(s) générée(s) par l'IA. Que
        souhaitez-vous faire avec les connaissances de ce brouillon ?
      </p>
      <label className="check">
        <input
          type="radio"
          name="knowledge-policy"
          checked={policy === "append"}
          onChange={() => setPolicy("append")}
        />{" "}
        Ajouter les nouvelles connaissances
      </label>
      <label className="check">
        <input
          type="radio"
          name="knowledge-policy"
          checked={policy === "replace"}
          onChange={() => setPolicy("replace")}
        />{" "}
        Remplacer les connaissances générées par l'IA pour ce modèle
      </label>
      <p className="hint">
        Les connaissances saisies manuellement, globales ou liées à d'autres modèles ne sont jamais
        supprimées. Le remplacement s'applique à tous les liens de ce modèle, y compris ceux qui
        utilisent une ancienne version.
      </p>
      <div className="tools">
        <button type="button" className="btn small" onClick={() => onChoose(policy)}>
          Enregistrer avec ce choix
        </button>
        <button type="button" className="btn ghost small" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </Modal>
  );
}
