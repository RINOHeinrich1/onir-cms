"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { LinkFilter } from "@/components/ui/LinkFilter";
import { SearchInput } from "@/components/ui/SearchInput";
import { useToastOnMessage } from "@/components/ui/ToastProvider";
import type { ConversationFilter } from "@/domain/entities/chat";
import type { ConversationRowDto } from "./types";

const FILTRES: readonly { key: ConversationFilter; label: string }[] = [
  { key: "en_cours", label: "En cours" },
  { key: "finalisees", label: "Finalisées" },
  { key: "toutes", label: "Toutes" },
  { key: "archivees", label: "Archivées" },
];

/** Durée écoulée courte (déterministe : `nowIso` fourni par le serveur). */
function since(fromIso: string, nowIso: string): string {
  const diff = Math.max(0, new Date(nowIso).getTime() - new Date(fromIso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} j`;
}

/**
 * Table des conversations : filtre par statut/archivage, inactivité, ouverture,
 * archivage et génération de fiche sur la ligne (US-CONVERS-001/002/003).
 */
export function ConversationsTable({
  initialConversations,
  filtre,
  nowIso,
  canWrite,
  lien,
  linkLabels,
}: {
  initialConversations: ConversationRowDto[];
  filtre: ConversationFilter;
  nowIso: string;
  canWrite: boolean;
  lien: string | null;
  linkLabels: string[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);
  const [pending, setPending] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("fr");
  const visibleConversations = initialConversations.filter((conversation) => {
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

  // Le badge « À répondre » doit rester frais sans action manuelle.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);

  const generate = async (conversation: ConversationRowDto): Promise<void> => {
    if (
      !(await confirmDialog(
        "Générer une fiche de prospection à partir de cette conversation ? L'IA analyse l'échange.",
      ))
    ) {
      return;
    }
    setPending(conversation.id);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}/fiche`, {
        method: "POST",
      });
      const json = (await response.json()) as { fiche?: { id: string }; error?: string };
      if (!response.ok || json.fiche === undefined) {
        setError(json.error ?? "Génération impossible");
        return;
      }
      router.push(`/leads/${json.fiche.id}`);
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(null);
    }
  };

  const toggleArchive = async (conversation: ConversationRowDto): Promise<void> => {
    const archivee = !conversation.archivee;
    if (
      archivee &&
      !(await confirmDialog(
        "Archiver cette conversation ? Elle sera masquée par défaut (filtre « Archivées »).",
      ))
    ) {
      return;
    }
    setPending(conversation.id);
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivee }),
      });
      if (!response.ok) {
        const json = (await response.json()) as { error?: string };
        setError(json.error ?? "Action impossible");
        return;
      }
      router.refresh();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="conversations-admin">
      {error !== null ? <p className="alert error">{error}</p> : null}

      <nav className="subtabs" aria-label="Filtrer les conversations">
        {FILTRES.map((item) => {
          const params = new URLSearchParams({ filtre: item.key });
          if (lien !== null) params.set("lien", lien);
          return (
            <a
              key={item.key}
              href={`/conversations?${params.toString()}`}
              className={`subtab ${filtre === item.key ? "active" : ""}`}
              aria-current={filtre === item.key ? "page" : undefined}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="list-filters">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un visiteur, un email…"
          label="Rechercher une conversation"
        />
        <LinkFilter
          basePath="/conversations"
          value={lien}
          labels={linkLabels}
          preserve={{ filtre }}
        />
      </div>

      <div className="conversation-list">
        {visibleConversations.map((conversation) => {
          const reference = conversation.lastMessageAt ?? conversation.createdAt;
          const busy = pending === conversation.id;
          const displayName =
            conversation.visitorNom || (conversation.visitorEmail === "" ? "Anonyme" : "Visiteur");
          const initials = displayName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? "")
            .join("");
          return (
            <article
              key={conversation.id}
              className={`conversation-row ${conversation.archivee ? "is-archived" : ""}`}
            >
              <div className="conversation-primary">
                <span className="conversation-avatar" aria-hidden>
                  {initials || "?"}
                </span>
                <div className="conversation-identity">
                  <div className="conversation-name">
                    <strong>{displayName}</strong>
                    <span className={`badge ${conversation.statut === "finalisee" ? "muted" : ""}`}>
                      {conversation.statut === "finalisee" ? "finalisée" : "en cours"}
                    </span>
                    {conversation.interventionMode === "human" ? (
                      <span className="badge orange">humain</span>
                    ) : null}
                    {conversation.awaitingOperator ? (
                      <span className="badge warn">à répondre</span>
                    ) : null}
                    {conversation.archivee ? <span className="badge muted">archivée</span> : null}
                  </div>
                  <div className="conversation-contact">
                    {conversation.visitorEmail === "" ? "—" : conversation.visitorEmail}
                  </div>
                  <div className="conversation-meta">
                    <span>
                      {conversation.linkLabel === "" ? "lien sans nom" : conversation.linkLabel}
                    </span>
                    <span>{conversation.messageCount} message(s)</span>
                    <span>il y a {since(reference, nowIso)}</span>
                    {conversation.assignedOperatorName !== null ||
                    conversation.lastOperatorName !== null ? (
                      <span>
                        Opérateur :{" "}
                        {conversation.assignedOperatorName ?? conversation.lastOperatorName}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="conversation-side">
                <span className="conversation-date">
                  {new Date(conversation.createdAt).toLocaleDateString("fr-FR")}
                </span>
                <div className="conversation-actions">
                  <a className="btn small" href={`/conversations/${conversation.id}`}>
                    Ouvrir
                  </a>
                  {canWrite ? (
                    <details className="action-menu">
                      <summary className="btn ghost small" aria-label="Autres actions">
                        ⋯
                      </summary>
                      <div className="action-menu-panel">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void generate(conversation)}
                        >
                          {busy ? "Génération…" : "Générer la fiche"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void toggleArchive(conversation)}
                        >
                          {conversation.archivee ? "Désarchiver" : "Archiver"}
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
        {visibleConversations.length === 0 ? (
          <div className="empty-state">
            <strong>
              {initialConversations.length === 0 ? "Aucune conversation." : "Aucun résultat."}
            </strong>
            <span>
              {initialConversations.length === 0
                ? "Les nouvelles discussions apparaîtront ici."
                : "Modifiez la recherche ou les filtres."}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
