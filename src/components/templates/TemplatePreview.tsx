"use client";

import { useEffect, useState } from "react";
import { MarkdownReport } from "@/components/fiches/MarkdownReport";

/**
 * Prévisualisation d'un modèle : prompt final + fiche rendus avec des
 * données fictives (C013). Lecture seule.
 */
export function TemplatePreview({
  templateKey,
  onClose,
}: {
  templateKey: string;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/templates/${templateKey}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement impossible");
        const json = (await response.json()) as {
          versions: Array<{ definition: Record<string, unknown> }>;
        };
        const definition = json.versions[json.versions.length - 1]?.definition;
        if (definition === undefined) throw new Error("Version introuvable");
        const preview = await fetch(`/api/templates/${templateKey}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(definition),
        });
        const payload = (await preview.json()) as {
          preview?: { systemPrompt?: string; markdown?: string };
          error?: string;
        };
        if (!preview.ok || payload.preview === undefined) {
          throw new Error(payload.error ?? "Aperçu impossible");
        }
        setPrompt(payload.preview.systemPrompt ?? "");
        setMarkdown(payload.preview.markdown ?? "");
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Aperçu impossible");
      });
  }, [templateKey]);

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      <h3>Aperçu (données fictives)</h3>
      {error !== null ? <p className="alert error">{error}</p> : null}
      {error === null && prompt === null ? <p className="hint">Chargement…</p> : null}
      {prompt !== null ? (
        <>
          <h4>Prompt final</h4>
          <pre className="preview-block">{prompt}</pre>
        </>
      ) : null}
      {markdown !== null ? (
        <>
          <h4>Fiche reçue par l’équipe</h4>
          <div className="template-preview-document">
            <MarkdownReport markdown={markdown} />
          </div>
        </>
      ) : null}
      <div className="tools">
        <button type="button" className="btn ghost small" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
