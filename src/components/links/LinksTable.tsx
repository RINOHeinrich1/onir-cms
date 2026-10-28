"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import {
  creatorOptions,
  hasUnassignedCreator,
  matchesCreator,
  NO_CREATOR,
} from "@/components/ui/creator-options";
import { FilterMenu, type FilterMenuSection } from "@/components/ui/FilterMenu";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { usePagination } from "@/components/ui/use-pagination";
import { channelsForLink, chatLinkBlockReason, chatLinkQuota } from "@/domain/entities/chat";
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
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const creators = creatorOptions(links);
  const showUnassigned = hasUnassignedCreator(links);
  const query = search.trim().toLocaleLowerCase("fr");
  const visibleLinks = links
    .filter((link) => matchesCreator(link, creatorFilter))
    .filter((link) => {
      if (query === "") return true;
      const template =
        templates.find((entry) => entry.key === link.templateKey)?.label ?? link.templateKey;
      const provider = aiProviders.find((entry) => entry.id === link.aiProviderId)?.label ?? "";
      return [link.label, link.url ?? "", link.aiModel ?? "", template, provider]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query);
    });
  const pagination = usePagination(visibleLinks, 9, `${search}|${creatorFilter.join(",")}`);
  const creatorFilterOptions = [
    ...creators.map((creator) => ({ value: creator.id, label: creator.label })),
    ...(showUnassigned ? [{ value: NO_CREATOR, label: "Non renseigné" }] : []),
  ];

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
    if (!(await confirmDialog("Supprimer ce lien et ses conversations ?"))) return;
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

      <div className="list-filters">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un chatbot…"
          label="Rechercher un chatbot"
        />
        <FilterMenu
          sections={
            [
              {
                id: "createur",
                label: "Créateur",
                options: creatorFilterOptions,
                value: creatorFilter,
              },
            ] satisfies FilterMenuSection[]
          }
          onApply={(values) => setCreatorFilter(values.createur ?? [])}
        />
      </div>

      <div className="tools" style={{ marginBottom: "1.5rem" }}>
        <button type="button" className="btn small" onClick={() => setCreating(true)}>
          Nouveau chatbot
        </button>
      </div>

      <div className="chatbot-grid">
        {pagination.pageItems.map((link) => {
          const expired =
            link.expiresAt !== null &&
            new Date(link.expiresAt).getTime() <= new Date(nowIso).getTime();
          const blockReason = chatLinkBlockReason(link);
          const quota = chatLinkQuota(link);
          const channels = channelsForLink(link);
          const pageEnabled = channels.page.enabled;
          const widgetEnabled = channels.widget.enabled;
          const previewSurface = pageEnabled ? "page" : "widget";
          const fichePercent =
            quota.maxFiches === null
              ? 0
              : quota.maxFiches === 0
                ? 100
                : Math.min(100, (quota.fichesGenerated / quota.maxFiches) * 100);
          const tokenPercent =
            quota.maxTokens === null
              ? 0
              : quota.maxTokens === 0
                ? 100
                : Math.min(100, (quota.tokensUsed / quota.maxTokens) * 100);

          return (
            <article className="chatbot-card" key={link.id}>
              <header className="chatbot-card-head">
                <div>
                  <h2>{link.label === "" ? "Chatbot sans nom" : link.label}</h2>
                  <p>
                    {link.type === "standard" ? "Standard" : "Spécifique"} ·{" "}
                    {link.createdByLabel ?? "Créateur non renseigné"}
                  </p>
                </div>
                <div className="chatbot-status">
                  {expired ? (
                    <span className="badge warn">expiré</span>
                  ) : blockReason !== null ? (
                    <span className="badge warn">bloqué</span>
                  ) : (
                    <span className={`badge ${link.actif ? "success" : "muted"}`}>
                      {link.actif ? "actif" : "révoqué"}
                    </span>
                  )}
                </div>
              </header>

              <div className="chatbot-channels">
                {pageEnabled ? <span className="badge muted">page</span> : null}
                {widgetEnabled ? <span className="badge orange">widget</span> : null}
                {pageEnabled && channels.page.identificationMode === "anonymous" ? (
                  <span className="badge muted">anonyme</span>
                ) : null}
                {!pageEnabled ? <span className="badge muted">page désactivée</span> : null}
              </div>

              <dl className="chatbot-facts">
                <div>
                  <dt>Configuration</dt>
                  <dd>
                    {link.currentConfigId !== null && link.currentConfigId !== undefined
                      ? "Chatbot autonome"
                      : (templates.find((template) => template.key === link.templateKey)?.label ??
                        link.templateKey)}
                  </dd>
                </div>
                <div>
                  <dt>Moteur IA</dt>
                  <dd>
                    {link.aiProviderId === null
                      ? "Défaut organisation"
                      : (aiProviders.find((provider) => provider.id === link.aiProviderId)?.label ??
                        "Fournisseur indisponible")}
                    {link.aiModel === null ? "" : ` · ${link.aiModel}`}
                  </dd>
                </div>
                <div>
                  <dt>Expiration</dt>
                  <dd>
                    {link.expiresAt === null
                      ? "Aucune"
                      : new Date(link.expiresAt).toLocaleDateString("fr-FR")}
                  </dd>
                </div>
                <div>
                  <dt>Visites</dt>
                  <dd>
                    {link.visitCount}
                    {link.lastVisitAt === null
                      ? ""
                      : ` · ${new Date(link.lastVisitAt).toLocaleDateString("fr-FR")}`}
                  </dd>
                </div>
              </dl>

              <div className="chatbot-quotas">
                <div className="quota-line">
                  <span>
                    Fiches <strong>{quota.fichesGenerated}</strong>
                    {quota.maxFiches === null ? " / ∞" : ` / ${quota.maxFiches}`}
                  </span>
                  <span className="quota-bar" aria-hidden>
                    <span style={{ width: `${fichePercent}%` }} />
                  </span>
                </div>
                <div className="quota-line">
                  <span>
                    Tokens <strong>{quota.tokensUsed}</strong>
                    {quota.maxTokens === null ? " / ∞" : ` / ${quota.maxTokens}`}
                  </span>
                  <span className="quota-bar" aria-hidden>
                    <span style={{ width: `${tokenPercent}%` }} />
                  </span>
                </div>
              </div>

              <div className="chatbot-link-row">
                {!pageEnabled ? (
                  <span className="muted-text">
                    Page désactivée{widgetEnabled ? " · widget disponible" : ""}
                  </span>
                ) : link.url === null ? (
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={generatingId === link.id}
                    onClick={() => void doRegenerate(link)}
                  >
                    {generatingId === link.id ? "…" : "Régénérer le lien"}
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
              </div>

              <footer className="chatbot-card-actions">
                <a
                  className="btn ghost small"
                  href={`/liens/${link.id}/apercu?surface=${previewSurface}`}
                >
                  Aperçu
                </a>
                <details className="action-menu">
                  <summary className="btn ghost small" aria-label="Autres actions">
                    ⋯
                  </summary>
                  <div className="action-menu-panel">
                    {widgetEnabled ? (
                      <button
                        type="button"
                        disabled={loadingWidgetId === link.id}
                        onClick={() => void openWidgetCode(link)}
                      >
                        {loadingWidgetId === link.id ? "Chargement…" : "Code widget"}
                      </button>
                    ) : null}
                    <button type="button" onClick={() => setEditing(link)}>
                      Modifier
                    </button>
                    <button type="button" className="danger" onClick={() => void remove(link)}>
                      Supprimer
                    </button>
                  </div>
                </details>
              </footer>
            </article>
          );
        })}
        {visibleLinks.length === 0 ? (
          <div className="empty-state">
            <strong>Aucun chatbot.</strong>
            <span>Créez un lien pour commencer à recevoir des conversations.</span>
            {links.length > 0 ? <span>Aucun résultat pour ce créateur.</span> : null}
          </div>
        ) : null}
      </div>
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={pagination.setPage}
        label="Pagination des chatbots"
      />

      {creating ? (
        <Modal
          title="Nouveau chatbot"
          wide
          dialogClassName="chatbot-wizard-modal"
          bodyClassName="chatbot-wizard-host"
          overlayClassName="chatbot-wizard-overlay"
          onClose={() => setCreating(false)}
        >
          <LinkForm
            prospects={prospects}
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
