"use client";

import Link from "next/link";
import { useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FilterMenu, type FilterMenuSection } from "@/components/ui/FilterMenu";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { usePagination } from "@/components/ui/use-pagination";
import { ConversationActionsMenu } from "./ConversationActionsMenu";
import type { ConversationRowDto } from "./types";

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function since(iso: string, nowIso: string): string {
  const date = new Date(iso).getTime();
  const now = new Date(nowIso).getTime();
  if (Number.isNaN(date) || Number.isNaN(now)) return "";
  const minutes = Math.floor(Math.max(0, now - date) / 60_000);
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

function mergeById(left: ConversationRowDto[], right: ConversationRowDto[]): ConversationRowDto[] {
  const byId = new Map(left.map((conversation) => [conversation.id, conversation]));
  for (const conversation of right) byId.set(conversation.id, conversation);
  return [...byId.values()].sort((a, b) =>
    (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt),
  );
}

/** Inbox desktop/mobile : liste persistante à gauche, conversation à droite. */
export function ConversationsWorkspace({
  children,
  linkLabels,
  canWrite,
  canGenerateFiche,
  canViewLeads,
  canViewProspects,
}: {
  children: ReactNode;
  linkLabels: string[];
  canWrite: boolean;
  canGenerateFiche: boolean;
  canViewLeads: boolean;
  canViewProspects: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = useSelectedLayoutSegment();
  const legacyFiltre = searchParams.get("filtre");
  const explicit = searchParams.has("statut") || searchParams.has("archive");
  const statuses = explicit
    ? searchParams.getAll("statut").filter(Boolean)
    : legacyFiltre === "en_cours" || legacyFiltre === "finalisees"
      ? [legacyFiltre]
      : legacyFiltre === "toutes" || legacyFiltre === "archivees"
        ? []
        : ["en_cours"];
  const archives = explicit
    ? searchParams.getAll("archive").filter(Boolean)
    : legacyFiltre === "archivees"
      ? ["archivees"]
      : ["actives"];
  const liens = searchParams.getAll("lien");
  const lienKey = liens.join("\u0000");
  const [conversations, setConversations] = useState<ConversationRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [activeResponse, archivedResponse] = await Promise.all([
        fetch("/api/conversations?filtre=toutes", { cache: "no-store" }),
        fetch("/api/conversations?filtre=archivees", { cache: "no-store" }),
      ]);
      const activeJson = (await activeResponse.json()) as {
        conversations?: ConversationRowDto[];
        error?: string;
      };
      const archivedJson = (await archivedResponse.json()) as {
        conversations?: ConversationRowDto[];
        error?: string;
      };
      if (
        !activeResponse.ok ||
        !archivedResponse.ok ||
        activeJson.conversations === undefined ||
        archivedJson.conversations === undefined
      ) {
        setError(
          activeJson.error ?? archivedJson.error ?? "Impossible de charger les conversations",
        );
        return;
      }
      setConversations(mergeById(activeJson.conversations, archivedJson.conversations));
    } catch {
      setError("Impossible de charger les conversations");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const query = search.trim().toLocaleLowerCase("fr");
  const filtered = (conversations ?? []).filter((conversation) => {
    if (statuses.length > 0 && !statuses.includes(conversation.statut)) return false;
    if (
      archives.length > 0 &&
      !(
        (archives.includes("actives") && !conversation.archivee) ||
        (archives.includes("archivees") && conversation.archivee)
      )
    ) {
      return false;
    }
    if (liens.length > 0 && !liens.includes(conversation.linkLabel)) return false;
    if (query === "") return true;
    return [
      conversation.visitorNom,
      conversation.visitorEmail,
      conversation.linkLabel,
      conversation.assignedOperatorName ?? "",
      conversation.lastOperatorName ?? "",
    ]
      .join(" ")
      .toLocaleLowerCase("fr")
      .includes(query);
  });
  const pagination = usePagination(
    filtered,
    15,
    `${search}|${statuses.join(",")}|${archives.join(",")}|${lienKey}`,
  );
  const nowIso = new Date().toISOString();

  const filterParams = (values: {
    statut: readonly string[];
    archive: readonly string[];
    lien: readonly string[];
  }): URLSearchParams => {
    const params = new URLSearchParams();
    if (values.statut.length === 0) params.append("statut", "");
    for (const value of values.statut) params.append("statut", value);
    if (values.archive.length === 0) params.append("archive", "");
    for (const value of values.archive) params.append("archive", value);
    for (const value of values.lien) params.append("lien", value);
    return params;
  };

  const currentPath = (): string =>
    selectedId === null ? "/conversations" : `/conversations/${selectedId}`;

  const applyFilters = (values: Record<string, string[]>): void => {
    const params = filterParams({
      statut: values.statut ?? [],
      archive: values.archive ?? [],
      lien: values.lien ?? [],
    });
    router.push(`${currentPath()}?${params.toString()}`, { scroll: false });
  };

  const detailHref = (id: string): string =>
    `/conversations/${id}?${filterParams({ statut: statuses, archive: archives, lien: liens }).toString()}`;

  const filterSections: FilterMenuSection[] = [
    {
      id: "statut",
      label: "Statut",
      options: [
        { value: "en_cours", label: "En cours" },
        { value: "finalisees", label: "Finalisées" },
      ],
      value: statuses,
    },
    {
      id: "archive",
      label: "Archivage",
      options: [
        { value: "actives", label: "Actives" },
        { value: "archivees", label: "Archivées" },
      ],
      value: archives,
    },
    {
      id: "lien",
      label: "Chatbot",
      options: [...new Set([...linkLabels, ...liens])].map((label) => ({
        value: label,
        label: label === "" ? "Chatbot sans nom" : label,
      })),
      value: liens,
    },
  ];

  return (
    <div className={`conversations-workspace ${selectedId === null ? "" : "is-detail"}`}>
      <aside className="inbox-sidebar" aria-label="Liste des conversations">
        <div className="inbox-sidebar-head">
          <div>
            <span className="eyebrow">Prospection</span>
            <h1 className="inbox-title">Conversations</h1>
          </div>
          <span className="inbox-count">{filtered.length} discussion(s)</span>
        </div>

        <div className="inbox-filters">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un visiteur, un email…"
            label="Rechercher une conversation"
          />
          <FilterMenu sections={filterSections} onApply={applyFilters} />
        </div>

        {error !== null ? <p className="alert error">{error}</p> : null}

        <div className="inbox-list" aria-busy={conversations === null}>
          {conversations === null ? (
            <>
              <div className="skeleton inbox-skeleton" />
              <div className="skeleton inbox-skeleton" />
              <div className="skeleton inbox-skeleton" />
            </>
          ) : filtered.length === 0 ? (
            <div className="empty-state inbox-empty">
              <strong>
                {conversations.length === 0 ? "Aucune conversation." : "Aucun résultat."}
              </strong>
              <span>
                {conversations.length === 0
                  ? "Les nouvelles discussions apparaîtront ici."
                  : "Modifiez la recherche ou les filtres."}
              </span>
            </div>
          ) : (
            pagination.pageItems.map((conversation) => {
              const reference = conversation.lastMessageAt ?? conversation.createdAt;
              const displayName =
                conversation.visitorNom ||
                (conversation.visitorEmail === "" ? "Anonyme" : "Visiteur");
              const prospectHref =
                canViewProspects && conversation.prospectId !== null
                  ? `/prospects?prospect=${conversation.prospectId}`
                  : null;
              return (
                <div className="inbox-row-wrap" key={conversation.id}>
                  <Link
                    href={detailHref(conversation.id)}
                    className={`inbox-row ${selectedId === conversation.id ? "is-selected" : ""}`}
                    aria-current={selectedId === conversation.id ? "page" : undefined}
                  >
                    <span className="inbox-avatar" aria-hidden>
                      {initials(displayName) || "?"}
                    </span>
                    <span className="inbox-row-body">
                      <span className="inbox-row-top">
                        <strong>{displayName}</strong>
                        <time dateTime={reference}>{since(reference, nowIso)}</time>
                      </span>
                      <span className="inbox-row-preview">
                        {conversation.visitorEmail || conversation.linkLabel || "—"}
                      </span>
                      <span className="inbox-row-meta">
                        {conversation.linkLabel === ""
                          ? "Chatbot sans nom"
                          : conversation.linkLabel}
                        <span>·</span>
                        {conversation.messageCount} message(s)
                      </span>
                    </span>
                    <span className="inbox-row-status">
                      {conversation.awaitingOperator ? (
                        <span className="badge warn">à répondre</span>
                      ) : conversation.archivee ? (
                        <span className="badge muted">archivée</span>
                      ) : conversation.interventionMode === "human" ? (
                        <span className="badge orange">humain</span>
                      ) : conversation.statut === "finalisee" ? (
                        <span className="badge muted">finalisée</span>
                      ) : (
                        <span className="badge">IA</span>
                      )}
                    </span>
                  </Link>
                  <ConversationActionsMenu
                    conversationId={conversation.id}
                    prospectHref={prospectHref}
                    archivee={conversation.archivee}
                    canWrite={canWrite}
                    canGenerateFiche={canGenerateFiche}
                    canViewLeads={canViewLeads}
                    mode="list"
                    detailHref={detailHref(conversation.id)}
                    triggerClassName="icon-btn inbox-row-menu-trigger"
                    panelClassName="inbox-row-menu-panel"
                    onChanged={() => void load()}
                  />
                </div>
              );
            })
          )}
        </div>

        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={pagination.setPage}
          label="Pagination des conversations"
        />
      </aside>

      <div className="inbox-thread">
        {selectedId === null ? (
          <div className="inbox-thread-empty">
            <span className="inbox-thread-icon" aria-hidden>
              ▢
            </span>
            <h2>Sélectionnez une conversation</h2>
            <p>Choisissez une discussion à gauche pour afficher les messages et le contexte.</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
