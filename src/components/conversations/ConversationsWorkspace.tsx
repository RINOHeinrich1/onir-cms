"use client";

import Link from "next/link";
import { useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { LinkFilter } from "@/components/ui/LinkFilter";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import { usePagination } from "@/components/ui/use-pagination";
import { type ConversationFilter, parseConversationFilter } from "@/domain/entities/chat";
import type { ConversationRowDto } from "./types";

const FILTRES: { key: ConversationFilter; label: string }[] = [
  { key: "en_cours", label: "En cours" },
  { key: "finalisees", label: "Finalisées" },
  { key: "toutes", label: "Toutes" },
  { key: "archivees", label: "Archivées" },
];

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

/** Inbox desktop/mobile : liste persistante à gauche, conversation à droite. */
export function ConversationsWorkspace({
  children,
  linkLabels,
}: {
  children: ReactNode;
  linkLabels: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = useSelectedLayoutSegment();
  const listedFilter = parseConversationFilter(
    searchParams.get("filtre") ?? (selectedId !== null ? "toutes" : undefined),
  );
  const liens = searchParams.getAll("lien");
  const lienKey = liens.join("\u0000");
  const [conversations, setConversations] = useState<ConversationRowDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  useToastOnMessage(error);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const params = new URLSearchParams({ filtre: listedFilter });
      const labels = lienKey === "" ? [] : lienKey.split("\u0000");
      for (const lien of labels) params.append("lien", lien);
      const response = await fetch(`/api/conversations?${params.toString()}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        conversations?: ConversationRowDto[];
        error?: string;
      };
      if (!response.ok || json.conversations === undefined) {
        setError(json.error ?? "Impossible de charger les conversations");
        return;
      }
      setConversations(json.conversations);
    } catch {
      setError("Impossible de charger les conversations");
    }
  }, [listedFilter, lienKey]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const query = search.trim().toLocaleLowerCase("fr");
  const filtered = (conversations ?? []).filter((conversation) => {
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
  const pagination = usePagination(filtered, 15, `${search}|${listedFilter}|${lienKey}`);
  const nowIso = new Date().toISOString();

  const setFilter = (next: ConversationFilter): void => {
    const params = new URLSearchParams();
    params.set("filtre", next);
    for (const lien of liens) params.append("lien", lien);
    const target = selectedId === null ? "/conversations" : `/conversations/${selectedId}`;
    router.push(`${target}?${params.toString()}`, { scroll: false });
  };

  const detailHref = (id: string): string => {
    const params = new URLSearchParams({ filtre: listedFilter });
    for (const lien of liens) params.append("lien", lien);
    return `/conversations/${id}?${params.toString()}`;
  };

  return (
    <div className={`conversations-workspace ${selectedId === null ? "" : "is-detail"}`}>
      <aside className="inbox-sidebar" aria-label="Liste des conversations">
        <div className="inbox-sidebar-head">
          <div>
            <span className="eyebrow">Prospection</span>
            <h1 className="inbox-title">Conversations</h1>
          </div>
          <span className="inbox-count">
            {conversations === null ? "…" : `${conversations.length} discussion(s)`}
          </span>
        </div>

        <nav className="subtabs inbox-tabs" aria-label="Filtrer les conversations">
          {FILTRES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`subtab ${listedFilter === item.key ? "active" : ""}`}
              aria-pressed={listedFilter === item.key}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="inbox-filters">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un visiteur, un email…"
            label="Rechercher une conversation"
          />
          <LinkFilter
            basePath={selectedId === null ? "/conversations" : `/conversations/${selectedId}`}
            value={liens}
            labels={linkLabels}
            preserve={{ filtre: listedFilter }}
          />
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
              return (
                <Link
                  key={conversation.id}
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
                      {conversation.linkLabel === "" ? "Chatbot sans nom" : conversation.linkLabel}
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
