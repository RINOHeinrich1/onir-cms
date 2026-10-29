"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { confirmDialog } from "@/components/ui/confirm";
import { FloatingMenu } from "@/components/ui/FloatingMenu";
import { useToast, useToastOnMessage } from "@/components/ui/ToastProvider";
import {
  OPEN_CONVERSATION_INFO_EVENT,
  OPEN_CONVERSATION_SUMMARY_EVENT,
} from "./ConversationInfoPanel";

type ConversationMenuMode = "detail" | "list";

/**
 * Menu d'actions unique pour le header d'une conversation et la liste.
 * En mode détail, les panneaux s'ouvrent dans la page ; en mode liste, on
 * navigue vers le détail avec le panneau demandé.
 */
export function ConversationActionsMenu({
  conversationId,
  prospectHref,
  archivee,
  canWrite,
  canGenerateFiche,
  canViewLeads,
  mode = "detail",
  detailHref,
  triggerClassName = "icon-btn",
  panelClassName = "conversation-actions-menu-panel",
  onChanged,
}: {
  conversationId: string;
  prospectHref: string | null;
  archivee: boolean;
  canWrite: boolean;
  canGenerateFiche: boolean;
  canViewLeads: boolean;
  mode?: ConversationMenuMode;
  detailHref?: string;
  triggerClassName?: string;
  panelClassName?: string;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useToastOnMessage(error);

  const afterChange = (): void => {
    if (onChanged !== undefined) onChanged();
    else router.refresh();
  };

  const archive = async (): Promise<void> => {
    const next = !archivee;
    if (
      next &&
      !(await confirmDialog(
        "Archiver cette conversation ? Elle sera masquée par défaut (filtre « Archivées »).",
      ))
    ) {
      return;
    }
    setPending("archive");
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archivee: next }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(json.error ?? "Action impossible");
        return;
      }
      toast.success(next ? "Conversation archivée." : "Conversation désarchivée.");
      afterChange();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(null);
    }
  };

  const generate = async (): Promise<void> => {
    if (
      !(await confirmDialog(
        "Générer la fiche de prospection à partir de cette conversation ? L'IA analyse l'échange.",
      ))
    ) {
      return;
    }
    setPending("generate");
    setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/fiche`, {
        method: "POST",
      });
      const json = (await response.json()) as { fiche?: { id: string }; error?: string };
      if (!response.ok || json.fiche === undefined) {
        setError(json.error ?? "Génération impossible");
        return;
      }
      toast.success("Fiche de prospection générée.");
      if (canViewLeads) router.push(`/leads/${json.fiche.id}`);
      else afterChange();
    } catch {
      setError("Erreur réseau, veuillez réessayer");
    } finally {
      setPending(null);
    }
  };

  const panelHref = (panel: "info" | "summary"): string | null => {
    if (mode !== "list" || detailHref === undefined) return null;
    const separator = detailHref.includes("?") ? "&" : "?";
    return `${detailHref}${separator}panel=${panel}`;
  };

  const summaryHref = panelHref("summary");
  const infoHref = panelHref("info");

  return (
    <FloatingMenu
      label="Actions de la conversation"
      triggerClassName={triggerClassName}
      panelClassName={panelClassName}
    >
      {prospectHref !== null ? <Link href={prospectHref}>Voir le prospect</Link> : null}
      {summaryHref !== null ? (
        <Link href={summaryHref}>Résumé</Link>
      ) : (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_CONVERSATION_SUMMARY_EVENT))}
        >
          Résumé
        </button>
      )}
      {infoHref !== null ? (
        <Link href={infoHref}>Informations</Link>
      ) : (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_CONVERSATION_INFO_EVENT))}
        >
          Informations
        </button>
      )}
      {canGenerateFiche ? (
        <button type="button" disabled={pending !== null} onClick={() => void generate()}>
          {pending === "generate" ? "Génération…" : "Générer la fiche"}
        </button>
      ) : null}
      {canWrite ? (
        <button type="button" disabled={pending !== null} onClick={() => void archive()}>
          {pending === "archive" ? "Enregistrement…" : archivee ? "Désarchiver" : "Archiver"}
        </button>
      ) : null}
    </FloatingMenu>
  );
}
