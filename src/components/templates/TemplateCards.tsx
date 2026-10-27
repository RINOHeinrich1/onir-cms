"use client";

import type { TemplateSummary } from "./types";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}

export function TemplateCards({
  templates,
  canWrite,
  duplicatingKey,
  onPreview,
  onDuplicate,
  onEdit,
  onRemove,
}: {
  templates: TemplateSummary[];
  canWrite: boolean;
  duplicatingKey: string | null;
  onPreview: (template: TemplateSummary) => void;
  onDuplicate: (template: TemplateSummary) => void;
  onEdit: (template: TemplateSummary) => void;
  onRemove: (template: TemplateSummary) => void;
}) {
  return (
    <div className="modeles-grid">
      {templates.map((template) => (
        <article className="modeles-card card" key={template.key}>
          <div className="modeles-card-head">
            <span className="modeles-card-mark" aria-hidden="true">
              {initials(template.label)}
            </span>
            <div className="modeles-card-title">
              <h2>{template.label}</h2>
              <code>{template.key}</code>
            </div>
          </div>

          <p className="modeles-card-desc">
            {template.description.trim() === ""
              ? "Aucune description fournie."
              : template.description}
          </p>

          <dl className="modeles-card-meta">
            <div>
              <dt>Créé par</dt>
              <dd>{template.createdByLabel ?? "Non renseigné"}</dd>
            </div>
            <div>
              <dt>Mis à jour le</dt>
              <dd>{formatDate(template.updatedAt)}</dd>
            </div>
          </dl>

          <div className="modeles-card-actions">
            <button type="button" className="btn ghost small" onClick={() => onPreview(template)}>
              Aperçu
            </button>
            {canWrite ? (
              <button
                type="button"
                className="btn ghost small"
                disabled={duplicatingKey !== null}
                onClick={() => onDuplicate(template)}
              >
                {duplicatingKey === template.key ? "Chargement…" : "Dupliquer"}
              </button>
            ) : null}
            {canWrite ? (
              <button type="button" className="btn ghost small" onClick={() => onEdit(template)}>
                Modifier
              </button>
            ) : null}
            {canWrite ? (
              <button
                type="button"
                className="btn danger ghost small"
                onClick={() => onRemove(template)}
              >
                Supprimer
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
