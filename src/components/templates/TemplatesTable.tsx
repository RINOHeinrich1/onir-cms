"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreatorFilter } from "@/components/ui/CreatorFilter";
import {
  creatorOptions,
  hasUnassignedCreator,
  matchesCreator,
} from "@/components/ui/creator-options";
import { Modal } from "@/components/ui/Modal";
import { toTemplateKey, uniqueTemplateKey } from "@/domain/template-defaults";
import { TemplateForm } from "./TemplateForm";
import { TemplatePreview } from "./TemplatePreview";
import type { TemplateSeed, TemplateSummary } from "./types";

/** Table des modèles + création/édition/suppression + prévisualisation. */
export function TemplatesTable({
  initialTemplates,
  canWrite,
}: {
  initialTemplates: TemplateSummary[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateSummary[]>(initialTemplates);
  const [creating, setCreating] = useState(false);
  const [seed, setSeed] = useState<TemplateSeed | null>(null);
  const [duplicatingKey, setDuplicatingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
  const creators = creatorOptions(templates);
  const showUnassigned = hasUnassignedCreator(templates);
  const visibleTemplates = templates.filter((template) => matchesCreator(template, creatorFilter));

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/templates", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { templates: TemplateSummary[] };
        setTemplates(json.templates);
      }
    } catch {
      setError("Impossible de recharger la liste");
    }
    router.refresh();
  };

  const startFrom = async (template: TemplateSummary): Promise<void> => {
    setError(null);
    setDuplicatingKey(template.key);
    try {
      const response = await fetch(`/api/templates/${template.key}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Chargement impossible");
      const json = (await response.json()) as {
        versions: Array<{ definition: Record<string, unknown> }>;
      };
      const definition = json.versions[json.versions.length - 1]?.definition;
      if (definition === undefined) throw new Error("Version introuvable");
      const keys = templates.map((entry) => entry.key);
      const label = `${template.label} (copie)`;
      setSeed({
        key: uniqueTemplateKey(toTemplateKey(`${template.key}-copie`), keys),
        label,
        description: template.description,
        definition,
      });
      setCreating(true);
      setEditingKey(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Duplication impossible");
    } finally {
      setDuplicatingKey(null);
    }
  };

  const remove = async (template: TemplateSummary): Promise<void> => {
    setError(null);
    if (!window.confirm(`Supprimer le modèle « ${template.label} » ?`)) return;
    try {
      const response = await fetch(`/api/templates/${template.key}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression impossible");
        return;
      }
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  return (
    <div className="templates-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <CreatorFilter
        options={creators}
        showUnassigned={showUnassigned}
        value={creatorFilter}
        onChange={setCreatorFilter}
      />

      {canWrite ? (
        <div className="template-starters">
          <div className="tools" style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setSeed(null);
                setCreating(true);
                setEditingKey(null);
              }}
            >
              Nouveau modèle
            </button>
          </div>
          {templates.length > 0 ? (
            <>
              <p className="hint">Partir d’un modèle existant :</p>
              <div className="template-starter-grid">
                {templates.map((template) => (
                  <button
                    type="button"
                    className="template-starter"
                    key={template.key}
                    disabled={duplicatingKey !== null}
                    onClick={() => void startFrom(template)}
                  >
                    <strong>{template.label}</strong>
                    <span>{template.description || template.key}</span>
                    <span className="hint">
                      {duplicatingKey === template.key ? "Chargement…" : "Dupliquer"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Clé</th>
              <th>Description</th>
              <th>Créé par</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visibleTemplates.map((template) => (
              <tr key={template.key}>
                <td>
                  <strong>{template.label}</strong>
                </td>
                <td>
                  <code>{template.key}</code>
                </td>
                <td>{template.description}</td>
                <td>{template.createdByLabel ?? <span className="muted-text">—</span>}</td>
                <td>
                  <div className="tools">
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => setPreviewingKey(template.key)}
                    >
                      Aperçu
                    </button>
                    {canWrite ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={duplicatingKey !== null}
                        onClick={() => void startFrom(template)}
                      >
                        Dupliquer
                      </button>
                    ) : null}
                    {canWrite ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setEditingKey(template.key)}
                      >
                        Modifier
                      </button>
                    ) : null}
                    {canWrite ? (
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => void remove(template)}
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {visibleTemplates.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  {templates.length === 0 ? "Aucun modèle." : "Aucun modèle pour ce créateur."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating || editingKey !== null ? (
        <Modal
          wide
          title={
            editingKey !== null
              ? "Nouvelle version (snapshot immuable)"
              : seed !== null
                ? "Dupliquer un modèle"
                : "Créer un modèle"
          }
          onClose={() => {
            setCreating(false);
            setEditingKey(null);
            setSeed(null);
          }}
        >
          <TemplateForm
            templateKey={editingKey}
            seed={seed}
            existingKeys={templates.map((template) => template.key)}
            onSaved={() => {
              setCreating(false);
              setEditingKey(null);
              setSeed(null);
              void refresh();
            }}
            onCancel={() => {
              setCreating(false);
              setEditingKey(null);
              setSeed(null);
            }}
          />
        </Modal>
      ) : null}

      {previewingKey !== null ? (
        <TemplatePreview templateKey={previewingKey} onClose={() => setPreviewingKey(null)} />
      ) : null}
    </div>
  );
}
