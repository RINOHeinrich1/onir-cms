"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
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
import { channelsForLink, chatLinkBlockReason } from "@/domain/entities/chat";
import { resolveActionMenuPlacement } from "./action-menu-placement";
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
  const previewSurface = channels.page.enabled || !channels.widget.enabled ? "page" : "widget";
  return previewSurface === "widget" && link.url !== null
    ? `${link.url.replace("/l/", "/embed/")}/preview`
    : `/liens/${link.id}/apercu?embed=1&surface=${previewSurface}`;
}

function displaySettingsHrefFor(link: ChatLinkRow): string {
  const channels = channelsForLink(link);
  const previewSurface = channels.page.enabled || !channels.widget.enabled ? "page" : "widget";
  return `/liens/${link.id}/apercu?surface=${previewSurface}`;
}

const DEFAULT_CHATBOT_PREVIEW = "/chatbot-default.webp";

function templatePreviewUrl(link: ChatLinkRow): string {
  if (link.visualTemplateId === null || link.visualTemplateVersion === null) {
    return DEFAULT_CHATBOT_PREVIEW;
  }
  return `/api/template-assets/${encodeURIComponent(link.visualTemplateId)}/${encodeURIComponent(link.visualTemplateVersion)}/preview.png`;
}

type ChatbotSection = "all" | "active" | "drafts";
type ChatbotTone = "success" | "warn" | "muted";

function isExpired(link: ChatLinkRow, nowIso: string): boolean {
  return (
    link.expiresAt !== null && new Date(link.expiresAt).getTime() <= new Date(nowIso).getTime()
  );
}

function linkStatus(link: ChatLinkRow, nowIso: string): { label: string; tone: ChatbotTone } {
  if (isExpired(link, nowIso)) return { label: "Expiré", tone: "warn" };
  if (chatLinkBlockReason(link) !== null) return { label: "Bloqué", tone: "warn" };
  if (link.actif) return { label: "Actif", tone: "success" };
  return { label: "Révoqué", tone: "muted" };
}

function linkSurfaceSummary(link: ChatLinkRow): string {
  const channels = channelsForLink(link);
  if (channels.page.enabled && channels.widget.enabled) return "Page publique + widget";
  if (channels.page.enabled) return "Page publique";
  if (channels.widget.enabled) return "Widget intégrable";
  return "Assistant IA";
}

function formatVisits(count: number): string {
  if (count < 1_000) return String(count);
  const thousands = count / 1_000;
  return `${thousands.toFixed(thousands >= 10 ? 0 : 1).replace(".0", "")}k`;
}

function draftStep(draft: ChatbotDraftRow): { current: number; total: number } {
  const rawStep = draft.state.step;
  const stepIndex = typeof rawStep === "number" ? Math.trunc(rawStep) : 0;
  return {
    current: Math.min(CHATBOT_STEPS.length, Math.max(1, stepIndex + 1)),
    total: CHATBOT_STEPS.length,
  };
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4.5 3v-3a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4.5 3v-3a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M8 10h8M8 13h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function RobotIllustration() {
  return (
    <svg className="chatbots-hero-art" viewBox="0 0 360 280" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="hero-bot-body" x1="135" y1="98" x2="250" y2="230">
          <stop stopColor="#0b725c" />
          <stop offset="1" stopColor="#023f33" />
        </linearGradient>
        <linearGradient id="hero-bot-screen" x1="150" y1="102" x2="225" y2="174">
          <stop stopColor="#0b4c41" />
          <stop offset="1" stopColor="#02251f" />
        </linearGradient>
        <linearGradient id="hero-bot-arm" x1="248" y1="168" x2="306" y2="196">
          <stop stopColor="#e9f6ef" />
          <stop offset="1" stopColor="#bfe4d5" />
        </linearGradient>
        <radialGradient
          id="hero-bot-glow"
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(192 144) rotate(90) scale(100)"
        >
          <stop stopColor="#7be0bc" stopOpacity="0.5" />
          <stop offset="1" stopColor="#7be0bc" stopOpacity="0" />
        </radialGradient>
        <filter id="hero-bot-shadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="14" stdDeviation="13" floodColor="#005943" floodOpacity="0.22" />
        </filter>
      </defs>
      <circle cx="197" cy="143" r="118" fill="url(#hero-bot-glow)" />
      <path
        d="M67 77c21-35 65-47 104-31 18-24 64-25 84 2 29-4 54 16 57 44 25 13 31 45 11 64 7 34-22 61-55 58-23 27-67 28-91 3-28 15-65 2-74-28-27-4-44-30-34-54-13-17-12-42-2-58Z"
        fill="#d4f0e2"
        opacity="0.72"
      />
      <g filter="url(#hero-bot-shadow)">
        <rect x="123" y="204" width="126" height="50" rx="24" fill="url(#hero-bot-body)" />
        <rect x="153" y="197" width="66" height="16" rx="8" fill="#bfe4d5" />
        <rect x="133" y="96" width="108" height="112" rx="36" fill="url(#hero-bot-body)" />
        <rect x="143" y="107" width="88" height="76" rx="27" fill="url(#hero-bot-screen)" />
        <rect x="151" y="116" width="72" height="50" rx="20" fill="#062f27" opacity="0.7" />
        <circle cx="174" cy="139" r="7" fill="#7be0bc" />
        <circle cx="207" cy="139" r="7" fill="#7be0bc" />
        <circle cx="176" cy="137" r="2.5" fill="#ffffff" />
        <circle cx="209" cy="137" r="2.5" fill="#ffffff" />
        <path d="M176 155c9 8 24 8 33 0" stroke="#7be0bc" strokeWidth="4" strokeLinecap="round" />
        <rect x="159" y="91" width="56" height="10" rx="5" fill="#e9f6ef" />
        <rect x="185" y="78" width="4" height="15" rx="2" fill="#e9f6ef" />
        <circle cx="188" cy="75" r="6" fill="#ffc46b" />
        <path
          d="M133 132c-18 0-28 12-28 28s10 28 28 28"
          stroke="#e9f6ef"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <path
          d="M241 132c18 0 28 12 28 28"
          stroke="url(#hero-bot-arm)"
          strokeWidth="18"
          strokeLinecap="round"
        />
        <circle cx="273" cy="174" r="17" fill="#e9f6ef" />
        <path
          d="M268 170v9M273 166v13M278 170v9"
          stroke="#0b725c"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g fill="#005943">
        <circle cx="74" cy="184" r="4" opacity="0.36" />
        <circle cx="91" cy="206" r="2.5" opacity="0.24" />
        <circle cx="304" cy="109" r="3.5" opacity="0.3" />
      </g>
      <g>
        <rect x="268" y="82" width="60" height="44" rx="14" fill="#fffdf6" opacity="0.96" />
        <circle cx="287" cy="104" r="4" fill="#004a38" />
        <circle cx="298" cy="104" r="4" fill="#004a38" opacity="0.72" />
        <circle cx="309" cy="104" r="4" fill="#004a38" opacity="0.42" />
      </g>
    </svg>
  );
}

/** Petit aperçu du template visuel associé au chatbot. */
function ChatbotTemplatePreview({
  url,
  name,
  fallback,
}: {
  url: string;
  name: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <div className="chatbot-card-preview chatbot-card-preview--fallback">{fallback}</div>;
  }
  return (
    <div className="chatbot-card-preview">
      <Image
        src={url}
        alt={`Aperçu du template ${name}`}
        fill
        unoptimized
        sizes="(max-width: 56rem) 100vw, 360px"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function placeActionMenu(details: HTMLDetailsElement): void {
  const summary = details.querySelector<HTMLElement>(":scope > summary");
  const panel = details.querySelector<HTMLElement>(".action-menu-panel");
  if (summary === null || panel === null) return;

  panel.style.removeProperty("--action-menu-max-height");
  const rect = summary.getBoundingClientRect();
  const { placement, maxHeight } = resolveActionMenuPlacement({
    top: rect.top,
    bottom: rect.bottom,
    panelHeight: panel.scrollHeight,
    viewportHeight: window.innerHeight,
  });

  details.dataset.placement = placement;
  panel.style.setProperty("--action-menu-max-height", `${maxHeight}px`);
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
    const repositionOpenMenus = (): void => {
      document
        .querySelectorAll<HTMLDetailsElement>("details.action-menu[open]")
        .forEach(placeActionMenu);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", repositionOpenMenus);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", repositionOpenMenus);
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
  const [section, setSection] = useState<ChatbotSection>("all");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPending, setBulkPending] = useState(false);
  const [selectedDraftIds, setSelectedDraftIds] = useState<string[]>([]);
  const [draftBulkPending, setDraftBulkPending] = useState(false);
  const creators = creatorOptions([...links, ...drafts]);
  const showUnassigned = hasUnassignedCreator([...links, ...drafts]);
  const query = search.trim().toLocaleLowerCase("fr");
  const matchesSearch = (values: readonly (string | null)[]): boolean =>
    query === "" || values.join(" ").toLocaleLowerCase("fr").includes(query);
  const filteredLinks = links.filter((link) => {
    if (!matchesCreator(link, creatorFilter)) return false;
    const provider = aiProviders.find((entry) => entry.id === link.aiProviderId)?.label ?? "";
    return matchesSearch([
      link.label,
      link.url,
      link.aiModel,
      provider,
      link.createdByLabel,
      linkSurfaceSummary(link),
    ]);
  });
  const filteredDrafts = drafts.filter((draft) => {
    if (!matchesCreator(draft, creatorFilter)) return false;
    return matchesSearch([draft.label, draft.createdByLabel]);
  });
  const activeLinks = filteredLinks.filter((link) => linkStatus(link, nowIso).tone === "success");
  const visibleLinks = section === "active" ? activeLinks : section === "all" ? filteredLinks : [];
  const visibleIds = visibleLinks.map((link) => link.id);
  const visibleSelection = selectionState(selectedIds, visibleIds);
  const pagination = usePagination(
    visibleLinks,
    9,
    `${section}|${search}|${creatorFilter.join(",")}`,
  );
  const visibleDrafts =
    section === "drafts" || (section === "all" && pagination.page === 1) ? filteredDrafts : [];
  const activeCount = links.filter((link) => linkStatus(link, nowIso).tone === "success").length;
  const allCount = links.length + drafts.length;
  const creatorFilterOptions = [
    ...creators.map((creator) => ({ value: creator.id, label: creator.label })),
    ...(showUnassigned ? [{ value: NO_CREATOR, label: "Non renseigné" }] : []),
  ];
  const changeSection = (next: ChatbotSection): void => {
    setSection(next);
    setSelectedIds([]);
    setSelectedDraftIds([]);
  };
  const toggleSelectionMode = (): void => {
    setSelectionMode((current) => {
      if (current) {
        setSelectedIds([]);
        setSelectedDraftIds([]);
      }
      return !current;
    });
  };

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

  const visibleDraftIds = visibleDrafts.map((draft) => draft.id);
  const draftSelection = selectionState(selectedDraftIds, visibleDraftIds);
  const selectableIds = section === "drafts" ? visibleDraftIds : visibleIds;
  const selectableState = section === "drafts" ? draftSelection : visibleSelection;

  const toggleDrafts = (): void => {
    setSelectedDraftIds((current) => toggleVisibleSelection(current, visibleDraftIds));
  };
  const toggleSelectable = (): void => {
    if (section === "drafts") {
      toggleDrafts();
      return;
    }
    setSelectedIds((current) => toggleVisibleSelection(current, visibleIds));
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
    <div className={`links-admin${selectionMode ? " is-selecting" : ""}`}>
      {error !== null ? <p className="alert error">{error}</p> : null}

      <section className="chatbots-hero" aria-labelledby="chatbots-title">
        <div className="chatbots-hero-copy">
          <span className="chatbots-hero-eyebrow">Espace chatbots</span>
          <h1 id="chatbots-title">Mes Chatbots</h1>
          <p>Créez, gérez et personnalisez vos assistants intelligents.</p>
          <a className="btn chatbots-hero-cta" href="/documentation">
            Découvrir ONIR-CMS <span aria-hidden="true">→</span>
          </a>
        </div>
        <RobotIllustration />
      </section>

      <div className="list-filters links-toolbar">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setSelectedIds([]);
            setSelectedDraftIds([]);
          }}
          placeholder="Rechercher un chatbot…"
          label="Rechercher un chatbot"
        />
        <FilterMenu
          label="Filtres"
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
            setSelectedDraftIds([]);
          }}
        />
        <button
          type="button"
          className="btn ghost small links-select-toggle"
          aria-pressed={selectionMode}
          onClick={toggleSelectionMode}
        >
          {selectionMode ? "Terminer" : "Sélectionner"}
        </button>
      </div>

      <div className="chatbot-tabs" role="tablist" aria-label="Filtrer les chatbots">
        {(
          [
            { id: "all", label: "Tous", count: allCount },
            { id: "active", label: "Actifs", count: activeCount },
            { id: "drafts", label: "Brouillons", count: drafts.length },
          ] satisfies { id: ChatbotSection; label: string; count: number }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={section === tab.id}
            className={`chatbot-tab${section === tab.id ? " is-active" : ""}`}
            onClick={() => changeSection(tab.id)}
          >
            <span className={`chatbot-tab-icon is-${tab.id}`} aria-hidden="true" />
            <span>{tab.label}</span>
            <span className="chatbot-tab-count">({tab.count})</span>
          </button>
        ))}
      </div>

      {selectionMode ? (
        <div className="links-selection-toolbar">
          <RoundCheckbox
            checked={selectableState === "all"}
            indeterminate={selectableState === "partial"}
            disabled={selectableIds.length === 0}
            onChange={toggleSelectable}
            ariaLabel={selectableState === "all" ? "Tout désélectionner" : "Tout sélectionner"}
          >
            {selectableState === "all" ? "Tout désélectionner" : "Tout sélectionner"}
            <span className="connaissance-select-count">({selectableIds.length})</span>
          </RoundCheckbox>
          <span className="hint">Sélectionnez les chatbots à supprimer.</span>
        </div>
      ) : null}

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

      {selectedDraftIds.length > 0 ? (
        <div className="links-bulk-bar" role="status">
          <strong>
            {selectedDraftIds.length} brouillon{selectedDraftIds.length > 1 ? "s" : ""} sélectionné
            {selectedDraftIds.length > 1 ? "s" : ""}
          </strong>
          <button
            type="button"
            className="btn danger small"
            disabled={draftBulkPending}
            onClick={() => void removeSelectedDrafts()}
          >
            {draftBulkPending ? "Suppression…" : "Supprimer la sélection"}
          </button>
        </div>
      ) : null}

      <div className={`chatbot-grid chatbot-grid--links${selectionMode ? " is-selecting" : ""}`}>
        {pagination.pageItems.map((link) => {
          const displaySettingsHref = displaySettingsHrefFor(link);
          const previewUrl = templatePreviewUrl(link);
          const widgetEnabled = channelsForLink(link).widget.enabled;
          const status = linkStatus(link, nowIso);
          const label = link.label === "" ? "Chatbot sans nom" : link.label;
          return (
            <article
              className={`chatbot-card chatbot-card--links${selectedIds.includes(link.id) ? " is-selected" : ""}`}
              key={link.id}
            >
              <div className="chatbot-card-media">
                <ChatbotTemplatePreview
                  url={previewUrl}
                  name={label}
                  fallback={
                    <span className="chatbot-card-fallback">
                      <ChatIcon />
                    </span>
                  }
                />
                {selectionMode ? (
                  <RoundCheckbox
                    className="chatbot-card-select chatbot-card-select--overlay"
                    checked={selectedIds.includes(link.id)}
                    onChange={(checked) =>
                      setSelectedIds((current) =>
                        checked
                          ? [...new Set([...current, link.id])]
                          : current.filter((id) => id !== link.id),
                      )
                    }
                    ariaLabel={`Sélectionner « ${label} »`}
                  />
                ) : (
                  <span className={`chatbot-status-pill is-${status.tone}`}>
                    <span className="chatbot-status-dot" aria-hidden="true" />
                    {status.label}
                  </span>
                )}
                <details
                  className="action-menu chatbot-card-menu"
                  onToggle={(event) => {
                    const details = event.currentTarget;
                    if (details.open) {
                      placeActionMenu(details);
                      return;
                    }
                    delete details.dataset.placement;
                    details
                      .querySelector<HTMLElement>(".action-menu-panel")
                      ?.style.removeProperty("--action-menu-max-height");
                  }}
                >
                  <summary className="chatbot-card-menu-trigger" aria-label="Autres actions">
                    ⋯
                  </summary>
                  <div className="action-menu-panel">
                    <a href={previewHrefFor(link)} target="_blank" rel="noopener noreferrer">
                      Aperçu
                    </a>
                    {link.url === null ? (
                      <button
                        type="button"
                        disabled={generatingId === link.id}
                        onClick={() => void doRegenerate(link)}
                      >
                        {generatingId === link.id ? "Génération…" : "Régénérer le lien"}
                      </button>
                    ) : (
                      <>
                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                          Ouvrir le chatbot
                        </a>
                        <button type="button" onClick={() => void doCopy(link)}>
                          Copier le lien
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => setDetailsLinkId(link.id)}>
                      Voir les détails
                    </button>
                    <a href={displaySettingsHref} target="_blank" rel="noopener noreferrer">
                      Paramètres d&apos;affichage
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
              </div>
              <div className="chatbot-card-body">
                <h2 title={label}>{label}</h2>
                <p className="chatbot-card-creator">
                  <svg
                    className="chatbot-card-creator-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M5.5 19c.8-3.1 3.2-4.8 6.5-4.8s5.7 1.7 6.5 4.8" />
                  </svg>
                  <strong>{link.createdByLabel ?? "Créateur non renseigné"}</strong>
                </p>
                <p className="chatbot-card-subtitle">
                  {link.description?.trim() || linkSurfaceSummary(link)}
                </p>
                <div className="chatbot-card-footer">
                  <span className="chatbot-card-visits">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 19V9M10 19V5M15 19v-7M20 19v-4" />
                    </svg>
                    {formatVisits(link.visitCount)} visite{link.visitCount > 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    className="btn small chatbot-card-manage"
                    onClick={() => router.push(`/liens/${link.id}/modifier`)}
                  >
                    Gérer <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {visibleDrafts.map((draft) => {
          const step = draftStep(draft);
          const label = draft.label.trim() === "" ? "Brouillon sans nom" : draft.label;
          return (
            <article
              className="chatbot-card chatbot-card--links chatbot-card--draft"
              key={draft.id}
            >
              <div className="chatbot-card-media chatbot-card-media--draft">
                <div className="chatbot-card-draft-art">
                  <ChatIcon />
                </div>
                {selectionMode ? (
                  <RoundCheckbox
                    className="chatbot-card-select chatbot-card-select--overlay"
                    checked={selectedDraftIds.includes(draft.id)}
                    onChange={(checked) =>
                      setSelectedDraftIds((current) =>
                        checked ? [...current, draft.id] : current.filter((id) => id !== draft.id),
                      )
                    }
                    ariaLabel={`Sélectionner « ${label} »`}
                  />
                ) : (
                  <span className="chatbot-status-pill is-muted">
                    <span className="chatbot-status-dot" aria-hidden="true" />
                    Brouillon
                  </span>
                )}
                <details
                  className="action-menu chatbot-card-menu"
                  onToggle={(event) => {
                    const details = event.currentTarget;
                    if (details.open) {
                      placeActionMenu(details);
                      return;
                    }
                    delete details.dataset.placement;
                    details
                      .querySelector<HTMLElement>(".action-menu-panel")
                      ?.style.removeProperty("--action-menu-max-height");
                  }}
                >
                  <summary className="chatbot-card-menu-trigger" aria-label="Autres actions">
                    ⋯
                  </summary>
                  <div className="action-menu-panel">
                    <button
                      type="button"
                      onClick={() => router.push(`/liens/brouillons/${draft.id}`)}
                    >
                      Reprendre
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void removeDraft(draft)}
                    >
                      Supprimer
                    </button>
                  </div>
                </details>
              </div>
              <div className="chatbot-card-body">
                <h2 title={label}>{label}</h2>
                <p className="chatbot-card-creator">
                  <svg
                    className="chatbot-card-creator-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="8" r="3.2" />
                    <path d="M5.5 19c.8-3.1 3.2-4.8 6.5-4.8s5.7 1.7 6.5 4.8" />
                  </svg>
                  <strong>{draft.createdByLabel ?? "Créateur non renseigné"}</strong>
                </p>
                <p className="chatbot-card-subtitle">
                  Création en cours · Étape {step.current} / {step.total}
                </p>
                <div className="chatbot-card-footer">
                  <span className="chatbot-card-visits">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="8" />
                      <path d="M12 8v4l2.5 1.5" />
                    </svg>
                    Dernière sauvegarde le {new Date(draft.updatedAt).toLocaleDateString("fr-FR")}
                  </span>
                  <button
                    type="button"
                    className="btn small chatbot-card-manage"
                    onClick={() => router.push(`/liens/brouillons/${draft.id}`)}
                  >
                    Reprendre <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}

        {visibleLinks.length === 0 &&
        visibleDrafts.length === 0 &&
        (links.length > 0 || drafts.length > 0) ? (
          <div className="empty-state">
            <strong>Aucun chatbot.</strong>
            <span>Aucun résultat pour ces filtres.</span>
          </div>
        ) : null}

        <button
          type="button"
          className="chatbot-card chatbot-card--links chatbot-card--new"
          onClick={() => setNewChatbotOpen(true)}
        >
          <span className="chatbot-new-icon" aria-hidden="true">
            +
          </span>
          <strong>Créer un nouveau chatbot</strong>
          <span className="chatbot-new-copy">Commencez dès maintenant votre assistant IA</span>
          <span className="btn small chatbot-new-cta">
            Créer un chatbot <span aria-hidden="true">→</span>
          </span>
        </button>
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
