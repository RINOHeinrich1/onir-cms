"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  pruneSelection,
  selectionState,
  toggleVisibleSelection,
} from "@/components/connaissances/connaissance-selection";
import { confirmDialog } from "@/components/ui/confirm";
import {
  creatorOptions,
  hasUnassignedCreator,
  matchesCreator,
  NO_CREATOR,
} from "@/components/ui/creator-options";
import { FilterMenu, type FilterMenuSection } from "@/components/ui/FilterMenu";
import { Pagination } from "@/components/ui/Pagination";
import { RoundCheckbox } from "@/components/ui/RoundCheckbox";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import { usePagination } from "@/components/ui/use-pagination";
import { channelsForLink, chatLinkBlockReason, chatLinkQuota } from "@/domain/entities/chat";
import { CHATBOT_STEPS } from "./chatbot-steps";
import type { AiProviderOption, ChatbotDraftRow, ChatLinkRow } from "./types";
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
  initialDrafts,
  aiProviders,
  nowIso,
}: {
  initialLinks: ChatLinkRow[];
  initialDrafts: ChatbotDraftRow[];
  aiProviders: AiProviderOption[];
  /** Instant de référence (calcul serveur) → rendu identique SSR/client. */
  nowIso: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [links, setLinks] = useState<ChatLinkRow[]>(initialLinks);
  const [drafts, setDrafts] = useState<ChatbotDraftRow[]>(initialDrafts);

  useEffect(() => {
    setDrafts(initialDrafts);
  }, [initialDrafts]);

  useEffect(() => {
    const closeMenus = (): void => {
      document
        .querySelectorAll<HTMLDetailsElement>("details.action-menu[open]")
        .forEach((details) => {
          details.open = false;
        });
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Node)) return;
      document
        .querySelectorAll<HTMLDetailsElement>("details.action-menu[open]")
        .forEach((details) => {
          if (!details.contains(event.target as Node)) details.open = false;
        });
    };
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".action-menu-panel") !== null) closeMenus();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeMenus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const creators = creatorOptions(links);
  const showUnassigned = hasUnassignedCreator(links);
  const query = search.trim().toLocaleLowerCase("fr");
  const visibleLinks = links
    .filter((link) => matchesCreator(link, creatorFilter))
    .filter((link) => {
      if (query === "") return true;
      const provider = aiProviders.find((entry) => entry.id === link.aiProviderId)?.label ?? "";
      return [link.label, link.url ?? "", link.aiModel ?? "", provider]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query);
    });
  const visibleIds = visibleLinks.map((link) => link.id);
  const visibleSelection = selectionState(selectedIds, visibleIds);
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
        setSelectedIds((current) =>
          pruneSelection(
            current,
            json.links.map((link) => link.id),
          ),
        );
      }
    } catch {
      setError("Impossible de recharger la liste");
    }
    router.refresh();
  };

  const removeDraft = async (draft: ChatbotDraftRow): Promise<void> => {
    setError(null);
    if (!(await confirmDialog("Supprimer ce brouillon et ses photos temporaires ?"))) return;
    try {
      const response = await fetch(`/api/chatbot-drafts/${draft.id}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Suppression du brouillon impossible");
        return;
      }
      setDrafts((previous) => previous.filter((entry) => entry.id !== draft.id));
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
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
      setSelectedIds((current) => current.filter((id) => id !== link.id));
      toast.success("Chatbot supprimé.");
      await refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    }
  };

  const removeSelection = async (): Promise<void> => {
    if (selectedIds.length === 0 || bulkPending) return;
    const ids = [...selectedIds];
    setError(null);
    if (
      !(await confirmDialog(
        `Supprimer ${ids.length} chatbot${ids.length > 1 ? "s" : ""} et toutes leurs conversations ? Cette action est irréversible.`,
        {
          title: "Supprimer la sélection",
          confirmLabel: "Supprimer",
          danger: true,
        },
      ))
    ) {
      return;
    }

    setBulkPending(true);
    try {
      const response = await fetch("/api/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = (await response.json()) as {
        error?: string;
        deleted?: number;
        missing?: number;
      };
      if (!response.ok) {
        setError(json.error ?? "Suppression impossible");
        return;
      }

      const deleted = json.deleted ?? 0;
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      await refresh();

      if (deleted === 0) {
        setError("Aucun chatbot supprimé");
        return;
      }
      if ((json.missing ?? 0) > 0) {
        toast.warning(
          `${deleted} chatbot${deleted > 1 ? "s" : ""} supprimé${deleted > 1 ? "s" : ""}, ${json.missing} introuvable${(json.missing ?? 0) > 1 ? "s" : ""}.`,
        );
        return;
      }
      toast.success(
        `${deleted} chatbot${deleted > 1 ? "s" : ""} supprimé${deleted > 1 ? "s" : ""}.`,
      );
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setBulkPending(false);
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
          onChange={(value) => {
            setSearch(value);
            setSelectedIds([]);
          }}
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
          onApply={(values) => {
            setCreatorFilter(values.createur ?? []);
            setSelectedIds([]);
          }}
        />
      </div>

      <div className="links-selection-toolbar">
        <RoundCheckbox
          checked={visibleSelection === "all"}
          indeterminate={visibleSelection === "partial"}
          disabled={visibleIds.length === 0}
          onChange={() => setSelectedIds((current) => toggleVisibleSelection(current, visibleIds))}
          ariaLabel={visibleSelection === "all" ? "Tout désélectionner" : "Tout sélectionner"}
        >
          {visibleSelection === "all" ? "Tout désélectionner" : "Tout sélectionner"}
          <span className="connaissance-select-count">({visibleIds.length})</span>
        </RoundCheckbox>
        <button type="button" className="btn small" onClick={() => router.push("/liens/nouveau")}>
          Nouveau chatbot
        </button>
      </div>

      {selectedIds.length > 0 ? (
        <div className="links-bulk-bar" role="status">
          <strong>
            {selectedIds.length} chatbot{selectedIds.length > 1 ? "s" : ""} sélectionné
            {selectedIds.length > 1 ? "s" : ""}
          </strong>
          <button
            type="button"
            className="btn danger small"
            disabled={bulkPending}
            onClick={() => void removeSelection()}
          >
            {bulkPending ? "Suppression…" : "Supprimer la sélection"}
          </button>
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <section className="chatbot-drafts" aria-label="Brouillons de chatbot">
          <div className="chatbot-step-head">
            <h2>Brouillons</h2>
            <p className="hint">
              Reprenez une création interrompue ou supprimez-la. Un brouillon n’est pas un chatbot
              actif : il n’a ni URL publique ni conversation.
            </p>
          </div>
          <div className="chatbot-grid">
            {drafts.map((draft) => {
              const rawStep = draft.state.step;
              const stepIndex = typeof rawStep === "number" ? Math.trunc(rawStep) : 0;
              const step = Math.min(CHATBOT_STEPS.length - 1, Math.max(0, stepIndex));
              return (
                <article className="chatbot-card" key={draft.id}>
                  <header className="chatbot-card-head">
                    <div>
                      <h2>{draft.label.trim() === "" ? "Brouillon sans nom" : draft.label}</h2>
                      <p>{draft.createdByLabel ?? "Créateur non renseigné"}</p>
                    </div>
                    <div className="chatbot-status">
                      <span className="badge warn">Brouillon</span>
                    </div>
                  </header>
                  <dl className="chatbot-facts">
                    <div>
                      <dt>Étape</dt>
                      <dd>
                        {step + 1} / {CHATBOT_STEPS.length}
                      </dd>
                    </div>
                    <div>
                      <dt>Dernière sauvegarde</dt>
                      <dd>{new Date(draft.updatedAt).toLocaleDateString("fr-FR")}</dd>
                    </div>
                  </dl>
                  <footer className="chatbot-card-actions">
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => router.push(`/liens/brouillons/${draft.id}`)}
                    >
                      Reprendre
                    </button>
                    <button
                      type="button"
                      className="btn danger ghost small"
                      onClick={() => void removeDraft(draft)}
                    >
                      Supprimer
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

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
          const previewHref =
            previewSurface === "widget" && link.url !== null
              ? `${link.url.replace("/l/", "/embed/")}/preview`
              : `/liens/${link.id}/apercu?surface=${previewSurface}`;
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
            <article
              className={`chatbot-card${selectedIds.includes(link.id) ? " is-selected" : ""}`}
              key={link.id}
            >
              <header className="chatbot-card-head">
                <RoundCheckbox
                  className="chatbot-card-select"
                  checked={selectedIds.includes(link.id)}
                  onChange={(checked) =>
                    setSelectedIds((current) =>
                      checked
                        ? [...new Set([...current, link.id])]
                        : current.filter((id) => id !== link.id),
                    )
                  }
                  ariaLabel={`Sélectionner « ${link.label === "" ? "Chatbot sans nom" : link.label} »`}
                />
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
                      : "Non configuré"}
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
                  href={previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
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
                    <button type="button" onClick={() => router.push(`/liens/${link.id}/modifier`)}>
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
            {links.length > 0 ? <span>Aucun résultat pour ces filtres.</span> : null}
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

      {widgetCode !== null ? (
        <WidgetCodeModal
          snippet={widgetCode.snippet}
          embedUrl={widgetCode.embedUrl}
          onClose={() => setWidgetCode(null)}
        />
      ) : null}
    </div>
  );
}
