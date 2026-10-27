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
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { channelsForLink } from "@/domain/entities/chat";
import { LinkEditModal } from "./LinkEditModal";
import { LinkForm } from "./LinkForm";
import type {
  AiProviderOption,
  ChatLinkRow,
  ConfidentialiteOption,
  ProspectOption,
  TemplateOption,
  VisualTemplateOption,
} from "./types";
import { WidgetCodeModal } from "./WidgetCodeModal";

/** Icône d'avertissement (liens expirés). */
function WarningIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="warn-icon"
    >
      <path
        d="M12 3 2 20h20L12 3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 9.5v4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="17.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

/** Icône de copie (presse-papiers). */
function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * URL affichée avec troncature médiane responsive : le début s'ellipse
 * (CSS) pendant que la fin reste visible, `title` garde l'URL complète.
 */
function LienUrl({ url }: { url: string }) {
  const tailLength = 12;
  const head = url.length > 40 ? url.slice(0, -tailLength) : url;
  const tail = url.length > 40 ? url.slice(-tailLength) : "";
  return (
    <span className="lien-url" title={url}>
      <span className="lien-head">{head}</span>
      {tail === "" ? null : (
        <>
          <span className="lien-ellipsis" aria-hidden="true">
            …
          </span>
          <span className="lien-tail">{tail}</span>
        </>
      )}
    </span>
  );
}

/** Table des liens de chat : création, URL copiable, édition, suppression (US-LIENS-001). */
export function LinksTable({
  initialLinks,
  prospects,
  templates,
  confidentialites,
  visualTemplates,
  aiProviders,
  canAssignAi,
  nowIso,
}: {
  initialLinks: ChatLinkRow[];
  prospects: ProspectOption[];
  templates: TemplateOption[];
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
  /** Instant de référence (calcul serveur) → rendu identique SSR/client. */
  nowIso: string;
}) {
  const router = useRouter();
  const [links, setLinks] = useState<ChatLinkRow[]>(initialLinks);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChatLinkRow | null>(null);
  const [widgetCode, setWidgetCode] = useState<{
    snippet: string;
    embedUrl: string;
  } | null>(null);
  const [loadingWidgetId, setLoadingWidgetId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string | null>(null);
  const creators = creatorOptions(links);
  const showUnassigned = hasUnassignedCreator(links);
  const visibleLinks = links.filter((link) => matchesCreator(link, creatorFilter));

  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch("/api/links", { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { links: ChatLinkRow[] };
        setLinks(json.links);
      }
    } catch {
      setError("Impossible de recharger la liste");
    }
    router.refresh();
  };

  const onEdited = (updated: ChatLinkRow): void => {
    setEditing(null);
    setLinks((previous) => previous.map((entry) => (entry.id === updated.id ? updated : entry)));
    router.refresh();
  };

  const openWidgetCode = async (link: ChatLinkRow): Promise<void> => {
    setError(null);
    setLoadingWidgetId(link.id);
    try {
      const response = await fetch(`/api/links/${link.id}/widget-code`, { cache: "no-store" });
      const json = (await response.json()) as {
        snippet?: string;
        embedUrl?: string;
        error?: string;
      };
      if (!response.ok || json.snippet === undefined || json.embedUrl === undefined) {
        setError(json.error ?? "Code widget indisponible");
        return;
      }
      setWidgetCode({ snippet: json.snippet, embedUrl: json.embedUrl });
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setLoadingWidgetId(null);
    }
  };

  const remove = async (link: ChatLinkRow): Promise<void> => {
    setError(null);
    if (!window.confirm("Supprimer ce lien et ses conversations ?")) return;
    try {
      const response = await fetch(`/api/links/${link.id}`, { method: "DELETE" });
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

  /** Copie l'URL complète dans le presse-papiers. */
  const doCopy = async (link: ChatLinkRow): Promise<void> => {
    if (link.url === null) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === link.id ? null : current));
      }, 2500);
    } catch {
      setError("Copie impossible, sélectionnez l'URL manuellement");
    }
  };

  /** Ligne legacy sans URL : génère (une fois) puis recharge la liste. */
  const doRegenerate = async (link: ChatLinkRow): Promise<void> => {
    setError(null);
    setGeneratingId(link.id);
    try {
      const response = await fetch(`/api/links/${link.id}/copy`, { method: "POST" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Génération impossible");
        return;
      }
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="links-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <CreatorFilter
        options={creators}
        showUnassigned={showUnassigned}
        value={creatorFilter}
        onChange={setCreatorFilter}
      />

      <div className="tools" style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="btn small" onClick={() => setCreating(true)}>
          Nouveau lien
        </button>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Statut</th>
              <th>Visites</th>
              <th>Label</th>
              <th>Modèle</th>
              <th>Moteur IA</th>
              <th>Lien</th>
              <th>Expiration</th>
              <th>Créé par</th>
              <th>Créé le</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {visibleLinks.map((link) => {
              const expired =
                link.expiresAt !== null &&
                new Date(link.expiresAt).getTime() <= new Date(nowIso).getTime();
              const channels = channelsForLink(link);
              const pageEnabled = channels.page.enabled;
              const widgetEnabled = channels.widget.enabled;
              const previewSurface = pageEnabled ? "page" : "widget";

              return (
                <tr key={link.id}>
                  <td>
                    <span className="badge">{link.type}</span>
                    <div className="channel-badges">
                      {pageEnabled ? <span className="badge muted">page</span> : null}
                      {widgetEnabled ? <span className="badge orange">widget</span> : null}
                    </div>
                    {pageEnabled && channels.page.identificationMode === "anonymous" ? (
                      <div className="muted-text">anonyme</div>
                    ) : null}
                  </td>
                  <td>
                    {expired ? (
                      <span className="badge warn statut-expire">
                        <WarningIcon />
                        expiré
                      </span>
                    ) : (
                      <span className={`badge ${link.actif ? "" : "muted"}`}>
                        {link.actif ? "actif" : "révoqué"}
                      </span>
                    )}
                  </td>
                  <td
                    title={
                      link.lastVisitAt === null
                        ? "Aucune visite comptée"
                        : `Dernière visite : ${new Date(link.lastVisitAt).toLocaleString("fr-FR")}`
                    }
                  >
                    <span className="lien-visits">
                      {link.visitCount}
                      <span>
                        {link.lastVisitAt === null
                          ? "—"
                          : new Date(link.lastVisitAt).toLocaleDateString("fr-FR")}
                      </span>
                    </span>
                  </td>
                  <td>{link.label === "" ? <span className="muted-text">—</span> : link.label}</td>
                  <td>
                    <span className="badge muted" title={link.templateKey}>
                      {templates.find((template) => template.key === link.templateKey)?.label ??
                        link.templateKey}
                    </span>
                  </td>
                  <td>
                    {link.aiProviderId === null ? (
                      <span className="badge muted">Défaut organisation</span>
                    ) : (
                      <span className="badge" title={link.aiModel ?? ""}>
                        {aiProviders.find((provider) => provider.id === link.aiProviderId)?.label ??
                          "Fournisseur indisponible"}
                        {link.aiModel === null ? "" : ` · ${link.aiModel}`}
                      </span>
                    )}
                  </td>
                  <td>
                    {!pageEnabled ? (
                      <span className="muted-text">
                        Page désactivée{widgetEnabled ? " · widget actif" : ""}
                      </span>
                    ) : link.url === null ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        disabled={generatingId === link.id}
                        onClick={() => void doRegenerate(link)}
                      >
                        {generatingId === link.id ? "…" : "Régénérer"}
                      </button>
                    ) : (
                      <span className="lien-cell">
                        <LienUrl url={link.url} />
                        <button
                          type="button"
                          className="copy-btn"
                          aria-label={copiedId === link.id ? "Copié !" : "Copier le lien"}
                          title={copiedId === link.id ? "Copié !" : "Copier le lien"}
                          onClick={() => void doCopy(link)}
                        >
                          {copiedId === link.id ? "Copié !" : <CopyIcon />}
                        </button>
                      </span>
                    )}
                  </td>
                  <td className={expired ? "cell-warn" : undefined}>
                    {link.expiresAt === null
                      ? "—"
                      : new Date(link.expiresAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td>{link.createdByLabel ?? <span className="muted-text">—</span>}</td>
                  <td>{new Date(link.createdAt).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <div className="tools">
                      <a
                        className="btn ghost small"
                        href={`/liens/${link.id}/apercu?surface=${previewSurface}`}
                      >
                        Aperçu
                      </a>
                      {widgetEnabled ? (
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={loadingWidgetId === link.id}
                          onClick={() => void openWidgetCode(link)}
                        >
                          {loadingWidgetId === link.id ? "…" : "Code widget"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setEditing(link)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="btn danger ghost small"
                        onClick={() => void remove(link)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visibleLinks.length === 0 ? (
              <tr>
                <td colSpan={11}>
                  {links.length === 0 ? "Aucun lien." : "Aucun lien pour ce créateur."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating ? (
        <Modal title="Nouveau lien de chat" onClose={() => setCreating(false)}>
          <LinkForm
            prospects={prospects}
            templates={templates}
            confidentialites={confidentialites}
            visualTemplates={visualTemplates}
            aiProviders={aiProviders}
            canAssignAi={canAssignAi}
            onCreated={(created) => {
              setCreating(false);
              if (created.widgetSnippet !== undefined && created.widgetEmbedUrl !== undefined) {
                setWidgetCode({
                  snippet: created.widgetSnippet,
                  embedUrl: created.widgetEmbedUrl,
                });
              }
              void refresh();
            }}
            onCancel={() => setCreating(false)}
          />
        </Modal>
      ) : null}

      {widgetCode !== null ? (
        <WidgetCodeModal
          snippet={widgetCode.snippet}
          embedUrl={widgetCode.embedUrl}
          onClose={() => setWidgetCode(null)}
        />
      ) : null}

      {editing !== null ? (
        <LinkEditModal
          confidentialites={confidentialites}
          visualTemplates={visualTemplates}
          aiProviders={aiProviders}
          canAssignAi={canAssignAi}
          link={editing}
          onSaved={(updated) => onEdited(updated)}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
