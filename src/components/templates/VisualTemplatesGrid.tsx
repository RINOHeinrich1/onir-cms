"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { VisualTemplate } from "@/application/ports/visual-template-repository";
import { Modal } from "@/components/ui/Modal";
import { TemplateCover } from "./TemplateCover";
import { modeLabel, trustLabel } from "./template-labels";

type TemplateCard = VisualTemplate & {
  versionCount: number;
  latest: { version: string; mode: string; trustLevel: string } | null;
};

function trustBadgeClass(trustLevel: string): string {
  return trustLevel === "community" ? "badge muted" : "badge";
}

export function VisualTemplatesGrid({
  initialTemplates,
  canWrite,
}: {
  initialTemplates: TemplateCard[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const openImport = (): void => {
    setFormError(null);
    setImporting(true);
  };

  const closeImport = (): void => {
    if (pending) return;
    setImporting(false);
    setFichier(null);
    setFormError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  };

  const onSubmit = async (): Promise<void> => {
    if (fichier === null) {
      setFormError("Choisissez une archive .onirtech-template");
      return;
    }
    const form = new FormData();
    form.set("fichier", fichier);
    setPending(true);
    setFormError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/visual-templates/import", { method: "POST", body: form });
      const json = (await response.json()) as { version?: { version: string }; error?: string };
      if (!response.ok) {
        setFormError(json.error ?? "Import impossible");
        return;
      }
      setMessage(`Template importé : ${json.version?.version ?? "ok"}`);
      setImporting(false);
      setFichier(null);
      if (inputRef.current !== null) inputRef.current.value = "";
      router.refresh();
    } catch {
      setFormError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="visual-templates-admin">
      {message !== null ? <p className="alert ok">{message}</p> : null}

      <div className="templates-toolbar">
        <span className="templates-count">
          {initialTemplates.length} template{initialTemplates.length > 1 ? "s" : ""} installé
          {initialTemplates.length > 1 ? "s" : ""}
        </span>
        {canWrite ? (
          <button type="button" className="btn small" onClick={openImport}>
            Importer un template
          </button>
        ) : null}
      </div>

      {initialTemplates.length === 0 ? (
        <section className="card">
          <h2 className="text-title" style={{ fontSize: "1.1rem" }}>
            Aucun template installé
          </h2>
          <p className="hint">Importez une archive pour commencer.</p>
        </section>
      ) : (
        <div className="templates-grid">
          {initialTemplates.map((template) => {
            const last = template.latest;
            return (
              <Link
                key={template.id}
                className="template-card card"
                href={`/templates-visuels/${template.id}`}
              >
                <TemplateCover
                  templateId={template.id}
                  version={last?.version ?? null}
                  name={template.name}
                />
                <div className="template-card-body">
                  <div className="template-card-head">
                    <h2>{template.name}</h2>
                    {last !== null ? (
                      <span className={trustBadgeClass(last.trustLevel)}>
                        {trustLabel(last.trustLevel)}
                      </span>
                    ) : null}
                  </div>
                  <p className="template-card-key">
                    {template.key}
                    {template.author.trim() === "" ? "" : ` · ${template.author}`}
                  </p>
                  <p className="template-card-desc">
                    {template.description.trim() === ""
                      ? "Aucune description fournie."
                      : template.description}
                  </p>
                  <div className="template-card-meta">
                    <span>
                      {template.versionCount} version
                      {template.versionCount > 1 ? "s" : ""}
                    </span>
                    {last !== null ? (
                      <>
                        <span>Dernière importée : {last.version}</span>
                        <span className="badge muted">{modeLabel(last.mode)}</span>
                      </>
                    ) : null}
                  </div>
                  <span className="template-card-cta">Ouvrir</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {importing ? (
        <Modal title="Importer un template" onClose={closeImport}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            {formError !== null ? <p className="alert error">{formError}</p> : null}
            <label className="field">
              Archive <code>.onirtech-template</code> (ZIP : manifeste + assets)
              <input
                ref={inputRef}
                type="file"
                accept=".onirtech-template,application/zip"
                onChange={(event) => setFichier(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className="hint">
              Le manifeste détermine le template ciblé. Si la clé existe déjà, une nouvelle version
              est ajoutée.
            </p>
            <div className="tools" style={{ marginTop: "1.25rem" }}>
              <button type="submit" className="btn small" disabled={pending}>
                {pending ? "Import…" : "Importer"}
              </button>
              <button
                type="button"
                className="btn ghost small"
                disabled={pending}
                onClick={closeImport}
              >
                Annuler
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
