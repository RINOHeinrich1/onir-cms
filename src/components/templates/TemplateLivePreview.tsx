"use client";

import { useState } from "react";
import { MarkdownReport } from "@/components/fiches/MarkdownReport";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { buildSampleData, buildTemplatePreview } from "@/domain/template-preview";

type PreviewTab = "fiche" | "prompt";

/**
 * Aperçu live d'un brouillon de modèle : fiche reçue par l'équipe et prompt
 * final. Les données sont fictives et dérivées des champs (ou de leur exemple).
 */
export function TemplateLivePreview({
  definition,
  ready,
}: {
  definition: TemplateDefinition;
  ready: boolean;
}) {
  const [tab, setTab] = useState<PreviewTab>("fiche");

  if (!ready) {
    return (
      <aside className="template-preview-sticky">
        <h4>Aperçu live</h4>
        <p className="hint">
          Renseignez le nom du modèle et au moins une information à collecter pour voir la fiche et
          le prompt générés.
        </p>
      </aside>
    );
  }

  const preview = buildTemplatePreview({
    definition,
    sampleData: buildSampleData(definition.fields),
  });

  return (
    <aside className="template-preview-sticky">
      <div className="tools" style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          className={tab === "fiche" ? "btn small" : "btn ghost small"}
          aria-pressed={tab === "fiche"}
          onClick={() => setTab("fiche")}
        >
          Fiche reçue
        </button>
        <button
          type="button"
          className={tab === "prompt" ? "btn small" : "btn ghost small"}
          aria-pressed={tab === "prompt"}
          onClick={() => setTab("prompt")}
        >
          Prompt final
        </button>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Aperçu avec des données d’exemple.
      </p>
      {tab === "fiche" ? (
        <div className="template-preview-document">
          <MarkdownReport markdown={preview.markdown} />
        </div>
      ) : (
        <pre className="preview-block">{preview.systemPrompt}</pre>
      )}
    </aside>
  );
}
