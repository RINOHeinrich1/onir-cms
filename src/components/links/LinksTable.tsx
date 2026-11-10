"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useChatbotBuilder } from "@/components/chatbot-builder/ChatbotBuilderProvider";
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
import { channelsForLink } from "@/domain/entities/chat";
import { ChatbotAnalysisModal } from "./ChatbotAnalysisModal";
import { CHATBOT_STEPS } from "./chatbot-steps";
import { NewChatbotChoiceModal } from "./NewChatbotChoiceModal";
import type { AiProviderOption, ChatbotDraftRow, ChatLinkRow } from "./types";
import { WidgetCodeModal } from "./WidgetCodeModal";

/** Lien vers la liste filtrée sur le libellé du chatbot, sans vue groupée. */
function chatbotContentHref(path: "/conversations" | "/leads", label: string): string {
  const params = new URLSearchParams();
  if (path === "/leads") params.set("onglet", "fiches");
  params.set("lien", label);
  params.set("grouper", "0");
  return `${path}?${params.toString()}`;
}

function previewHrefFor(link: ChatLinkRow): string {
  const channels = channelsForLink(link);
  const previewSurface = channels.page.enabled ? "page" : "widget";
  return previewSurface === "widget" && link.url !== null
    ? `${link.url.replace("/l/", "/embed/")}/preview`
    : `/liens/${link.id}/apercu?surface=${previewSurface}`;
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
  const { openBuilder } = useChatbotBuilder();
  const [newChatbotOpen, setNewChatbotOpen] = useState(false);
  const [links, setLinks] = useState<ChatLinkRow[]>(initialLinks);
  const [drafts, setDrafts] = useState<ChatbotDraftRow[]>(initialDrafts);

  useEffect(() => {
    setDrafts(initialDrafts);
    const ids = new Set(initialDrafts.map((draft) => draft.id));
    setSelectedDraftIds((current) => current.filter((id) => ids.has(id)));
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
  const [detailsLinkId, setDetailsLinkId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [creatorFilter, setCreatorFilter] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [draftBulkPending, setDraftBulkPending] = useState(false);
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

  const visibleDraftIds = drafts.map((draft) => draft.id);
  const draftSelection = selectionState(selectedDraftIds, visibleDraftIds);

  const toggleDrafts = (): void => {
    setSelectedDraftIds((current) => toggleVisibleSelection(current, visibleDraftIds));
  };

  const removeSelectedDrafts = async (): Promise<void> => {
    if (selectedDraftIds.length === 0 || draftBulkPending) return;
    const ids = [...selectedDraftIds];
    setError(null);
    if (
      !(await confirmDialog(
        `Supprimer ${ids.length} brouillon${ids.length > 1 ? "s" : ""} et leurs photos temporaires ?`,
        { title: "Supprimer la sélection", confirmLabel: "Supprimer", danger: true },
      ))
    ) {
      return;
    }

    setDraftBulkPending(true);
    const failed: string[] = [];
    try {
      for (const id of ids) {
        const response = await fetch(`/api/chatbot-drafts/${id}`, { method: "DELETE" });
        if (!response.ok) failed.push(id);
      }
      const failedSet = new Set(failed);
      setDrafts((previous) => previous.filter((draft) => failedSet.has(draft.id)));
      setSelectedDraftIds(failed);
      if (failed.length > 0) {
        setError("Certains brouillons n’ont pas pu être supprimés.");
      }
      router.refresh();
    } catch {
      setError("Erreur réseau pendant la suppression des brouillons");
    } finally {
      setDraftBulkPending(false);
    }
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
      setSelectedDraftIds((current) => current.filter((id) => id !== draft.id));
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
      toast.success("Lien copié.");
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
        <button type="button" className="btn small" onClick={() => setNewChatbotOpen(true)}>
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
          <div className="links-selection-toolbar chatbot-draft-toolbar">
            <RoundCheckbox
              checked={draftSelection === "all"}
              indeterminate={draftSelection === "partial"}
              onChange={toggleDrafts}
              ariaLabel={
                draftSelection === "all" ? "Tout désélectionner" : "Sélectionner les brouillons"
              }
            >
              {draftSelection === "all" ? "Tout désélectionner" : "Tout sélectionner"}
              <span className="connaissance-select-count">({drafts.length})</span>
            </RoundCheckbox>
            {selectedDraftIds.length > 0 ? (
              <button
                type="button"
                className="btn danger small"
                disabled={draftBulkPending}
                onClick={() => void removeSelectedDrafts()}
              >
                {draftBulkPending
                  ? "Suppression…"
                  : `Supprimer la sélection (${selectedDraftIds.length})`}
              </button>
            ) : null}
          </div>
          <div className="chatbot-grid">
            {drafts.map((draft) => {
              const rawStep = draft.state.step;
              const stepIndex = typeof rawStep === "number" ? Math.trunc(rawStep) : 0;
              const step = Math.min(CHATBOT_STEPS.length - 1, Math.max(0, stepIndex));
              return (
                <article className="chatbot-card" key={draft.id}>
                  <header className="chatbot-card-head">
                    <RoundCheckbox
                      className="chatbot-card-select"
                      checked={selectedDraftIds.includes(draft.id)}
                      onChange={(checked) =>
                        setSelectedDraftIds((current) =>
                          checked
                            ? [...current, draft.id]
                            : current.filter((id) => id !== draft.id),
                        )
                      }
                      ariaLabel={`Sélectionner ${draft.label.trim() === "" ? "le brouillon" : draft.label}`}
                    />
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

      <div className="chatbot-grid chatbot-grid--links">
        {pagination.pageItems.map((link) => {
          const previewHref = previewHrefFor(link);
          const widgetEnabled = channelsForLink(link).widget.enabled;
          const initial = (link.label.trim() || "?").slice(0, 1).toLocaleUpperCase("fr");
          return (
            <article
              className={`chatbot-card chatbot-card--links${selectedIds.includes(link.id) ? " is-selected" : ""}`}
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
                <div className="chatbot-card-identity">
                  <span className="chatbot-card-mark" aria-hidden="true">
                    {initial}
                  </span>
                  <div className="chatbot-card-copy">
                    <h2 title={link.label === "" ? "Chatbot sans nom" : link.label}>
                      {link.label === "" ? "Chatbot sans nom" : link.label}
                    </h2>
                  </div>
                </div>
                <details className="action-menu chatbot-card-menu">
                  <summary className="btn ghost small" aria-label="Autres actions">
                    ⋯
                  </summary>
                  <div className="action-menu-panel">
                    <button type="button" onClick={() => setDetailsLinkId(link.id)}>
                      Voir les détails
                    </button>
                    {link.url === null ? (
                      <button
                        type="button"
                        disabled={generatingId === link.id}
                        onClick={() => void doRegenerate(link)}
                      >
                        {generatingId === link.id ? "Génération…" : "Régénérer le lien"}
                      </button>
                    ) : (
                      <button type="button" onClick={() => void doCopy(link)}>
                        Copier le lien
                      </button>
                    )}
                    <a href={previewHref} target="_blank" rel="noopener noreferrer">
                      Aperçu
                    </a>
                    {widgetEnabled ? (
                      <button
                        type="button"
                        disabled={loadingWidgetId === link.id}
                        onClick={() => void openWidgetCode(link)}
                      >
                        {loadingWidgetId === link.id ? "Chargement…" : "Code widget"}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => router.push(chatbotContentHref("/conversations", link.label))}
                    >
                      Voir les conversations
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(chatbotContentHref("/leads", link.label))}
                    >
                      Voir les fiches associées
                    </button>
                    <button type="button" onClick={() => router.push(`/liens/${link.id}/modifier`)}>
                      Modifier
                    </button>
                    <button type="button" className="danger" onClick={() => void remove(link)}>
                      Supprimer
                    </button>
                  </div>
                </details>
              </header>
              <span className="chatbot-card-initial" aria-hidden="true">
                {initial}
              </span>
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

      {newChatbotOpen ? (
        <NewChatbotChoiceModal
          onClose={() => setNewChatbotOpen(false)}
          onAi={() => {
            setNewChatbotOpen(false);
            openBuilder();
          }}
          onManual={() => {
            setNewChatbotOpen(false);
            router.push("/liens/nouveau");
          }}
        />
      ) : null}
      {detailsLinkId !== null
        ? (() => {
            const detailsLink = links.find((link) => link.id === detailsLinkId);
            return detailsLink === undefined ? null : (
              <ChatbotAnalysisModal
                link={detailsLink}
                aiProviders={aiProviders}
                nowIso={nowIso}
                onClose={() => setDetailsLinkId(null)}
                onCopy={() => void doCopy(detailsLink)}
                onPreview={() =>
                  window.open(previewHrefFor(detailsLink), "_blank", "noopener,noreferrer")
                }
                onRegenerate={() => void doRegenerate(detailsLink)}
                onConversations={() =>
                  router.push(chatbotContentHref("/conversations", detailsLink.label))
                }
                onLeads={() => router.push(chatbotContentHref("/leads", detailsLink.label))}
                onEdit={() => router.push(`/liens/${detailsLink.id}/modifier`)}
              />
            );
          })()
        : null}
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
