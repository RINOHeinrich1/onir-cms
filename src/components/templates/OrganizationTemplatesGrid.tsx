"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { VisualTemplate } from "@/application/ports/visual-template-repository";
import { Modal } from "@/components/ui/Modal";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { TemplateCover } from "./TemplateCover";
import { modeLabel, trustLabel } from "./template-labels";

export type OrganizationTemplateCard = VisualTemplate & {
  versionCount: number;
  latest: { version: string; mode: string; trustLevel: string } | null;
};

type CatalogProps = {
  installed: OrganizationTemplateCard[];
  available: OrganizationTemplateCard[];
  owned: OrganizationTemplateCard[];
  ownedCount: number;
  ownerLimit: number;
  canManage: boolean;
};

function TemplateCard({
  template,
  action,
}: {
  template: OrganizationTemplateCard;
  action?: { label: string; onClick: () => void; danger?: boolean; pending?: boolean } | undefined;
}) {
  const last = template.latest;
  return (
    <article className="template-card card">
      <Link className="template-card-link" href={`/templates-visuels/${template.id}`}>
        <TemplateCover
          templateId={template.id}
          version={last?.version ?? null}
          name={template.name}
        />
        <div className="template-card-body">
          <div className="template-card-head">
            <h2>{template.name}</h2>
            <span className="template-badges">
              {template.ownerOrganizationId !== null ? (
                <span className="badge muted">Organisation</span>
              ) : null}
              {template.disabledAt !== null ? (
                <span className="badge orange">Désactivé</span>
              ) : null}
              {last !== null ? (
                <span className={last.trustLevel === "community" ? "badge muted" : "badge"}>
                  {trustLabel(last.trustLevel)}
                </span>
              ) : null}
            </span>
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
        </div>
      </Link>
      {action === undefined ? null : (
        <div className="template-card-actions">
          <button
            type="button"
            className={`btn small ${action.danger === true ? "danger ghost" : ""}`}
            onClick={action.onClick}
            disabled={action.pending === true}
          >
            {action.pending === true ? "Traitement…" : action.label}
          </button>
        </div>
      )}
    </article>
  );
}

export function OrganizationTemplatesGrid({
  installed,
  available,
  owned,
  ownedCount,
  ownerLimit,
  canManage,
}: CatalogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [fichier, setFichier] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useToastOnMessage(error, message);

  const installedIds = new Set(installed.map((template) => template.id));
  const importBlocked = ownedCount >= ownerLimit;

  const closeImport = (): void => {
    if (pending) return;
    setImporting(false);
    setFichier(null);
    setError(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  };

  const onSubmit = async (): Promise<void> => {
    if (fichier === null) {
      setError("Choisissez une archive .onirtech-template");
      return;
    }
    const form = new FormData();
    form.set("fichier", fichier);
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/organization/visual-templates/import", {
        method: "POST",
        body: form,
      });
      const json = (await response.json()) as { error?: string; version?: { version: string } };
      if (!response.ok) {
        setError(json.error ?? "Import impossible");
        return;
      }
      setMessage(`Template importé : ${json.version?.version ?? "ok"}`);
      setImporting(false);
      setFichier(null);
      if (inputRef.current !== null) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(false);
    }
  };

  const act = async (
    template: OrganizationTemplateCard,
    method: "PUT" | "DELETE",
  ): Promise<void> => {
    setPendingId(template.id);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/organization/visual-templates/${template.id}`, {
        method,
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Action impossible");
        return;
      }
      setMessage(
        method === "PUT"
          ? `Template installé : ${template.name}`
          : `Template désinstallé : ${template.name}`,
      );
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div>
      <div className="templates-toolbar">
        <span className="templates-count">
          Mes templates : {ownedCount} / {ownerLimit}
        </span>
        {canManage ? (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              setError(null);
              setImporting(true);
            }}
            disabled={importBlocked}
            title={importBlocked ? "Limite de templates propriétaires atteinte" : undefined}
          >
            Importer un template
          </button>
        ) : null}
      </div>

      <section className="template-section">
        <div className="template-section-head">
          <h2>Installés</h2>
          <span className="badge muted">{installed.length}</span>
        </div>
        {installed.length === 0 ? (
          <p className="hint">Aucun template installé dans cette organisation.</p>
        ) : (
          <div className="templates-grid">
            {installed.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                action={
                  canManage
                    ? {
                        label: "Désinstaller",
                        danger: true,
                        pending: pendingId === template.id,
                        onClick: () => void act(template, "DELETE"),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="template-section">
        <div className="template-section-head">
          <h2>Catalogue plateforme</h2>
          <span className="badge muted">{available.length}</span>
        </div>
        {available.length === 0 ? (
          <p className="hint">Tous les templates plateforme sont installés.</p>
        ) : (
          <div className="templates-grid">
            {available.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                action={
                  canManage
                    ? {
                        label: "Installer",
                        pending: pendingId === template.id,
                        onClick: () => void act(template, "PUT"),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="template-section">
        <div className="template-section-head">
          <h2>Mes templates</h2>
          <span className="badge muted">
            {ownedCount} / {ownerLimit}
          </span>
        </div>
        {owned.length === 0 ? (
          <p className="hint">
            Aucun template propriétaire. Importez une archive pour personnaliser votre interface.
          </p>
        ) : (
          <div className="templates-grid">
            {owned.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                action={
                  canManage
                    ? installedIds.has(template.id)
                      ? {
                          label: "Désinstaller",
                          danger: true,
                          pending: pendingId === template.id,
                          onClick: () => void act(template, "DELETE"),
                        }
                      : {
                          label: "Installer",
                          pending: pendingId === template.id,
                          onClick: () => void act(template, "PUT"),
                        }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </section>

      {importing ? (
        <Modal title="Importer un template" onClose={closeImport}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void onSubmit();
            }}
          >
            {error !== null ? <p className="alert error">{error}</p> : null}
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
              Vous êtes responsable du template importé. Il sera exécuté dans une iframe isolée. Si
              la clé existe déjà dans votre organisation, une nouvelle version sera ajoutée.
            </p>
            <p className="hint">
              Templates propriétaires : {ownedCount} / {ownerLimit}. Les templates plateforme ne
              comptent pas dans cette limite.
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
