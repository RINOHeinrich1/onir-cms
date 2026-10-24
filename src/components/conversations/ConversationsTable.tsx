"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LinkFilter } from "@/components/ui/LinkFilter";
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
  const [pending, setPending] = useState<string | null>(null);

  const generate = async (conversation: ConversationRowDto): Promise<void> => {
    if (
      !window.confirm(
        "Générer une fiche de prospection à partir de cette conversation ? L'IA analyse l'échange.",
      )
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
      router.push(`/fiches/${json.fiche.id}`);
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
      !window.confirm(
        "Archiver cette conversation ? Elle sera masquée par défaut (filtre « Archivées »).",
      )
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

      <LinkFilter
        basePath="/conversations"
        value={lien}
        labels={linkLabels}
        preserve={{ filtre }}
      />

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Visiteur</th>
              <th>Lien</th>
              <th>Statut</th>
              <th>Messages</th>
              <th>Inactivité</th>
              <th>Reçue le</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {initialConversations.map((conversation) => {
              const reference = conversation.lastMessageAt ?? conversation.createdAt;
              const busy = pending === conversation.id;
              return (
                <tr
                  key={conversation.id}
                  className={conversation.archivee ? "row-archivee" : undefined}
                >
                  <td>
                    <strong>
                      {conversation.visitorNom ||
                        (conversation.visitorEmail === "" ? "Anonyme" : "—")}
                    </strong>
                    <div className="muted-text">{conversation.visitorEmail || "—"}</div>
                  </td>
                  <td>
                    {conversation.linkLabel === "" ? (
                      <span className="muted-text">lien sans nom</span>
                    ) : (
                      conversation.linkLabel
                    )}
                    <div className="muted-text">
                      <span className="badge muted">{conversation.linkType}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${conversation.statut === "finalisee" ? "muted" : ""}`}>
                      {conversation.statut === "finalisee" ? "finalisée" : "en cours"}
                    </span>
                    {conversation.archivee ? (
                      <div>
                        <span className="badge muted">archivée</span>
                      </div>
                    ) : null}
                  </td>
                  <td>{conversation.messageCount}</td>
                  <td>{since(reference, nowIso)}</td>
                  <td>{new Date(conversation.createdAt).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <div className="tools">
                      <a className="btn small" href={`/conversations/${conversation.id}`}>
                        Ouvrir
                      </a>
                      {canWrite ? (
                        <>
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={busy}
                            onClick={() => void generate(conversation)}
                          >
                            {busy ? "…" : "Générer la fiche"}
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            disabled={busy}
                            onClick={() => void toggleArchive(conversation)}
                          >
                            {conversation.archivee ? "Désarchiver" : "Archiver"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            {initialConversations.length === 0 ? (
              <tr>
                <td colSpan={7}>Aucune conversation.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
